/**
 * Open-Meteo Air Quality client (live modeled data; CAMS-based, no API key)
 * with a deterministic, clearly-labeled fallback field for environments where
 * the API is unreachable. Every result carries a SourceRef; fallback values
 * are never presented as live.
 */
import { cached, TTL } from "./cache";
import { trackedFetchJson } from "./freshness";
import { computeAqi, categoryForAqi } from "./aqi";
import type { AirQualitySnapshot, HourlyPoint, SourceRef, Sourced } from "./types";

const BASE = "https://air-quality-api.open-meteo.com/v1/air-quality";
const SOURCE_NAME = "Open-Meteo Air Quality API (CAMS model)";

interface OmCurrent {
  time: string;
  pm2_5: number | null;
  pm10: number | null;
  ozone: number | null;
  nitrogen_dioxide: number | null;
  sulphur_dioxide: number | null;
  carbon_monoxide: number | null;
  us_aqi: number | null;
}

interface OmResponse {
  latitude: number;
  longitude: number;
  current?: OmCurrent;
  hourly?: {
    time: string[];
    pm2_5: (number | null)[];
    ozone: (number | null)[];
    us_aqi: (number | null)[];
  };
}

function sourceRef(status: "live" | "cached" | "fallback", fetchedAt: string, extra?: string): SourceRef {
  if (status === "fallback") {
    return {
      name: "Deterministic fallback field (Open-Meteo unreachable)",
      url: null,
      vintage: "synthetic",
      fetchedAt,
      status: "fallback",
      confidence: "low",
      notes:
        "Open-Meteo could not be reached from this deployment; values are a smooth synthetic field for demonstration and are NOT real air quality." +
        (extra ? ` ${extra}` : ""),
    };
  }
  return {
    name: SOURCE_NAME,
    url: "https://open-meteo.com/en/docs/air-quality-api",
    vintage: fetchedAt,
    fetchedAt,
    status,
    confidence: "medium",
    notes:
      "Modeled (CAMS reanalysis/forecast) concentrations, not a physical monitor reading. Hourly snapshot AQI, not a regulatory daily value." +
      (extra ? ` ${extra}` : ""),
  };
}

// ---------------------------------------------------------------------------
// Deterministic fallback field: smooth in space and time so the map and
// timeline behave, but obviously labeled. Roughly "typical clean-to-moderate
// continental" magnitudes.
// ---------------------------------------------------------------------------
export function fallbackField(lat: number, lng: number, date: Date): {
  pm25: number;
  pm10: number;
  ozone: number;
  no2: number;
} {
  const t = date.getTime() / 3.6e6; // hours since epoch
  const diurnal = Math.sin(((date.getUTCHours() - 14) / 24) * 2 * Math.PI);
  const spatial =
    Math.sin(lat * 0.55 + 1.3) * Math.cos(lng * 0.42 - 0.7) +
    0.5 * Math.sin(lat * 1.7 - lng * 0.9) +
    0.3 * Math.sin(lng * 2.3 + t * 0.05);
  const pm25 = Math.max(1.5, 8 + 5 * spatial + 2 * diurnal);
  return {
    pm25: +pm25.toFixed(1),
    pm10: +(pm25 * 1.8).toFixed(1),
    ozone: +(70 + 25 * diurnal + 10 * Math.sin(lng * 0.8 + lat)).toFixed(1),
    no2: +Math.max(1, 12 + 8 * spatial - 4 * diurnal).toFixed(1),
  };
}

function snapshotFromValues(
  lat: number,
  lng: number,
  observedAt: string,
  vals: {
    pm2_5: number | null;
    pm10: number | null;
    ozone: number | null;
    nitrogen_dioxide: number | null;
    sulphur_dioxide: number | null;
    carbon_monoxide: number | null;
    us_aqi: number | null;
  },
  src: SourceRef
): AirQualitySnapshot {
  const wrap = <T>(value: T, unit: string): Sourced<T> => ({ value, unit, source: src });
  const computed = computeAqi({
    pm25: vals.pm2_5,
    pm10: vals.pm10,
    ozoneUgm3: vals.ozone,
    no2Ugm3: vals.nitrogen_dioxide,
  });
  const usAqi = vals.us_aqi ?? computed.usAqi;
  return {
    lat,
    lng,
    observedAt,
    pm25: wrap(vals.pm2_5, "µg/m³"),
    pm10: wrap(vals.pm10, "µg/m³"),
    ozone: wrap(vals.ozone, "µg/m³"),
    no2: wrap(vals.nitrogen_dioxide, "µg/m³"),
    so2: wrap(vals.sulphur_dioxide, "µg/m³"),
    co: wrap(vals.carbon_monoxide, "µg/m³"),
    usAqi: {
      value: usAqi,
      unit: "US AQI",
      source: {
        ...src,
        notes:
          (vals.us_aqi != null
            ? "US AQI as reported by Open-Meteo."
            : "US AQI computed by PASS from concentrations using EPA breakpoints.") +
          " Snapshot index, not a 24-hour regulatory AQI.",
      },
    },
    category: categoryForAqi(usAqi),
    dominantPollutant: computed.dominantPollutant,
  };
}

