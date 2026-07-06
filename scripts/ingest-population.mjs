/**
 * Ingest county population + basic demographic shares.
 *
 * Sources (both Census-derived public mirrors on GitHub, reachable from most
 * build environments; refresh against api.census.gov ACS in production via
 * the live client in src/lib/population.ts):
 *  - balsama/us_counties_data: population, land area, density per county
 *  - plotly/datasets minoritymajority.csv: Census county characteristics
 *    (total population, % minority, % Black, % Hispanic)
 *
 * Output: src/data/population.json keyed by county FIPS.
 * Run: npm run ingest:population
 */
import fs from "node:fs";
import path from "node:path";

const POP_URL =
  "https://raw.githubusercontent.com/balsama/us_counties_data/master/data/counties.json";
const DEMO_URL = "https://raw.githubusercontent.com/plotly/datasets/master/minoritymajority.csv";

function parseCsvLine(line) {
  const out = [];
  let cur = "";
  let inQ = false;
  for (const ch of line) {
    if (ch === '"') inQ = !inQ;
    else if (ch === "," && !inQ) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

async function main() {
  console.log("Fetching population data...");
  const popRes = await fetch(POP_URL);
  if (!popRes.ok) throw new Error(`population fetch failed: ${popRes.status}`);
  const popData = await popRes.json();

  console.log("Fetching demographic data...");
  const demoRes = await fetch(DEMO_URL);
  if (!demoRes.ok) throw new Error(`demographics fetch failed: ${demoRes.status}`);
  const demoText = await demoRes.text();

  const records = {};
  for (const rec of Object.values(popData)) {
    const fips = String(rec.fips).padStart(5, "0");
    records[fips] = {
      population: rec.population ?? null,
      areaSqMi: rec.area ?? null,
      densityPerSqMi: rec.density ?? null,
      minorityPct: null,
      blackPct: null,
      hispanicPct: null,
    };
  }

  const lines = demoText.split("\n").filter(Boolean);
  const header = parseCsvLine(lines[0]);
  const idx = (n) => header.indexOf(n);
  const cols = {
    fips: idx("FIPS"),
    minority: idx("MinorityPCT"),
    black: idx("BlackPCT"),
    hispanic: idx("HispanicPCT"),
    pop: idx("TOT_POP"),
  };
  const pct = (s) => {
    const v = parseFloat(String(s).replace("%", ""));
    return Number.isFinite(v) ? v : null;
  };
  for (const line of lines.slice(1)) {
    const row = parseCsvLine(line);
    const fips = String(row[cols.fips]).padStart(5, "0");
    const rec = (records[fips] ??= {
      population: parseInt(row[cols.pop], 10) || null,
      areaSqMi: null,
      densityPerSqMi: null,
    });
    rec.minorityPct = pct(row[cols.minority]);
    rec.blackPct = pct(row[cols.black]);
    rec.hispanicPct = pct(row[cols.hispanic]);
  }

  const outPath = path.join(process.cwd(), "src", "data", "population.json");
  fs.writeFileSync(
    outPath,
    JSON.stringify({
      source:
        "US Census county population estimates (balsama/us_counties_data mirror) + Census county characteristics (plotly/datasets minoritymajority mirror)",
      sourceUrl: POP_URL,
      vintage: "Census estimates (mirror snapshots; refresh via ACS at runtime)",
      status: "official",
      notes:
        "Population/area/density per county plus % minority, % Black, % Hispanic. Mirror snapshots of Census products; the live ACS client refreshes population in production.",
      generatedAt: new Date().toISOString(),
      records,
    })
  );
  console.log(`Wrote ${Object.keys(records).length} county population records.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
