/**
 * Ingest the official AirNow v2 monitoring-site feed.
 *
 * Source contract:
 * https://docs.airnowapi.org/docs/MonitoringSiteV2FactSheet.pdf
 *
 * AirNow publishes preliminary, near-real-time regulatory and non-regulatory
 * monitor metadata. It is useful for site proximity and provenance, but is not
 * a substitute for quality-assured EPA AQS design values.
 */
import fs from "node:fs";
import path from "node:path";

const SOURCE_URL =
  "https://files.airnowtech.org/airnow/today/Monitoring_Site_Locations_V2.dat";

const COLUMNS = [
  "stationId",
  "aqsId",
  "fullAqsId",
  "parameter",
  "monitorType",
  "siteCode",
  "siteName",
  "status",
  "agencyId",
  "agencyName",
  "epaRegion",
  "latitude",
  "longitude",
  "elevation",
  "gmtOffset",
  "countryFips",
  "cbsaId",
  "cbsaName",
  "stateAqsCode",
  "stateAbbreviation",
  "countyAqsCode",
  "countyName",
];

const POLLUTANT_MAP = {
  "PM2.5": "PM2.5",
  PM25: "PM2.5",
  PM10: "PM10",
  OZONE: "O3",
  O3: "O3",
  NO2: "NO2",
  SO2: "SO2",
  CO: "CO",
};

function parseRow(line) {
  const values = line.split("|").map((value) => value.trim());
  if (values.length < COLUMNS.length) return null;
  return Object.fromEntries(COLUMNS.map((column, index) => [column, values[index]]));
}

function isUnitedStates(row) {
  return row.countryFips === "US" || row.countryFips === "840";
}

async function main() {
  console.log(`Fetching ${SOURCE_URL} ...`);
  const response = await fetch(SOURCE_URL);
  if (!response.ok) {
    throw new Error(`AirNow site feed failed: ${response.status} ${response.statusText}`);
  }

  const sites = new Map();
  const text = await response.text();
  for (const line of text.split(/\r?\n/)) {
    const row = parseRow(line);
    if (!row || !isUnitedStates(row)) continue;

    const pollutant = POLLUTANT_MAP[row.parameter.toUpperCase().replaceAll(" ", "")];
    if (!pollutant || row.status.toLowerCase() !== "active") continue;

    const lat = Number(row.latitude);
    const lng = Number(row.longitude);
    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      lat < -90 ||
      lat > 90 ||
      lng < -180 ||
      lng > 180 ||
      (lat === 0 && lng === 0)
    ) {
      continue;
    }

    const key = row.stationId || row.fullAqsId || row.aqsId;
    if (!key) continue;

    const stateCode = row.stateAqsCode.padStart(2, "0");
    const countyCode = row.countyAqsCode.padStart(3, "0");
    const countyFips = /^\d{2}$/.test(stateCode) && /^\d{3}$/.test(countyCode)
      ? `${stateCode}${countyCode}`
      : null;
    const existing = sites.get(key) ?? {
      id: `airnow-${key}`,
      source: "airnow",
      monitorCode: row.fullAqsId || row.aqsId || key,
      name: row.siteName || row.countyName || key,
      lat: Math.round(lat * 10000) / 10000,
      lng: Math.round(lng * 10000) / 10000,
      county: row.countyName || null,
      countyFips,
      state: row.stateAbbreviation || null,
      pollutants: [],
      active: true,
      status: "official",
    };
    if (!existing.pollutants.includes(pollutant)) existing.pollutants.push(pollutant);
    sites.set(key, existing);
  }

  const monitors = [...sites.values()]
    .map((monitor) => ({ ...monitor, pollutants: monitor.pollutants.sort() }))
    .sort((a, b) => a.id.localeCompare(b.id));
  if (monitors.length < 500) {
    throw new Error(`AirNow feed produced only ${monitors.length} active US sites`);
  }

  const outPath = path.join(process.cwd(), "src", "data", "monitors.json");
  fs.writeFileSync(
    outPath,
    JSON.stringify({
      source: "AirNow monitoring-site locations v2 (US EPA)",
      sourceUrl: SOURCE_URL,
      vintage: "live AirNow metadata feed; refreshed during ingestion",
      status: "official",
      notes:
        "Official AirNow site metadata. AirNow observations are preliminary and not fully quality-assured; monitor proximity is contextual, not an EPA confidence standard.",
      generatedAt: new Date().toISOString(),
      monitors,
    })
  );
  console.log(`Wrote ${monitors.length} active US monitoring sites to ${outPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
