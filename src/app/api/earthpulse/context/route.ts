import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentAirQuality } from "@/lib/openmeteo";
import { handleError, ok, parseQuery } from "@/lib/api";

const querySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
});

type NwsFeature = {
  id: string;
  properties?: {
    event?: string;
    headline?: string;
    severity?: string;
    certainty?: string;
    urgency?: string;
    effective?: string;
    expires?: string;
    web?: string;
  };
};

type NwsResponse = { features?: NwsFeature[] };

type UsgsSeries = {
  sourceInfo?: {
    siteName?: string;
    siteCode?: { value?: string }[];
    geoLocation?: { geogLocation?: { latitude?: number; longitude?: number } };
  };
  variable?: { variableCode?: { value?: string }[]; unit?: { unitCode?: string } };
  values?: { value?: { value?: string; dateTime?: string; qualifiers?: string[] }[] }[];
};

type UsgsWaterResponse = { value?: { timeSeries?: UsgsSeries[] } };
type QuakeFeature = {
  id: string;
  properties?: { mag?: number; place?: string; time?: number; url?: string };
  geometry?: { coordinates?: [number, number, number] };
};
type QuakeResponse = { features?: QuakeFeature[] };

function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number) {
  const rad = Math.PI / 180;
  const dLat = (bLat - aLat) * rad;
  const dLng = (bLng - aLng) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

async function fetchJson<T>(url: string, headers?: HeadersInit): Promise<T> {
  const response = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(8000),
    next: { revalidate: 120 },
  });
  if (!response.ok) throw new Error(`${response.status} from upstream`);
  return response.json() as Promise<T>;
}

async function getAlerts(lat: number, lng: number) {
  const data = await fetchJson<NwsResponse>(
    `https://api.weather.gov/alerts/active?point=${lat.toFixed(4)},${lng.toFixed(4)}`,
    { Accept: "application/geo+json", "User-Agent": "EARTHPULSE/1.0 (public-interest atlas)" }
  );
  return (data.features ?? []).slice(0, 8).map((feature) => ({
    id: feature.id,
    event: feature.properties?.event ?? "Weather alert",
    headline: feature.properties?.headline ?? feature.properties?.event ?? "Active NWS alert",
    severity: feature.properties?.severity ?? "Unknown",
    certainty: feature.properties?.certainty ?? "Unknown",
    urgency: feature.properties?.urgency ?? "Unknown",
    effective: feature.properties?.effective ?? null,
    expires: feature.properties?.expires ?? null,
    url: feature.properties?.web ?? feature.id,
  }));
}

async function getGauges(lat: number, lng: number) {
  const latPad = 0.42;
  const lngPad = 0.55;
  const bbox = [lng - lngPad, lat - latPad, lng + lngPad, lat + latPad]
    .map((n) => n.toFixed(4))
    .join(",");
  const url =
    "https://waterservices.usgs.gov/nwis/iv/?format=json" +
    `&bBox=${bbox}&parameterCd=00060,00065&siteStatus=active`;
  const data = await fetchJson<UsgsWaterResponse>(url);
  const sites = new Map<string, {
    id: string;
    name: string;
    lat: number;
    lng: number;
    distanceKm: number;
    dischargeCfs: number | null;
    gageHeightFt: number | null;
    observedAt: string | null;
    qualifiers: string[];
  }>();

  for (const series of data.value?.timeSeries ?? []) {
    const siteId = series.sourceInfo?.siteCode?.[0]?.value;
    const point = series.sourceInfo?.geoLocation?.geogLocation;
    const latest = series.values?.[0]?.value?.at(-1);
    if (!siteId || point?.latitude == null || point.longitude == null || !latest) continue;
    const current = sites.get(siteId) ?? {
      id: siteId,
      name: series.sourceInfo?.siteName ?? `USGS ${siteId}`,
      lat: point.latitude,
      lng: point.longitude,
      distanceKm: distanceKm(lat, lng, point.latitude, point.longitude),
      dischargeCfs: null,
      gageHeightFt: null,
      observedAt: latest.dateTime ?? null,
      qualifiers: latest.qualifiers ?? [],
    };
    const value = Number(latest.value);
    const code = series.variable?.variableCode?.[0]?.value;
    if (Number.isFinite(value) && code === "00060") current.dischargeCfs = value;
    if (Number.isFinite(value) && code === "00065") current.gageHeightFt = value;
    if (latest.dateTime && (!current.observedAt || latest.dateTime > current.observedAt)) {
      current.observedAt = latest.dateTime;
    }
    current.qualifiers = Array.from(new Set([...current.qualifiers, ...(latest.qualifiers ?? [])]));
    sites.set(siteId, current);
  }
  return Array.from(sites.values())
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, 6);
}

