/**
 * Generate clearly-labeled FALLBACK seed data for monitors, county health
 * indicators, and vulnerability indicators.
 *
 * WHY THIS EXISTS
 * ---------------
 * The real datasets (EPA/AirNow monitor metadata, CDC PLACES, CDC/ATSDR SVI)
 * require network access to epa.gov / airnowtech.org / cdc.gov, which is not
 * available in every build environment. This script produces deterministic
 * placeholder records so the application is fully functional out of the box,
 * with every record tagged `status: "fallback"` so the UI and source trail can
 * (and do) display them as non-authoritative.
 *
 * Replace this data by running the real ingestion scripts:
 *   npm run ingest:monitors        (AirNow monitoring site list)
 *   npm run ingest:health          (CDC PLACES county release)
 *   npm run ingest:vulnerability   (CDC/ATSDR SVI county release)
 *
 * HOW VALUES ARE MADE
 * -------------------
 * Health/vulnerability values are the published national baseline for each
 * measure with a deterministic county-level perturbation seeded by FIPS code.
 * They are NOT county-specific measurements and are labeled accordingly.
 * Monitor placements are county centroids (real coordinates, synthetic sites).
 */
import fs from "node:fs";
import path from "node:path";

const dataDir = path.join(process.cwd(), "src", "data");
const countiesFile = JSON.parse(
  fs.readFileSync(path.join(dataDir, "counties.json"), "utf8")
);
const counties = countiesFile.counties;

/** Deterministic hash -> [0,1) so fallback data is stable across runs. */
function unitHash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

/** Baseline value +/- spread, seeded by key. */
function jitter(baseline, spread, key) {
  const u = unitHash(key) * 2 - 1; // [-1, 1)
  return Math.round(baseline * (1 + u * spread) * 10) / 10;
}

const generatedAt = new Date().toISOString();

// ---------------------------------------------------------------------------
// Monitors: one synthetic site per county in the focus region (Mid-Atlantic /
// Northeast), plus sparse placeholder coverage elsewhere so nationwide search
// still finds a "nearest monitor" (clearly labeled as seed placement).
// ---------------------------------------------------------------------------
const FOCUS_STATES = new Set(["PA", "NJ", "NY", "DE", "MD", "CT"]);
const EXTRA_TOWERS = new Set([
  "42077", // Lehigh PA (Allentown)
  "42095", // Northampton PA (Bethlehem/Easton)
  "42101", // Philadelphia PA
  "34007", // Camden NJ
  "36061", // New York NY
  "42003", // Allegheny PA (Pittsburgh)
]);

const monitors = [];
const perState = new Map();
for (const c of counties) {
  const inFocus = FOCUS_STATES.has(c.state);
  const stateCount = perState.get(c.state) ?? 0;
  // Outside the focus region keep 3 placeholder sites per state.
  if (!inFocus && stateCount >= 3) continue;
  perState.set(c.state, stateCount + 1);

  const siteCount = EXTRA_TOWERS.has(c.fips) ? 3 : 1;
  for (let i = 0; i < siteCount; i++) {
    // Offset additional sites deterministically ~2-8 km from the centroid.
    const dLat = i === 0 ? 0 : (unitHash(c.fips + ":lat" + i) - 0.5) * 0.12;
    const dLng = i === 0 ? 0 : (unitHash(c.fips + ":lng" + i) - 0.5) * 0.15;
    monitors.push({
      id: `seed-${c.fips}-${i + 1}`,
      source: "seed-fallback",
      monitorCode: `SEED-${c.fips}-${i + 1}`,
      name: `${c.name} ${c.lsad === "County" ? "County" : c.lsad} seed site ${i + 1}`,
      lat: Math.round((c.centroidLat + dLat) * 1000) / 1000,
      lng: Math.round((c.centroidLng + dLng) * 1000) / 1000,
      county: c.name,
      countyFips: c.fips,
      state: c.state,
      pollutants:
        unitHash(c.fips + ":poll" + i) > 0.5 ? ["PM2.5", "O3"] : ["PM2.5", "O3", "NO2"],
      active: true,
      status: "fallback",
    });
  }
}

