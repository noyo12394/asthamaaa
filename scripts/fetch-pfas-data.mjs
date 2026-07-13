#!/usr/bin/env node
/**
 * Fetch real PFAS water data for the pilot (DE, MD, NJ, NY, PA).
 *
 * Run this on any machine WITH internet access to epa.gov / waterqualitydata.us
 * (the Claude build sandbox blocks those hosts, which is why the data isn't
 * bundled yet). Outputs raw CSVs into ./data/pfas/raw — nothing is modified.
 *
 *   node scripts/fetch-pfas-data.mjs
 *
 * Then hand the CSVs back and they'll be validated into the master schema and
 * rendered as a labeled, precision-aware map on the /water-pilot tab.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const OUT = join(process.cwd(), "data", "pfas", "raw");

// FIPS state codes for the Water Quality Portal.
const STATES = { DE: "10", MD: "24", NJ: "34", NY: "36", PA: "42" };

// A starter set of PFAS analytes (extend as needed).
const PFAS = [
  "Perfluorooctanoic acid",
  "Perfluorooctanesulfonic acid",
  "Perfluorohexanesulfonic acid",
  "Perfluorononanoic acid",
  "Hexafluoropropylene oxide dimer acid",
];

const stamp = new Date().toISOString().slice(0, 10);

async function get(url) {
  const res = await fetch(url, { headers: { "User-Agent": "pass-pfas-pilot/1.0" } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res.text();
}

async function fetchWQP() {
  // One combined pull per state: PFAS characteristics, water media only.
  for (const [abbr, fips] of Object.entries(STATES)) {
    const params = new URLSearchParams({
      statecode: `US:${fips}`,
      sampleMedia: "Water",
      mimeType: "csv",
      sorted: "no",
      dataProfile: "resultPhysChem",
    });
    for (const c of PFAS) params.append("characteristicName", c);
    const url = `https://www.waterqualitydata.us/data/Result/search?${params.toString()}`;
    process.stdout.write(`WQP ${abbr} … `);
    try {
      const csv = await get(url);
      const file = join(OUT, `WQP_PFAS_water_${abbr}_${stamp}.csv`);
      await writeFile(file, csv);
      const rows = Math.max(0, csv.split("\n").length - 1);
      console.log(`ok (${rows} rows) → ${file}`);
    } catch (err) {
      console.log(`FAILED: ${err.message}`);
    }
  }
}

function ucmrInstructions() {
  console.log(`
UCMR 5 (drinking water) — download manually, it is a single national file:
  1. Open https://www.epa.gov/dwucmr/occurrence-data-unregulated-contaminant-monitoring-rule
  2. Download the latest "UCMR 5" occurrence data ZIP (national).
  3. Unzip; keep the results file. Save as:
       data/pfas/raw/UCMR5_national_${stamp}.txt
  4. Filter to State ∈ {DE, MD, NJ, NY, PA} during validation (do not edit the raw file).
Record: page title, agency (EPA OGWDW), the release date shown on the page, and today's date.
`);
}

async function main() {
  await mkdir(OUT, { recursive: true });
  console.log(`Output dir: ${OUT}\n`);
  await fetchWQP();
  ucmrInstructions();
  console.log("Done. Keep raw files unmodified; validation happens in a separate step.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
