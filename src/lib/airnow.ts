/**
 * Official current AQI from EPA AirNow's public reporting-area file product.
 * The file is available without an API key and refreshes twice per hour.
 */
import { cached, TTL } from "./cache";
import { trackedFetchText } from "./freshness";
import { haversineKm } from "./geo";
import type { SourceRef } from "./types";

const SOURCE_NAME = "EPA AirNow current observations";
const FILE_URL = "https://files.airnowtech.org/airnow/today/reportingarea.dat";
const MAX_REPORTING_AREA_DISTANCE_KM = 125;
let reportingAreaRequest: ReturnType<typeof loadReportingAreas> | null = null;

export interface AirNowReportingAreaObservation {
  area: string;
  state: string;
  lat: number;
  lng: number;
  pollutant: string;
  aqi: number;
  observedAt: string;
  agency: string | null;
}

export interface OfficialAqiObservation extends AirNowReportingAreaObservation {
  distanceKm: number;
  source: SourceRef;
}

const TIMEZONE_OFFSETS: Record<string, number> = {
  EST: -5,
  EDT: -4,
  CST: -6,
  CDT: -5,
  MST: -7,
  MDT: -6,
  PST: -8,
  PDT: -7,
  AKST: -9,
  AKDT: -8,
  HST: -10,
};

function observationTime(date: string, time: string, timezone: string): string | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{2})$/.exec(date);
  const clock = /^(\d{1,2}):(\d{2})$/.exec(time);
  const offset = TIMEZONE_OFFSETS[timezone];
  if (!match || !clock || offset == null) return null;
  const [, month, day, shortYear] = match;
  const [, hour, minute] = clock;
  const utc = Date.UTC(
    2000 + Number(shortYear),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute)
  ) - offset * 60 * 60 * 1000;
  return new Date(utc).toISOString();
}

function normalizePollutant(value: string): string {
  if (value === "OZONE") return "O3";
  if (value === "PM2.5") return "PM2.5";
  return value;
}

export function parseAirNowReportingAreas(text: string): AirNowReportingAreaObservation[] {
  const rows: AirNowReportingAreaObservation[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line) continue;
    const fields = line.split("|");
    if (fields.length < 17 || fields[5] !== "O") continue;
    const lat = Number(fields[9]);
    const lng = Number(fields[10]);
    const aqiText = fields[12].trim();
    const aqi = Number(aqiText);
    const observedAt = observationTime(fields[1], fields[2], fields[3]);
    if (!aqiText || !Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(aqi) || !observedAt) {
      continue;
    }
    rows.push({
      area: fields[7],
      state: fields[8],
      lat,
      lng,
      pollutant: normalizePollutant(fields[11]),
      aqi,
      observedAt,
      agency: fields[16] || null,
    });
  }
  return rows;
}

export function selectNearestOfficialAqi(
  observations: AirNowReportingAreaObservation[],
  lat: number,
  lng: number,
  maxDistanceKm = MAX_REPORTING_AREA_DISTANCE_KM
): (AirNowReportingAreaObservation & { distanceKm: number }) | null {
  const byArea = new Map<string, AirNowReportingAreaObservation[]>();
  for (const observation of observations) {
    const key = `${observation.area}|${observation.state}|${observation.lat}|${observation.lng}`;
    const current = byArea.get(key) ?? [];
    current.push(observation);
    byArea.set(key, current);
  }

  let best: (AirNowReportingAreaObservation & { distanceKm: number }) | null = null;
  for (const group of byArea.values()) {
    const latestTime = Math.max(...group.map((row) => Date.parse(row.observedAt)));
    const latest = group.filter((row) => Date.parse(row.observedAt) === latestTime);
    const peak = latest.reduce((a, b) => (b.aqi > a.aqi ? b : a));
    const distanceKm = haversineKm({ lat, lng }, { lat: peak.lat, lng: peak.lng });
    if (distanceKm <= maxDistanceKm && (!best || distanceKm < best.distanceKm)) {
      best = { ...peak, distanceKm };
    }
  }
  return best;
}

function loadReportingAreas() {
  return cached("airnow:reporting-areas", TTL.airNowReportingAreas, async () => {
    const text = await trackedFetchText(SOURCE_NAME, FILE_URL, {
      entityType: "air-quality-official",
      timeoutMs: 15000,
    });
    return text ? parseAirNowReportingAreas(text) : [];
  });
}

async function getReportingAreas() {
  if (!reportingAreaRequest) {
    reportingAreaRequest = loadReportingAreas().finally(() => {
      reportingAreaRequest = null;
    });
  }
  return reportingAreaRequest;
}

export async function getOfficialCurrentAqi(lat: number, lng: number): Promise<OfficialAqiObservation | null> {
  const fileHit = await getReportingAreas();
  const match = selectNearestOfficialAqi(fileHit.value, lat, lng);
  if (!match) return null;

  const fetchedAt = fileHit.storedAt;
  const ageNote = fileHit.cached
    ? ` AirNow file served from backend cache (age ${Math.round(fileHit.ageMs / 1000)}s).`
    : "";
  return {
    ...match,
    source: {
      name: SOURCE_NAME,
      url: FILE_URL,
      vintage: match.observedAt,
      fetchedAt,
      status: fileHit.cached ? "cached" : "official",
      confidence: "high",
      notes:
        `Official current AirNow AQI for ${match.area}, ${match.state}; ` +
        `selected as the nearest reporting-area centroid (${match.distanceKm.toFixed(1)} km). ` +
        "AirNow observations are preliminary and intended for public AQI reporting, not regulatory determinations." +
        ageNote,
    },
  };
}
