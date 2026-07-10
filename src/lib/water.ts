import { cached, TTL } from "./cache";
import { trackedFetchJson } from "./freshness";
import type {
  SourceRef,
  Sourced,
  WaterContaminant,
  WaterQualitySnapshot,
  WaterSample,
  WaterStation,
} from "./types";

const SDWIS = "EPA Envirofacts / SDWIS";
const ATTAINS = "EPA ATTAINS / How's My Waterway";
const WQP = "Water Quality Portal / USGS";
const UCMR5 = "EPA UCMR 5";

interface WaterInput {
  lat: number;
  lng: number;
  zip?: string | null;
  county?: string | null;
  state?: string | null;
}

function src(
  name: string,
  url: string | null,
  fetchedAt: string,
  status: SourceRef["status"],
  confidence: SourceRef["confidence"],
  notes: string
): SourceRef {
  return { name, url, fetchedAt, vintage: fetchedAt, status, confidence, notes };
}

function sourced<T>(value: T, unit: string | undefined, source: SourceRef): Sourced<T> {
  return { value, unit, source };
}

function fallbackSource(fetchedAt: string): SourceRef {
  return src(
    "PASS deterministic water fallback",
    null,
    fetchedAt,
    "fallback",
    "low",
    "Official water APIs did not return complete usable records. This is screening context only."
  );
}

function externalLinks(zip?: string | null): WaterQualitySnapshot["externalLinks"] {
  return [
    {
      label: "EWG Tap Water Database",
      url: zip ? `https://www.ewg.org/tapwater/search-results.php?zip5=${encodeURIComponent(zip)}` : "https://www.ewg.org/tapwater/",
      sourceType: "external-tool",
      explanation: "ZIP-based external tool. PASS links out; it does not ingest EWG as an API.",
    },
    {
      label: "EPA UCMR 5 occurrence data",
      url: "https://www.epa.gov/dwucmr/fifth-unregulated-contaminant-monitoring-rule",
      sourceType: "official",
      explanation: "Official unregulated contaminant monitoring context for PFAS occurrence. Not a compliance finding.",
    },
    {
      label: "Archived EJScreen context",
      url: "https://screening-tools.com/",
      sourceType: "archived",
      explanation: "EPA EJScreen public access was removed in 2025; archived/reconstructed tools are context only.",
    },
  ];
}

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.replace(/^"|"$/g, ""));
  return lines.slice(1, 8).map((line) => {
    const cells = line.match(/("([^"]|"")*"|[^,]+)/g) ?? [];
    return Object.fromEntries(
      headers.map((h, i) => [h, String(cells[i] ?? "").replace(/^"|"$/g, "").replaceAll('""', '"')])
    );
  });
}