export async function getCurrentAirQuality(
  lat: number,
  lng: number
): Promise<{ snapshot: AirQualitySnapshot; cachedHit: boolean }> {
  const key = `aq:current:${lat.toFixed(2)}:${lng.toFixed(2)}`;
  const hit = await cached(key, TTL.airQualityCurrent, async () => {
    const url =
      `${BASE}?latitude=${lat.toFixed(4)}&longitude=${lng.toFixed(4)}` +
      `&current=pm2_5,pm10,ozone,nitrogen_dioxide,sulphur_dioxide,carbon_monoxide,us_aqi&timezone=UTC`;
    const data = await trackedFetchJson<OmResponse>(SOURCE_NAME, url, {
      entityType: "air-quality-current",
    });
    const now = new Date().toISOString();
    if (data?.current) {
      return snapshotFromValues(lat, lng, data.current.time + ":00Z", data.current, sourceRef("live", now));
    }
    const fb = fallbackField(lat, lng, new Date());
    return snapshotFromValues(
      lat,
      lng,
      now,
      {
        pm2_5: fb.pm25,
        pm10: fb.pm10,
        ozone: fb.ozone,
        nitrogen_dioxide: fb.no2,
        sulphur_dioxide: null,
        carbon_monoxide: null,
        us_aqi: null,
      },
      sourceRef("fallback", now)
    );
  });
  // Re-label live→cached when served from cache so the badge is honest.
  const snapshot = hit.value;
  if (hit.cached && snapshot.usAqi.source.status === "live") {
    const relabel = (s: Sourced<number | null>): Sourced<number | null> => ({
      ...s,
      source: { ...s.source, status: "cached", notes: `${s.source.notes ?? ""} Served from backend cache (age ${Math.round(hit.ageMs / 1000)}s).`.trim() },
    });
    return {
      cachedHit: true,
      snapshot: {
        ...snapshot,
        pm25: relabel(snapshot.pm25),
        pm10: relabel(snapshot.pm10),
        ozone: relabel(snapshot.ozone),
        no2: relabel(snapshot.no2),
        so2: relabel(snapshot.so2),
        co: relabel(snapshot.co),
        usAqi: relabel(snapshot.usAqi),
      },
    };
  }
  return { snapshot, cachedHit: hit.cached };
}

export async function getAirQualityHistory(
  lat: number,
  lng: number,
  pastDays = 2,
  forecastDays = 2
): Promise<{ points: HourlyPoint[]; source: SourceRef }> {
  const key = `aq:history:${lat.toFixed(2)}:${lng.toFixed(2)}:${pastDays}:${forecastDays}`;
  const hit = await cached(key, TTL.airQualityHistory, async () => {
    const url =
      `${BASE}?latitude=${lat.toFixed(4)}&longitude=${lng.toFixed(4)}` +
      `&hourly=pm2_5,ozone,us_aqi&past_days=${pastDays}&forecast_days=${forecastDays}&timezone=UTC`;
    const data = await trackedFetchJson<OmResponse>(SOURCE_NAME, url, {
      entityType: "air-quality-history",
    });
    const now = Date.now();
    if (data?.hourly?.time?.length) {
      const points: HourlyPoint[] = data.hourly.time.map((t, i) => {
        const ts = new Date(t + ":00Z").getTime();
        return {
          time: t + ":00Z",
          pm25: data.hourly!.pm2_5[i],
          ozone: data.hourly!.ozone[i],
          usAqi: data.hourly!.us_aqi[i],
          kind: ts < now - 3.6e6 ? "past" : ts > now + 3.6e6 ? "forecast" : "current",
        };
      });
      return { points, source: sourceRef("live", new Date().toISOString(), "Past hours are model reanalysis; future hours are model forecast.") };
    }
    // Fallback series, hourly steps
    const points: HourlyPoint[] = [];
    for (let h = -pastDays * 24; h <= forecastDays * 24; h++) {
      const d = new Date(now + h * 3.6e6);
      const fb = fallbackField(lat, lng, d);
      const aqi = computeAqi({ pm25: fb.pm25, ozoneUgm3: fb.ozone });
      points.push({
        time: d.toISOString().slice(0, 13) + ":00:00Z",
        pm25: fb.pm25,
        ozone: fb.ozone,
        usAqi: aqi.usAqi,
        kind: h < -1 ? "past" : h > 1 ? "forecast" : "current",
      });
    }
    return { points, source: sourceRef("fallback", new Date().toISOString()) };
  });
  return hit.value;
}

/** Batched current PM2.5/AQI for map cells. Open-Meteo accepts comma lists. */
export async function getCurrentBatch(
  points: { lat: number; lng: number }[]
): Promise<{ values: { pm25: number | null; usAqi: number | null }[]; source: SourceRef }> {
  if (points.length === 0) {
    return { values: [], source: sourceRef("live", new Date().toISOString()) };
  }
  const lats = points.map((p) => p.lat.toFixed(3)).join(",");
  const lngs = points.map((p) => p.lng.toFixed(3)).join(",");
  const url = `${BASE}?latitude=${lats}&longitude=${lngs}&current=pm2_5,us_aqi&timezone=UTC`;
  const data = await trackedFetchJson<OmResponse | OmResponse[]>(SOURCE_NAME, url, {
    entityType: "air-quality-batch",
    timeoutMs: 12000,
  });
  const now = new Date().toISOString();
  if (data) {
    const arr = Array.isArray(data) ? data : [data];
    if (arr.length === points.length) {
      return {
        values: arr.map((r) => ({
          pm25: r.current?.pm2_5 ?? null,
          usAqi: r.current?.us_aqi ?? null,
        })),
        source: sourceRef("live", now),
      };
    }
  }
  const date = new Date();
  return {
    values: points.map((p) => {
      const fb = fallbackField(p.lat, p.lng, date);
      return { pm25: fb.pm25, usAqi: computeAqi({ pm25: fb.pm25 }).usAqi };
    }),
    source: sourceRef("fallback", now),
  };
}
