import { cached, TTL } from "./cache";
import { distanceKm } from "./distance";
import { trackedFetchJson } from "./freshness";
import type { UsgsWaterReading, UsgsWaterSnapshot, UsgsWaterStation } from "./pfas-types";

const SOURCE_NAME = "USGS Water Services instantaneous values";
const SOURCE_URL = "https://waterservices.usgs.gov/nwis/iv/";
const PARAMETER_CODES = ["00060", "00065", "00010", "00095", "00400", "00300", "63680"];

const PARAMETERS: Record<string, { label: string; unit: string }> = {
  "00060": { label: "Streamflow", unit: "ft³/s" },
  "00065": { label: "Gage height", unit: "ft" },
  "00010": { label: "Water temperature", unit: "°C" },
  "00095": { label: "Specific conductance", unit: "µS/cm" },
  "00400": { label: "pH", unit: "standard units" },
  "00300": { label: "Dissolved oxygen", unit: "mg/L" },
  "63680": { label: "Turbidity", unit: "FNU" },
};

interface WatermlValue {
  value?: string;
  dateTime?: string;
  qualifiers?: string[];
}

interface WatermlSeries {
  sourceInfo?: {
    siteName?: string;
    siteCode?: Array<{ value?: string }>;
    geoLocation?: { geogLocation?: { latitude?: number; longitude?: number } };
  };
  variable?: {
    variableCode?: Array<{ value?: string }>;
    unit?: { unitCode?: string };
    noDataValue?: number;
  };
  values?: Array<{ value?: WatermlValue[] }>;
}

interface WatermlResponse {
  value?: { timeSeries?: WatermlSeries[] };
}

function freshness(observedAt: string): UsgsWaterStation["freshness"] {
  const ageHours = (Date.now() - new Date(observedAt).getTime()) / 3_600_000;
  if (ageHours <= 2) return "fresh";
  if (ageHours <= 24) return "recent";
  return "stale";
}

function readingFromSeries(series: WatermlSeries): UsgsWaterReading | null {
  const code = String(series.variable?.variableCode?.[0]?.value ?? "");
  const definition = PARAMETERS[code];
  if (!definition) return null;
  const noData = series.variable?.noDataValue ?? -999999;
  const values = (series.values ?? []).flatMap((group) => group.value ?? [])
    .map((point) => ({
      time: String(point.dateTime ?? ""),
      value: Number(point.value),
      provisional: point.qualifiers?.includes("P") ?? false,
    }))
    .filter((point) => point.time && Number.isFinite(point.value) && point.value !== noData)
    .sort((left, right) => left.time.localeCompare(right.time));
  const latest = values.at(-1);
  if (!latest) return null;
  const step = Math.max(1, Math.ceil(values.length / 36));
  return {
    code,
    label: definition.label,
    value: latest.value,
    unit: definition.unit || series.variable?.unit?.unitCode || "",
    observedAt: latest.time,
    provisional: latest.provisional,
    history: values.filter((_, index) => index % step === 0 || index === values.length - 1).slice(-36).map(({ time, value }) => ({ time, value })),
  };
}

function parseStations(data: WatermlResponse, lat: number, lng: number): UsgsWaterStation[] {
  const groups = new Map<string, Omit<UsgsWaterStation, "freshness" | "latestObservedAt">>();
  for (const series of data.value?.timeSeries ?? []) {
    const siteCode = String(series.sourceInfo?.siteCode?.[0]?.value ?? "");
    const siteLat = Number(series.sourceInfo?.geoLocation?.geogLocation?.latitude);
    const siteLng = Number(series.sourceInfo?.geoLocation?.geogLocation?.longitude);
    const reading = readingFromSeries(series);
    if (!siteCode || !Number.isFinite(siteLat) || !Number.isFinite(siteLng) || !reading) continue;
    const existing = groups.get(siteCode) ?? {
      siteCode,
      name: String(series.sourceInfo?.siteName ?? `USGS station ${siteCode}`),
      lat: siteLat,
      lng: siteLng,
      distanceKm: Math.round(distanceKm(lat, lng, siteLat, siteLng) * 10) / 10,
      readings: [],
      sourceUrl: `https://waterdata.usgs.gov/monitoring-location/${siteCode}/`,
    };
    const prior = existing.readings.findIndex((item) => item.code === reading.code);
    if (prior === -1) existing.readings.push(reading);
    else if (reading.observedAt > existing.readings[prior].observedAt) existing.readings[prior] = reading;
    groups.set(siteCode, existing);
  }
  return [...groups.values()].map((station) => {
    const latestObservedAt = station.readings.map((reading) => reading.observedAt).sort().at(-1) ?? "";
    return { ...station, latestObservedAt, freshness: freshness(latestObservedAt) };
  }).sort((left, right) => left.distanceKm - right.distanceKm).slice(0, 8);
}

export async function getUsgsWaterSnapshot(lat: number, lng: number, radiusKm: number): Promise<UsgsWaterSnapshot> {
  const cacheKey = `water:live:${lat.toFixed(3)}:${lng.toFixed(3)}:${radiusKm}`;
  const result = await cached(cacheKey, TTL.waterLive, async () => {
    const latDelta = radiusKm / 110.574;
    const lngDelta = radiusKm / (111.32 * Math.max(0.2, Math.cos((lat * Math.PI) / 180)));
    const bbox = [lng - lngDelta, lat - latDelta, lng + lngDelta, lat + latDelta].map((value) => value.toFixed(5)).join(",");
    const url = `${SOURCE_URL}?format=json&bBox=${bbox}&parameterCd=${PARAMETER_CODES.join(",")}&period=P1D&siteStatus=active`;
    const data = await trackedFetchJson<WatermlResponse>(SOURCE_NAME, url, { entityType: "usgs-water-live", timeoutMs: 15_000 });
    const stations = data ? parseStations(data, lat, lng) : [];
    return {
      status: stations.length ? "live" as const : "unavailable" as const,
      fetchedAt: new Date().toISOString(),
      radiusKm,
      stations,
      sourceUrl: "https://api.waterdata.usgs.gov/",
      caveats: [
        "USGS continuous readings are provisional and subject to revision.",
        "Parameters differ by station; an absent metric means it is not available in this response.",
        "Streamflow, temperature, conductance, pH, dissolved oxygen, and turbidity are hydrologic context—not PFAS measurements or household tap-water results.",
      ],
    };
  });
  return { ...result.value, servedFromCache: result.cached };
}
