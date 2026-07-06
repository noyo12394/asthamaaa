/**
 * Ingest the official AirNow monitoring site list.
 *
 * Source: AirNow (US EPA) `monitoring_site_locations.dat` — pipe-delimited,
 * public, no API key required. Documented at
 * https://docs.airnowapi.org/docs/MonitoringSiteFactSheet.pdf
 *
 * Output: src/data/monitors.json (replaces the fallback seed).
 * Requires network access to files.airnowtech.org.
 *
 * Run: npm run ingest:monitors
 */
import fs from "node:fs";
import path from "node:path";

const SOURCE_URL =
  "https://files.airnowtech.org/airnow/today/monitoring_site_locations.dat";

// monitoring_site_locations.dat columns (pipe-delimited):
// 0 AQSID | 1 parameter name | 2 site code | 3 site name | 4 status |
// 5 agency id | 6 agency name | 7 EPA region | 8 latitude | 9 longitude |
// 10 elevation | 11 GMT offset | 12 country code | ... 16 city code |
// 17 city name | ... 20 state code | ... (county name at 22 in some vintages)
const POLLUTANT_MAP = {
  "PM2.5": "PM2.5",
  PM10: "PM10",
  OZONE: "O3",
  O3: "O3",
  NO2: "NO2",
  SO2: "SO2",
  CO: "CO",
};

async function main() {
  console.log(`Fetching ${SOURCE_URL} ...`);
  const res = await fetch(SOURCE_URL);
  if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);
  const text = await res.text();

  const sites = new Map();
  for (const line of text.split("\n")) {
    const cols = line.split("|");
    if (cols.length < 21) continue;
    const [aqsid, parameter, , siteName, status] = cols;
    const country = cols[12];
    if (country && country !== "US") continue;
    const pollutant = POLLUTANT_MAP[parameter?.toUpperCase()?.trim()];
    if (!pollutant) continue;
    const lat = parseFloat(cols[8]);
    const lng = parseFloat(cols[9]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

    const existing = sites.get(aqsid) ?? {
      id: `airnow-${aqsid}`,
      source: "airnow",
      monitorCode: aqsid,
      name: siteName?.trim() || aqsid,
      lat: Math.round(lat * 10000) / 10000,
      lng: Math.round(lng * 10000) / 10000,
      county: null,
      countyFips: aqsid.length >= 5 ? aqsid.slice(0, 5) : null,
      state: cols[20]?.trim() || null,
      pollutants: [],
      active: (status ?? "").trim().toLowerCase() === "active",
      status: "official",
    };
    if (!existing.pollutants.includes(pollutant)) existing.pollutants.push(pollutant);
    sites.set(aqsid, existing);
  }

  const monitors = [...sites.values()].filter((m) => m.active);
  const outPath = path.join(process.cwd(), "src", "data", "monitors.json");
  fs.writeFileSync(
    outPath,
    JSON.stringify(
      {
        source: "AirNow (US EPA) monitoring site locations",
        sourceUrl: SOURCE_URL,
        vintage: "refreshed daily by AirNow",
        status: "official",
        notes:
          "Official AirNow site metadata. AQSID prefixes encode state+county FIPS for US sites.",
        generatedAt: new Date().toISOString(),
        monitors,
      },
      null,
      0
    )
  );
  console.log(`Wrote ${monitors.length} active US monitors to ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
