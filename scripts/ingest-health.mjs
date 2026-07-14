/**
 * Ingest CDC PLACES 2025 county-level model-based prevalence estimates.
 *
 * The GIS-friendly county release is wide-format: each county is one row and
 * each crude-prevalence measure is a field. Pinning the verified dataset id and
 * selecting explicit columns prevents a future catalog result from silently
 * changing the schema beneath this pipeline.
 */
import fs from "node:fs";
import path from "node:path";

const DATASET_ID = "i46a-9kgh";
const API_URL = `https://data.cdc.gov/resource/${DATASET_ID}.json`;
const SOURCE_URL = `https://data.cdc.gov/d/${DATASET_ID}`;
const FALLBACK_DATASET_ID = "d3i6-k6z5";
const FALLBACK_API_URL = `https://data.cdc.gov/resource/${FALLBACK_DATASET_ID}.json`;
const PAGE_SIZE = 5000;

const MEASURES = {
  casthma_crudeprev: "asthma",
  copd_crudeprev: "copd",
  diabetes_crudeprev: "diabetes",
  bphigh_crudeprev: "hypertension",
  chd_crudeprev: "heartDisease",
  obesity_crudeprev: "obesity",
  cancer_crudeprev: "cancer",
};

function asPrevalence(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && number <= 100 ? number : null;
}

async function fetchRows(apiUrl) {
  const columns = ["countyfips", ...Object.keys(MEASURES)].join(",");
  const rows = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const query = new URLSearchParams({
      "$select": columns,
      "$where": "countyfips is not null",
      "$order": "countyfips",
      "$limit": String(PAGE_SIZE),
      "$offset": String(offset),
    });
    const response = await fetch(`${apiUrl}?${query}`);
    if (!response.ok) {
      throw new Error(`CDC PLACES fetch failed: ${response.status} ${response.statusText}`);
    }
    const page = await response.json();
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

async function main() {
  console.log(`Fetching CDC PLACES dataset ${DATASET_ID} ...`);
  const [rows, fallbackRows] = await Promise.all([
    fetchRows(API_URL),
    fetchRows(FALLBACK_API_URL),
  ]);
  const fallbackByFips = new Map(
    fallbackRows.map((row) => [String(row.countyfips ?? "").padStart(5, "0"), row])
  );
  let fallbackCountyCount = 0;
  const records = rows
    .map((row) => {
      const countyFips = String(row.countyfips ?? "").padStart(5, "0");
      if (!/^\d{5}$/.test(countyFips)) return null;
      const fallbackRow = fallbackByFips.get(countyFips);
      let usedFallback = false;
      const record = Object.fromEntries([
        ["countyFips", countyFips],
        ...Object.entries(MEASURES).map(([source, target]) => [
          target,
          asPrevalence(row[source]) ?? (() => {
            const value = asPrevalence(fallbackRow?.[source]);
            if (value != null) usedFallback = true;
            return value;
          })(),
        ]),
      ]);
      if (usedFallback) fallbackCountyCount += 1;
      record.year = usedFallback ? "2024 release fallback" : "2025 release";
      return record;
    })
    .filter(Boolean);

  const uniqueFips = new Set(records.map((record) => record.countyFips));
  const emptyRecords = records.filter((record) =>
    Object.values(MEASURES).every((measure) => record[measure] == null)
  );
  if (records.length < 3000 || uniqueFips.size !== records.length || emptyRecords.length > 0) {
    throw new Error(
      `CDC PLACES validation failed: ${records.length} rows, ${uniqueFips.size} unique FIPS, ${emptyRecords.length} empty profiles`
    );
  }

  const outPath = path.join(process.cwd(), "src", "data", "health.json");
  fs.writeFileSync(
    outPath,
    JSON.stringify({
      source: "CDC PLACES county releases (2025; 2024 where current estimates are unavailable)",
      sourceUrl: SOURCE_URL,
      vintage: `2025 release with 2024 fallback for ${fallbackCountyCount} counties; measure years vary by indicator`,
      status: "official",
      notes:
        `Model-based small-area estimates of crude prevalence among adults 18+, not direct measurements or individual diagnoses. The 2025 release has blank chronic-condition fields for some counties; ${fallbackCountyCount} county profiles use the official 2024 release and carry a per-record vintage.`,
      generatedAt: new Date().toISOString(),
      measures: Object.values(MEASURES),
      unit: "% of adults (model-based crude prevalence)",
      records,
    })
  );
  console.log(`Wrote ${records.length} county health records to ${outPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