async function trackedFetchText(url: string, timeoutMs = 8000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    return res.ok ? await res.text() : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function stationRows(geojson: unknown, source: SourceRef): WaterStation[] {
  const features = Array.isArray((geojson as { features?: unknown[] } | null)?.features)
    ? (geojson as { features: { properties?: Record<string, unknown> }[] }).features
    : [];
  return features.slice(0, 5).map((feature, i) => {
    const p = feature.properties ?? {};
    return {
      id: String(p.MonitoringLocationIdentifier ?? p.monitoringLocationIdentifier ?? `wqp-${i + 1}`),
      name: String(p.MonitoringLocationName ?? p.monitoringLocationName ?? "Nearby monitoring station"),
      type: String(p.MonitoringLocationTypeName ?? p.monitoringLocationTypeName ?? "Water monitoring location"),
      source,
    };
  });
}

function sampleRows(csv: string, source: SourceRef): WaterSample[] {
  return parseCsv(csv).map((row) => {
    const characteristic = row.CharacteristicName || "Water quality result";
    const value = row.ResultMeasureValue || row["ResultMeasure/MeasureValue"] || row.ActivityStartDate || "reported";
    const unit = row.ResultMeasureUnitCode || row["ResultMeasure/MeasureUnitCode"] || undefined;
    return {
      characteristic,
      value: sourced(value, unit, source),
      station: row.MonitoringLocationIdentifier || null,
      date: row.ActivityStartDate || null,
    };
  });
}

function fallbackSnapshot(input: WaterInput, fetchedAt: string, sources: SourceRef[], caveats: string[]): WaterQualitySnapshot {
  const fb = fallbackSource(fetchedAt);
  const sdwis = sources.find((s) => s.name === SDWIS) ?? fb;
  const pfasSource = src(
    UCMR5,
    "https://www.epa.gov/dwucmr/fifth-unregulated-contaminant-monitoring-rule",
    fetchedAt,
    "official",
    "medium",
    "Official UCMR 5 program page. Occurrence data is monitoring context, not regulatory noncompliance."
  );
  const lead: WaterContaminant = {
    contaminant: "Lead",
    value: sourced("No household tap-water result loaded", undefined, fb),
    concern: "watch",
  };
  const pfas: WaterContaminant = {
    contaminant: "PFAS",
    value: sourced("Open UCMR 5 occurrence data", undefined, pfasSource),
    concern: "watch",
  };
  return {
    location: input,
    status: sources.length ? "official" : "fallback",
    fetchedAt,
    drinkingWater: {
      systems: [
        {
          name: sourced(input.zip ? `Public water systems near ZIP ${input.zip}` : "Public water system lookup", undefined, sdwis),
          pwsid: sourced(null, undefined, sdwis),
          status: sourced(sources.some((s) => s.name === SDWIS) ? "Official SDWIS lookup attempted" : "Fallback context", undefined, sdwis),
        },
      ],
      violations: [{ contaminant: "Drinking-water violations", count: sourced(0, "records", fb), period: "latest official lookup/fallback" }],
      contaminants: [lead, pfas],
    },
    surfaceWater: {
      nearbyStations: [],
      recentSamples: [],
      assessment: { summary: sourced(sources.some((s) => s.name === ATTAINS) ? "ATTAINS lookup attempted" : "No ATTAINS assessment loaded", undefined, sources.find((s) => s.name === ATTAINS) ?? fb) },
    },
    pfas: { detections: [pfas], ucmr5Summary: sourced("UCMR 5 PFAS occurrence context", undefined, pfasSource) },
    externalLinks: externalLinks(input.zip),
    sources: [...sources, pfasSource, fb],
    caveats: [
      ...caveats,
      "Nearby surface-water samples are not household tap-water measurements.",
      "County, ZIP, and public-water-system context is screening information only.",
      "Lead can appear across air, dust, soil, and water pathways.",
    ],
  };
}

export async function getCurrentWaterQuality(input: WaterInput): Promise<{ snapshot: WaterQualitySnapshot; cachedHit: boolean }> {
  const key = `water:current:${input.lat.toFixed(3)}:${input.lng.toFixed(3)}:${input.zip ?? ""}`;
  const hit = await cached(key, TTL.waterQualityCurrent, async () => {
    const fetchedAt = new Date().toISOString();
    const sources: SourceRef[] = [];
    const caveats: string[] = [];
    let stations: WaterStation[] = [];
    let samples: WaterSample[] = [];

    if (input.zip) {
      const url = `https://enviro.epa.gov/enviro/efservice/SDW_PUB_WATER_SYSTEM/ZIP/${encodeURIComponent(input.zip)}/JSON`;
      const data = await trackedFetchJson<unknown[]>(SDWIS, url, { entityType: "water-sdwis", timeoutMs: 9000 });
      if (data) sources.push(src(SDWIS, url, fetchedAt, "official", data.length ? "medium" : "low", "Drinking-water system lookup by ZIP."));
      else caveats.push("EPA Envirofacts / SDWIS was unavailable or returned no JSON for this request.");
    }

    const wqpStationUrl = `https://www.waterqualitydata.us/data/Station/search?lat=${input.lat}&long=${input.lng}&within=10&mimeType=geojson&providers=NWIS`;
    const stationData = await trackedFetchJson<unknown>(WQP, wqpStationUrl, { entityType: "water-wqp-stations", timeoutMs: 12000 });
    if (stationData) {
      const wqpSource = src(WQP, wqpStationUrl, fetchedAt, "live", "high", "Official WQP radial station lookup by latitude/longitude.");
      sources.push(wqpSource);
      stations = stationRows(stationData, wqpSource);
    } else caveats.push("Water Quality Portal station lookup was unavailable.");

    const characteristicName = encodeURIComponent("Lead;Perfluorooctanoic acid;Perfluorooctanesulfonic acid");
    const wqpResultUrl = `https://www.waterqualitydata.us/data/Result/search?lat=${input.lat}&long=${input.lng}&within=10&mimeType=csv&sorted=no&characteristicName=${characteristicName}`;
    const resultCsv = await trackedFetchText(wqpResultUrl, 12000);
    if (resultCsv) {
      const resultSource = src(WQP, wqpResultUrl, fetchedAt, "live", parseCsv(resultCsv).length ? "medium" : "low", "Official WQP result lookup for lead and selected PFAS names.");
      sources.push(resultSource);
      samples = sampleRows(resultCsv, resultSource);
    } else caveats.push("Water Quality Portal lead/PFAS sample lookup was unavailable or empty.");

    const attainsUrl = `https://attains.epa.gov/attains-public/api/assessments?latitude=${input.lat}&longitude=${input.lng}`;
    const attains = await trackedFetchJson<unknown>(ATTAINS, attainsUrl, { entityType: "water-attains", timeoutMs: 9000 });
    if (attains) sources.push(src(ATTAINS, attainsUrl, fetchedAt, "official", "medium", "Waterway assessment lookup attempted by coordinates."));
    else caveats.push("EPA ATTAINS coordinate lookup was unavailable from this runtime.");

    const snapshot = fallbackSnapshot(input, fetchedAt, sources, caveats);
    snapshot.surfaceWater.nearbyStations = stations;
    snapshot.surfaceWater.recentSamples = samples;
    if (samples.length) {
      const sampleContaminants: WaterContaminant[] = samples.slice(0, 3).map((sample) => ({
        contaminant: sample.characteristic,
        value: sample.value,
        concern: /lead|pfas|perfluoro|pfoa|pfos/i.test(sample.characteristic) ? "watch" : "context",
      }));
      snapshot.drinkingWater.contaminants = [...sampleContaminants, ...snapshot.drinkingWater.contaminants].slice(0, 5);
      const pfas = snapshot.drinkingWater.contaminants.filter((item) => /pfas|perfluoro|pfoa|pfos/i.test(item.contaminant));
      if (pfas.length) snapshot.pfas.detections = pfas;
    }
    return snapshot;
  });
  return { snapshot: hit.value, cachedHit: hit.cached };
}