async function getEarthquakes(lat: number, lng: number) {
  const data = await fetchJson<QuakeResponse>(
    "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson"
  );
  return (data.features ?? [])
    .map((feature) => {
      const coordinates = feature.geometry?.coordinates;
      if (!coordinates) return null;
      const km = distanceKm(lat, lng, coordinates[1], coordinates[0]);
      return {
        id: feature.id,
        magnitude: feature.properties?.mag ?? null,
        place: feature.properties?.place ?? "Unspecified location",
        observedAt: feature.properties?.time ? new Date(feature.properties.time).toISOString() : null,
        url: feature.properties?.url ?? null,
        distanceKm: km,
        lat: coordinates[1],
        lng: coordinates[0],
      };
    })
    .filter((feature): feature is NonNullable<typeof feature> => Boolean(feature && feature.distanceKm <= 250))
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, 5);
}

export async function GET(req: NextRequest) {
  try {
    const query = parseQuery(req, querySchema);
    if (query instanceof NextResponse) return query;
    const fetchedAt = new Date().toISOString();
    const [alertsResult, gaugesResult, quakesResult, airResult] = await Promise.allSettled([
      getAlerts(query.lat, query.lng),
      getGauges(query.lat, query.lng),
      getEarthquakes(query.lat, query.lng),
      getCurrentAirQuality(query.lat, query.lng),
    ]);

    const airSnapshot = airResult.status === "fulfilled" ? airResult.value.snapshot : null;
    const airIsObserved = airSnapshot?.usAqi.source.status !== "fallback";

    return ok({
      location: query,
      fetchedAt,
      alerts: alertsResult.status === "fulfilled" ? alertsResult.value : [],
      gauges: gaugesResult.status === "fulfilled" ? gaugesResult.value : [],
      earthquakes: quakesResult.status === "fulfilled" ? quakesResult.value : [],
      air: airIsObserved && airSnapshot
        ? {
            aqi: airSnapshot.usAqi.value,
            category: airSnapshot.category,
            pollutant: airSnapshot.dominantPollutant,
            observedAt: airSnapshot.observedAt,
            source: airSnapshot.usAqi.source,
          }
        : null,
      availability: {
        alerts: alertsResult.status === "fulfilled",
        gauges: gaugesResult.status === "fulfilled",
        earthquakes: quakesResult.status === "fulfilled",
        air: Boolean(airIsObserved && airSnapshot),
      },
      sources: [
        { id: "nws", name: "National Weather Service active alerts", url: "https://api.weather.gov/alerts/active", status: alertsResult.status === "fulfilled" ? "live" : "unavailable" },
        { id: "usgs-water", name: "USGS National Water Information System", url: "https://waterservices.usgs.gov/", status: gaugesResult.status === "fulfilled" ? "live" : "unavailable" },
        { id: "usgs-quakes", name: "USGS Earthquake Hazards Program", url: "https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson.php", status: quakesResult.status === "fulfilled" ? "live" : "unavailable" },
        { id: "airnow", name: "EPA AirNow reporting area observations", url: "https://www.airnow.gov/", status: airIsObserved ? "live" : "unavailable" },
      ],
    });
  } catch (error) {
    return handleError(error);
  }
}
