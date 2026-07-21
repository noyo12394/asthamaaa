import { NextRequest, NextResponse } from "next/server";
import { getCurrentAirQuality } from "@/lib/openmeteo";
import { getUsgsWaterSnapshot } from "@/lib/usgs-water";
import { handleError, latLngSchema, ok, parseQuery } from "@/lib/api";
import {
  alertsForGroup,
  aqiTier,
  highestAlertTier,
  type NwsAlertSummary,
} from "@/lib/local-risk";

type NwsFeature = {
  id?: string;
  properties?: {
    event?: string;
    headline?: string;
    description?: string;
    instruction?: string;
    severity?: string;
    certainty?: string;
    urgency?: string;
    effective?: string;
    expires?: string;
    web?: string;
  };
};

type NwsResponse = { features?: NwsFeature[] };

async function getNwsAlerts(lat: number, lng: number): Promise<NwsAlertSummary[]> {
  const sourceUrl = `https://api.weather.gov/alerts/active?point=${lat.toFixed(4)},${lng.toFixed(4)}`;
  const response = await fetch(sourceUrl, {
    headers: {
      Accept: "application/geo+json",
      "User-Agent": "PASS Equity Atlas / Lehigh University environmental health research",
    },
    signal: AbortSignal.timeout(9_000),
    next: { revalidate: 120 },
  });
  if (!response.ok) throw new Error(`NWS alert service returned ${response.status}`);
  const data = (await response.json()) as NwsResponse;
  return (data.features ?? []).slice(0, 20).map((feature, index) => {
    const properties = feature.properties ?? {};
    const id = feature.id ?? `nws-alert-${index}`;
    return {
      id,
      event: properties.event ?? "Weather alert",
      headline: properties.headline ?? properties.event ?? "Active NWS alert",
      description: properties.description?.slice(0, 1_200) ?? null,
      instruction: properties.instruction?.slice(0, 800) ?? null,
      severity: properties.severity ?? "Unknown",
      certainty: properties.certainty ?? "Unknown",
      urgency: properties.urgency ?? "Unknown",
      effective: properties.effective ?? null,
      expires: properties.expires ?? null,
      sourceUrl: properties.web ?? id,
    };
  });
}

export async function GET(request: NextRequest) {
  try {
    const query = parseQuery(request, latLngSchema);
    if (query instanceof NextResponse) return query;

    const [airResult, alertsResult, waterResult] = await Promise.allSettled([
      getCurrentAirQuality(query.lat, query.lng),
      getNwsAlerts(query.lat, query.lng),
      getUsgsWaterSnapshot(query.lat, query.lng, 50),
    ]);

    const airSnapshot = airResult.status === "fulfilled" ? airResult.value.snapshot : null;
    const airUsable = airSnapshot?.usAqi.source.status !== "fallback";
    const alerts = alertsResult.status === "fulfilled" ? alertsResult.value : [];
    const gauges = waterResult.status === "fulfilled" ? waterResult.value : null;
    const groups = {
      flood: alertsForGroup(alerts, "flood"),
      heat: alertsForGroup(alerts, "heat"),
      fireWeather: alertsForGroup(alerts, "fireWeather"),
      severeWeather: alertsForGroup(alerts, "severeWeather"),
    };
    const hazard = (items: NwsAlertSummary[], clearLabel: string) => ({
      tier: highestAlertTier(items),
      activeCount: items.length,
      summary: items[0]?.headline ?? clearLabel,
      basis: items.length
        ? "PASS tier derived from the alert severity published by NWS."
        : "No active matching NWS alert was returned for this point. Conditions can change quickly.",
    });

    return ok({
      location: query,
      fetchedAt: new Date().toISOString(),
      air: airUsable && airSnapshot
        ? {
            tier: aqiTier(airSnapshot.usAqi.value),
            aqi: airSnapshot.usAqi.value,
            category: airSnapshot.category,
            dominantPollutant: airSnapshot.dominantPollutant,
            observedAt: airSnapshot.observedAt,
            source: airSnapshot.usAqi.source,
          }
        : null,
      hazards: {
        flood: hazard(groups.flood, "No active NWS flood alert for this point"),
        heat: hazard(groups.heat, "No active NWS heat alert for this point"),
        severeWeather: hazard(groups.severeWeather, "No active NWS severe-weather alert for this point"),
        fireWeather: hazard(groups.fireWeather, "No active NWS fire-weather alert for this point"),
      },
      alerts,
      gauges: gauges
        ? {
            status: gauges.status,
            fetchedAt: gauges.fetchedAt,
            stations: gauges.stations.slice(0, 4),
            sourceUrl: gauges.sourceUrl,
            caveats: gauges.caveats,
          }
        : null,
      availability: {
        air: Boolean(airUsable && airSnapshot),
        alerts: alertsResult.status === "fulfilled",
        gauges: waterResult.status === "fulfilled" && gauges?.status === "live",
      },
    });
  } catch (error) {
    return handleError(error);
  }
}
