/**
 * Exposure Navigator tools. Each tool wraps the same backend functions the
 * REST API uses — the agent can only see what the platform can source, which
 * is what keeps it from inventing data.
 */
import { geocode } from "../geocode";
import { getCurrentAirQuality } from "../openmeteo";
import { countyByName, countyByFips, countyForPoint, allCounties } from "../counties";
import {
  healthForCounty,
  vulnerabilityForCounty,
  healthBurdenScore,
  vulnerabilityScore,
  HEALTH_SOURCE,
  VULNERABILITY_SOURCE,
} from "../health";
import { nearestMonitor, monitorConfidenceScore, MONITOR_SOURCE } from "../monitors";
import { calculateRiskScore } from "../scoring";
import { addWatchRule } from "../store";
import { recentFetches } from "../freshness";

export interface ToolDef {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON schema
  execute: (args: Record<string, unknown>, ctx: ToolContext) => Promise<unknown>;
}

export interface ToolContext {
  userId: string;
  location?: { lat: number; lng: number; label?: string } | null;
}

const num = (v: unknown): number => {
  const n = typeof v === "string" ? parseFloat(v) : (v as number);
  if (!Number.isFinite(n)) throw new Error(`expected number, got ${String(v)}`);
  return n;
};

export const TOOLS: ToolDef[] = [
  {
    name: "geocodePlace",
    description: "Resolve a place name or address to coordinates. Use before any lat/lng tool when the user gives a place name.",
    parameters: {
      type: "object",
      properties: { query: { type: "string", description: "Place name, e.g. 'Allentown, PA'" } },
      required: ["query"],
    },
    execute: async (args) => {
      const results = await geocode(String(args.query), 3);
      return results.map((r) => ({
        displayName: r.displayName,
        lat: r.lat,
        lng: r.lng,
        source: r.source.name,
        status: r.source.status,
      }));
    },
  },
  {
    name: "getCurrentAirQuality",
    description: "Current air quality snapshot (PM2.5, ozone, NO2, US AQI) for coordinates, with source and freshness labels.",
    parameters: {
      type: "object",
      properties: { lat: { type: "number" }, lng: { type: "number" } },
      required: ["lat", "lng"],
    },
    execute: async (args) => {
      const { snapshot } = await getCurrentAirQuality(num(args.lat), num(args.lng));
      return {
        observedAt: snapshot.observedAt,
        usAqi: snapshot.usAqi.value,
        category: snapshot.category,
        dominantPollutant: snapshot.dominantPollutant,
        pm25_ugm3: snapshot.pm25.value,
        ozone_ugm3: snapshot.ozone.value,
        no2_ugm3: snapshot.no2.value,
        dataStatus: snapshot.usAqi.source.status,
        source: snapshot.usAqi.source.name,
        sourceNotes: snapshot.usAqi.source.notes,
      };
    },
  },
  {
    name: "getCountyProfile",
    description: "County health burden and social vulnerability indicators (population context, never individual diagnosis). Accepts county+state or fips.",
    parameters: {
      type: "object",
      properties: {
        county: { type: "string" },
        state: { type: "string", description: "2-letter state code" },
        fips: { type: "string", description: "5-digit county FIPS" },
      },
    },
    execute: async (args) => {
      const county = args.fips
        ? countyByFips(String(args.fips))
        : countyByName(String(args.county ?? ""), String(args.state ?? ""));
      if (!county) return { error: "county not found" };
      const burden = healthBurdenScore(county.fips);
      return {
        county: `${county.name}, ${county.state}`,
        fips: county.fips,
        health: healthForCounty(county.fips),
        healthSourceStatus: HEALTH_SOURCE.status,
        healthSourceName: HEALTH_SOURCE.name,
        vulnerability: vulnerabilityForCounty(county.fips),
        vulnerabilitySourceStatus: VULNERABILITY_SOURCE.status,
        healthBurdenScore: burden.score,
        dominantBurden: burden.dominant,
        vulnerabilityScore: vulnerabilityScore(county.fips).score,
      };
    },
  },
  {
    name: "getNearestMonitor",
    description: "Nearest air-quality monitor to coordinates: distance, pollutants, coverage rating, metadata provenance.",
    parameters: {
      type: "object",
      properties: { lat: { type: "number" }, lng: { type: "number" } },
      required: ["lat", "lng"],
    },
    execute: async (args) => {
      const res = nearestMonitor(num(args.lat), num(args.lng));
      if (!res) return { error: "no monitors in metadata set" };
      return {
        name: res.monitor.name,
        code: res.monitor.monitorCode,
        distanceKm: res.distanceKm,
        pollutants: res.monitor.pollutants,
        monitorsWithin25Km: res.monitorsWithin25Km,
        coverage: res.coverage,
        metadataStatus: res.source.status,
        metadataNotes: res.source.notes,
      };
    },
  },
  {
    name: "calculateRiskScore",
    description: "Full PASS alert-priority score (0-100) for coordinates with optional susceptibility profile (age, conditions). Returns component scores, explanation, caveats.",
    parameters: {
      type: "object",
      properties: {
        lat: { type: "number" },
        lng: { type: "number" },
        age: { type: "number" },
        conditions: {
          type: "array",
          items: { type: "string" },
          description: "e.g. ['asthma','copd','heart-disease']",
        },
      },
      required: ["lat", "lng"],
    },
    execute: async (args, ctx) => {
      const result = await calculateRiskScore(num(args.lat), num(args.lng), {
        age: args.age != null ? num(args.age) : null,
        conditions: Array.isArray(args.conditions) ? args.conditions.map(String) : [],
      });
      void ctx;
      return {
        finalScore: result.finalScore,
        level: result.level,
        explanation: result.explanation,
        components: {
          exposure: result.exposure.score,
          monitorConfidence: result.monitorConfidence.score,
          healthVulnerability: result.healthVulnerability.score,
          equity: result.equity.score,
          susceptibility: result.susceptibility.score,
        },
        caveats: result.caveats,
      };
    },
  },
  {
    name: "compareLocations",
    description: "Compare 2-5 locations: AQI, risk score, monitor coverage, county burden, data status. Provide coordinates (use geocodePlace first for names).",
    parameters: {
      type: "object",
      properties: {
        locations: {
          type: "array",
          items: {
            type: "object",
            properties: {
              label: { type: "string" },
              lat: { type: "number" },
              lng: { type: "number" },
            },
            required: ["lat", "lng"],
          },
          minItems: 2,
          maxItems: 5,
        },
        conditions: { type: "array", items: { type: "string" } },
      },
      required: ["locations"],
    },
    execute: async (args) => {
      const locs = args.locations as { label?: string; lat: number; lng: number }[];
      const conditions = Array.isArray(args.conditions) ? args.conditions.map(String) : [];
      return Promise.all(
        locs.slice(0, 5).map(async (l) => {
          const risk = await calculateRiskScore(num(l.lat), num(l.lng), { conditions });
          const { snapshot } = await getCurrentAirQuality(num(l.lat), num(l.lng));
          return {
            label: l.label ?? `${l.lat},${l.lng}`,
            usAqi: snapshot.usAqi.value,
            aqiStatus: snapshot.usAqi.source.status,
            finalScore: risk.finalScore,
            level: risk.level,
            monitorConfidence: risk.monitorConfidence.score,
            healthBurden: risk.healthVulnerability.score,
            equity: risk.equity.score,
          };
        })
      );
    },
  },
  {
    name: "createWatchRule",
    description: "Create an alert watch rule: notify when AQI at a location exceeds a threshold. Confirm the threshold with the user before calling if ambiguous.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string" },
        lat: { type: "number" },
        lng: { type: "number" },
        locationLabel: { type: "string" },
        thresholdAqi: { type: "number" },
        conditionProfile: { type: "string", description: "e.g. 'asthma, age 70'" },
      },
      required: ["name", "lat", "lng", "thresholdAqi"],
    },
    execute: async (args, ctx) => {
      const rule = await addWatchRule({
        userId: ctx.userId,
        name: String(args.name),
        lat: num(args.lat),
        lng: num(args.lng),
        locationLabel: args.locationLabel ? String(args.locationLabel) : null,
        conditionProfile: args.conditionProfile ? String(args.conditionProfile) : null,
        thresholdAqi: Math.round(num(args.thresholdAqi)),
        pollutant: "us_aqi",
        active: true,
      });
      return { created: true, ruleId: rule.id, name: rule.name, thresholdAqi: rule.thresholdAqi };
    },
  },
  {
    name: "summarizeSourceTrail",
    description: "List every data source behind a location's numbers with status (live/cached/fallback/official), vintage, and confidence.",
    parameters: {
      type: "object",
      properties: { lat: { type: "number" }, lng: { type: "number" } },
      required: ["lat", "lng"],
    },
    execute: async (args) => {
      const lat = num(args.lat);
      const lng = num(args.lng);
      const { snapshot } = await getCurrentAirQuality(lat, lng);
      const hit = await countyForPoint(lat, lng);
      return {
        airQuality: {
          source: snapshot.usAqi.source.name,
          status: snapshot.usAqi.source.status,
          confidence: snapshot.usAqi.source.confidence,
          fetchedAt: snapshot.usAqi.source.fetchedAt,
          notes: snapshot.usAqi.source.notes,
        },
        monitors: {
          source: MONITOR_SOURCE.name,
          status: MONITOR_SOURCE.status,
          confidence: MONITOR_SOURCE.confidence,
          notes: MONITOR_SOURCE.notes,
        },
        countyHealth: {
          source: HEALTH_SOURCE.name,
          status: HEALTH_SOURCE.status,
          confidence: HEALTH_SOURCE.confidence,
          vintage: HEALTH_SOURCE.vintage,
        },
        vulnerability: {
          source: VULNERABILITY_SOURCE.name,
          status: VULNERABILITY_SOURCE.status,
          confidence: VULNERABILITY_SOURCE.confidence,
          vintage: VULNERABILITY_SOURCE.vintage,
        },
        county: hit ? `${hit.county.name}, ${hit.county.state} (via ${hit.method})` : null,
        recentBackendFetches: recentFetches(5).map((f) => ({
          source: f.sourceName,
          ok: f.ok,
          at: f.fetchedAt,
        })),
      };
    },
  },
  {
    name: "recommendSensorPlacement",
    description: "Rank counties near a point where low-cost sensors would add the most value (weak monitor coverage × high vulnerability), with reasoning.",
    parameters: {
      type: "object",
      properties: {
        lat: { type: "number" },
        lng: { type: "number" },
        radiusKm: { type: "number", description: "search radius, default 120" },
        count: { type: "number", description: "how many candidates, default 5" },
      },
      required: ["lat", "lng"],
    },
    execute: async (args) => {
      const lat = num(args.lat);
      const lng = num(args.lng);
      const radiusKm = args.radiusKm ? num(args.radiusKm) : 120;
      const count = args.count ? Math.min(10, num(args.count)) : 5;
      const { haversineKm } = await import("../geo");
      const candidates = allCounties()
        .map((c) => ({
          county: c,
          distanceKm: haversineKm({ lat, lng }, { lat: c.centroidLat, lng: c.centroidLng }),
        }))
        .filter((x) => x.distanceKm <= radiusKm)
        .map((x) => {
          const mc = monitorConfidenceScore(x.county.centroidLat, x.county.centroidLng);
          const vuln = vulnerabilityScore(x.county.fips).score ?? 40;
          const gap = 100 - mc.score;
          return {
            county: `${x.county.name}, ${x.county.state}`,
            fips: x.county.fips,
            distanceKm: Math.round(x.distanceKm),
            coverageGap: gap,
            vulnerability: vuln,
            priority: Math.round(0.55 * gap + 0.45 * vuln),
            nearestMonitorKm: mc.nearest?.distanceKm ?? null,
            why: `Nearest monitor ${mc.nearest?.distanceKm ?? "?"} km from centroid (gap ${gap}/100); vulnerability ${vuln}/100. A low-cost sensor here would reduce estimation distance for a comparatively vulnerable population.`,
          };
        })
        .sort((a, b) => b.priority - a.priority)
        .slice(0, count);
      return {
        candidates,
        methodology: "priority = 0.55×coverage gap + 0.45×vulnerability, both 0-100. Coverage from monitor metadata; vulnerability from county indicators (check their status labels).",
      };
    },
  },
  {
    name: "generateClinicMessage",
    description: "Draft a clinic-safe resident message for current conditions in English or Spanish. Prevention-focused, no diagnosis.",
    parameters: {
      type: "object",
      properties: {
        lat: { type: "number" },
        lng: { type: "number" },
        conditionProfile: { type: "string", description: "e.g. 'asthma'" },
        language: { type: "string", enum: ["en", "es"] },
      },
      required: ["lat", "lng", "language"],
    },
    execute: async (args) => {
      const lat = num(args.lat);
      const lng = num(args.lng);
      const { snapshot } = await getCurrentAirQuality(lat, lng);
      const aqi = snapshot.usAqi.value;
      const cat = snapshot.category ?? "unknown";
      const cond = args.conditionProfile ? String(args.conditionProfile) : null;
      const es = args.language === "es";
      const isFallback = snapshot.usAqi.source.status === "fallback";
      const caution = aqi != null && aqi > 100;
      const moderate = aqi != null && aqi > 50 && aqi <= 100;

      const lines = es
        ? [
            `Actualización de calidad del aire (${new Date().toLocaleDateString("es-US")})`,
            aqi != null
              ? `El índice de calidad del aire (AQI) actual es ${aqi} — categoría "${cat}".`
              : "No hay datos de AQI disponibles en este momento.",
            cond ? `Para personas con ${cond}:` : "Para residentes sensibles al aire:",
            caution
              ? "Se recomienda limitar actividades prolongadas al aire libre hoy y tener a mano su medicamento de alivio según lo indicado por su equipo de salud."
              : moderate
                ? "Personas inusualmente sensibles pueden considerar reducir esfuerzos prolongados al aire libre."
                : "Las condiciones actuales no requieren precauciones especiales; mantenga su plan de manejo habitual.",
            "Este mensaje es informativo y no sustituye el consejo médico. Consulte a su equipo de salud ante síntomas.",
            isFallback ? "AVISO: datos de demostración (fuente en vivo no disponible)." : `Fuente: ${snapshot.usAqi.source.name}.`,
          ]
        : [
            `Air quality update (${new Date().toLocaleDateString("en-US")})`,
            aqi != null
              ? `The current Air Quality Index (AQI) is ${aqi} — "${cat}" category.`
              : "AQI data is not available right now.",
            cond ? `For people managing ${cond}:` : "For air-sensitive residents:",
            caution
              ? "Consider limiting prolonged outdoor activity today and keep your reliever medication available as directed by your care team."
              : moderate
                ? "Unusually sensitive individuals may consider reducing prolonged outdoor exertion."
                : "Current conditions do not call for special precautions; keep to your usual management plan.",
            "This message is informational and is not medical advice. Contact your care team about symptoms.",
            isFallback ? "NOTE: demonstration data (live source unavailable)." : `Source: ${snapshot.usAqi.source.name}.`,
          ];
      return { language: args.language, aqi, category: cat, dataStatus: snapshot.usAqi.source.status, message: lines.join("\n\n") };
    },
  },
  {
    name: "explainUncertainty",
    description: "Explain what is and isn't known for a location: which values are live vs cached vs fallback, monitor distance, dataset vintages, and interpretation limits.",
    parameters: {
      type: "object",
      properties: { lat: { type: "number" }, lng: { type: "number" } },
      required: ["lat", "lng"],
    },
    execute: async (args) => {
      const lat = num(args.lat);
      const lng = num(args.lng);
      const { snapshot } = await getCurrentAirQuality(lat, lng);
      const mc = monitorConfidenceScore(lat, lng);
      return {
        airQualityStatus: snapshot.usAqi.source.status,
        airQualityIsModeled: true,
        airQualityNote:
          "Concentrations are model output (or labeled fallback), not a direct monitor reading at this exact point. Hourly snapshot AQI ≠ 24-hour regulatory AQI ≠ annual design value.",
        monitorCoverage: {
          confidence: mc.score,
          nearestKm: mc.nearest?.distanceKm ?? null,
          note: mc.nearest
            ? `Verification against a physical monitor is ${mc.nearest.coverage} here.`
            : "No monitor metadata available.",
          metadataStatus: MONITOR_SOURCE.status,
        },
        countyDataVintage: {
          health: { vintage: HEALTH_SOURCE.vintage, status: HEALTH_SOURCE.status },
          vulnerability: { vintage: VULNERABILITY_SOURCE.vintage, status: VULNERABILITY_SOURCE.status },
          note: "County indicators change slowly (annual releases); they describe populations, not individuals.",
        },
      };
    },
  },
];

export function toolByName(name: string): ToolDef | undefined {
  return TOOLS.find((t) => t.name === name);
}