fs.writeFileSync(
  path.join(dataDir, "monitors.json"),
  JSON.stringify(
    {
      source: "Seed fallback — synthetic site placements at county centroids",
      sourceUrl: null,
      vintage: "synthetic",
      status: "fallback",
      notes:
        "NOT the official EPA/AirNow site list. Placeholder placements so monitor-distance logic works before real ingestion. Run `npm run ingest:monitors` with network access to replace with the AirNow monitoring_site_locations dataset.",
      generatedAt,
      monitors,
    },
    null,
    0
  )
);

// ---------------------------------------------------------------------------
// County health indicators: national baseline prevalence (CDC PLACES-style
// measures, adults) with deterministic per-county perturbation. Labeled
// fallback; not county-specific measurements.
// ---------------------------------------------------------------------------
const HEALTH_BASELINES = {
  asthma: [10.0, 0.2],
  copd: [6.5, 0.3],
  diabetes: [11.5, 0.25],
  hypertension: [32.5, 0.15],
  heartDisease: [6.0, 0.3],
  obesity: [33.5, 0.2],
  cancer: [7.0, 0.2],
};

const health = counties.map((c) => {
  const rec = { countyFips: c.fips };
  for (const [measure, [base, spread]] of Object.entries(HEALTH_BASELINES)) {
    rec[measure] = jitter(base, spread, `${c.fips}:${measure}`);
  }
  return rec;
});

fs.writeFileSync(
  path.join(dataDir, "health.json"),
  JSON.stringify(
    {
      source: "Seed fallback — national baseline prevalence with synthetic county variation",
      sourceUrl: null,
      vintage: "national baselines circa 2023; county variation synthetic",
      status: "fallback",
      notes:
        "NOT CDC PLACES county estimates. Values are national adult prevalence baselines perturbed deterministically per county so UI/scoring paths are exercised. Run `npm run ingest:health` with network access to replace with the real CDC PLACES county release.",
      generatedAt,
      measures: Object.keys(HEALTH_BASELINES),
      unit: "% of adults (model-style prevalence)",
      records: health,
    },
    null,
    0
  )
);

// ---------------------------------------------------------------------------
// Vulnerability indicators: SVI-style composite + component measures.
// ---------------------------------------------------------------------------
const VULN_BASELINES = {
  poverty: [12.5, 0.4],
  elderly: [17.0, 0.3],
  children: [22.0, 0.25],
  disability: [13.0, 0.3],
  limitedEnglish: [4.0, 0.8],
  noVehicle: [8.0, 0.6],
};

const vulnerability = counties.map((c) => {
  const rec = { countyFips: c.fips };
  for (const [measure, [base, spread]] of Object.entries(VULN_BASELINES)) {
    rec[measure] = jitter(base, spread, `${c.fips}:${measure}`);
  }
  // Composite percentile in [0,1], SVI-like, deterministic.
  rec.svi = Math.round(unitHash(`${c.fips}:svi`) * 1000) / 1000;
  return rec;
});

fs.writeFileSync(
  path.join(dataDir, "vulnerability.json"),
  JSON.stringify(
    {
      source: "Seed fallback — national baseline shares with synthetic county variation",
      sourceUrl: null,
      vintage: "national baselines circa 2023; county variation synthetic",
      status: "fallback",
      notes:
        "NOT CDC/ATSDR SVI. The `svi` field is a synthetic percentile so equity-weighting code paths are exercised. Run `npm run ingest:vulnerability` with network access to replace with the real CDC/ATSDR SVI county release.",
      generatedAt,
      unit: "% of population unless noted; svi is a 0-1 percentile",
      records: vulnerability,
    },
    null,
    0
  )
);

console.log(
  `Fallback seed written: ${monitors.length} monitors, ${health.length} health records, ${vulnerability.length} vulnerability records.`
);
