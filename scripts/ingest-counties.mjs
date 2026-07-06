/**
 * Ingest US county boundaries and metadata.
 *
 * Source: US Census Bureau cartographic boundary file (2010, 20m resolution),
 * distributed as GeoJSON via the plotly/datasets mirror. County FIPS codes and
 * names are stable identifiers; geometry is intentionally generalized (20m) for
 * fast map rendering, not for legal boundary determination.
 *
 * Outputs:
 *   src/data/counties.json       — one record per county: fips, name, state, centroid
 *   src/data/county-shapes.json  — GeoJSON FeatureCollection, coords rounded to 3dp
 *
 * Run: npm run ingest:counties
 */
import fs from "node:fs";
import path from "node:path";

const SOURCE_URL =
  "https://raw.githubusercontent.com/plotly/datasets/master/geojson-counties-fips.json";

const STATE_FIPS = {
  "01": "AL", "02": "AK", "04": "AZ", "05": "AR", "06": "CA", "08": "CO",
  "09": "CT", "10": "DE", "11": "DC", "12": "FL", "13": "GA", "15": "HI",
  "16": "ID", "17": "IL", "18": "IN", "19": "IA", "20": "KS", "21": "KY",
  "22": "LA", "23": "ME", "24": "MD", "25": "MA", "26": "MI", "27": "MN",
  "28": "MS", "29": "MO", "30": "MT", "31": "NE", "32": "NV", "33": "NH",
  "34": "NJ", "35": "NM", "36": "NY", "37": "NC", "38": "ND", "39": "OH",
  "40": "OK", "41": "OR", "42": "PA", "44": "RI", "45": "SC", "46": "SD",
  "47": "TN", "48": "TX", "49": "UT", "50": "VT", "51": "VA", "53": "WA",
  "54": "WV", "55": "WI", "56": "WY", "72": "PR",
};

function round3(n) {
  return Math.round(n * 1000) / 1000;
}

function roundCoords(coords) {
  if (typeof coords[0] === "number") return coords.map(round3);
  return coords.map(roundCoords);
}

/** Area-weighted centroid of the largest ring (shoelace formula). */
function centroidOf(geometry) {
  const polys =
    geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  let best = null;
  let bestArea = -1;
  for (const poly of polys) {
    const ring = poly[0];
    let a = 0, cx = 0, cy = 0;
    for (let i = 0; i < ring.length - 1; i++) {
      const [x0, y0] = ring[i];
      const [x1, y1] = ring[i + 1];
      const cross = x0 * y1 - x1 * y0;
      a += cross;
      cx += (x0 + x1) * cross;
      cy += (y0 + y1) * cross;
    }
    a /= 2;
    const abs = Math.abs(a);
    if (abs > bestArea && abs > 0) {
      bestArea = abs;
      best = [cx / (6 * a), cy / (6 * a)];
    }
  }
  return best ?? [ring0(geometry)[0], ring0(geometry)[1]];
}

function ring0(geometry) {
  return geometry.type === "Polygon"
    ? geometry.coordinates[0][0]
    : geometry.coordinates[0][0][0];
}

async function main() {
  console.log(`Fetching ${SOURCE_URL} ...`);
  const res = await fetch(SOURCE_URL);
  if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
  const gj = await res.json();

  const meta = [];
  const features = [];
  for (const f of gj.features) {
    const fips = f.id;
    const stateAbbr = STATE_FIPS[f.properties.STATE];
    if (!stateAbbr) continue; // skip territories without a state mapping
    const [lng, lat] = centroidOf(f.geometry);
    meta.push({
      fips,
      name: f.properties.NAME,
      state: stateAbbr,
      stateFips: f.properties.STATE,
      lsad: f.properties.LSAD,
      centroidLat: round3(lat),
      centroidLng: round3(lng),
      areaSqMi: f.properties.CENSUSAREA,
    });
    features.push({
      type: "Feature",
      id: fips,
      properties: { fips, name: f.properties.NAME, state: stateAbbr },
      geometry: {
        type: f.geometry.type,
        coordinates: roundCoords(f.geometry.coordinates),
      },
    });
  }

  meta.sort((a, b) => a.fips.localeCompare(b.fips));
  features.sort((a, b) => a.id.localeCompare(b.id));

  const outDir = path.join(process.cwd(), "src", "data");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    path.join(outDir, "counties.json"),
    JSON.stringify(
      {
        source: "US Census Bureau cartographic boundary file (2010, 20m), plotly/datasets mirror",
        sourceUrl: SOURCE_URL,
        vintage: "2010 boundaries (county FIPS/names stable)",
        fetchedAt: new Date().toISOString(),
        counties: meta,
      },
      null,
      0
    )
  );
  fs.writeFileSync(
    path.join(outDir, "county-shapes.json"),
    JSON.stringify({ type: "FeatureCollection", features })
  );
  console.log(`Wrote ${meta.length} counties.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
