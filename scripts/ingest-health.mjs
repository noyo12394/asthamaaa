/**
 * Ingest CDC PLACES county-level health indicators.
 *
 * Source: CDC PLACES (Local Data for Better Health), county release, via the
 * Socrata Open Data API on data.cdc.gov. No API key required for modest use.
 * Dataset: "PLACES: Local Data for Better Health, County Data" — the dataset
 * id changes per release year; the catalog is queried first so this script
 * keeps working across releases.
 *
 * Output: src/data/health.json (replaces the fallback seed).
 * Requires network access to data.cdc.gov.
 *
 * Run: npm run ingest:health
 */
import fs from "node:fs";
import path from "node:path";

const CATALOG_URL =
  "https://api.us.socrata.com/api/catalog/v1?domains=data.cdc.gov&search_context=data.cdc.gov&q=PLACES%20county%20data%20GIS%20friendly&limit=10";

// PLACES measure ids -> our field names (crude prevalence, adults 18+)
const MEASURES = {
  CASTHMA: "asthma",
  COPD: "copd",
  DIABETES: "diabetes",
  BPHIGH: "hypertension",
  CHD: "heartDisease",
  OBESITY: "obesity",
  CANCER: "cancer",
};

async function findDataset() {
  const res = await fetch(CATALOG_URL);
  if (!res.ok) throw new Error(`Catalog query failed: ${res.status}`);
  const cat = await res.json();
  const hit = cat.results?.find((r) =>
    /PLACES.*County Data/i.test(r.resource?.name ?? "")
  );
  if (!hit) throw new Error("Could not locate PLACES county dataset in catalog");
  return { id: hit.resource.id, name: hit.resource.name };
}

async function main() {
  const ds = await findDataset();
  console.log(`Using dataset ${ds.id}: ${ds.name}`);

  const byCounty = new Map();
  const measureIds = Object.keys(MEASURES);
  for (const measure of measureIds) {
    let offset = 0;
    const pageSize = 5000;
    for (;;) {
      const url =
        `https://data.cdc.gov/resource/${ds.id}.json` +
        `?$select=locationid,measureid,data_value,year` +
        `&$where=measureid='${measure}' AND datavaluetypeid='CrdPrv'` +
        `&$limit=${pageSize}&$offset=${offset}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`PLACES fetch failed: ${res.status}`);
      const rows = await res.json();
      for (const row of rows) {
        const fips = String(row.locationid).padStart(5, "0");
        const rec = byCounty.get(fips) ?? { countyFips: fips };
        rec[MEASURES[measure]] = parseFloat(row.data_value);
        rec.year = row.year ?? rec.year;
        byCounty.set(fips, rec);
      }
      if (rows.length < pageSize) break;
      offset += pageSize;
    }
    console.log(`  ${measure}: done (${byCounty.size} counties so far)`);
  }

  const records = [...byCounty.values()].sort((a, b) =>
    a.countyFips.localeCompare(b.countyFips)
  );
  const outPath = path.join(process.cwd(), "src", "data", "health.json");
  fs.writeFileSync(
    outPath,
    JSON.stringify(
      {
        source: `CDC PLACES county release (${ds.name})`,
        sourceUrl: `https://data.cdc.gov/d/${ds.id}`,
        vintage: records[0]?.year ?? "see dataset",
        status: "official",
        notes:
          "Model-based small-area estimates (crude prevalence, adults 18+). Not direct measurements; see PLACES methodology.",
        generatedAt: new Date().toISOString(),
        measures: Object.values(MEASURES),
        unit: "% of adults (model-based prevalence)",
        records,
      },
      null,
      0
    )
  );
  console.log(`Wrote ${records.length} county health records to ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
