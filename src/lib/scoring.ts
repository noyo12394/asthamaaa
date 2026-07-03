/**
 * PASS transparent scoring engine.
 *
 * Every component is 0-100, computed from labeled inputs, and returned with
 * its own explanation + sources so the UI can render a full audit trail.
 * The formula is documented for review in SCORING.md and the /methods page;
 * weights are constants here, not tuned parameters.
 *
 * Guardrails encoded here:
 * - A snapshot AQI is never presented as a regulatory/annual value.
 * - County-level health burden is population context, not individual risk.
 * - Fallback data caps confidence labels and adds explicit caveats.
 */
import { clampNumber } from "./geo";
import { monitorConfidenceScore } from "./monitors";
import { healthBurdenScore, vulnerabilityScore, HEALTH_SOURCE, VULNERABILITY_SOURCE } from "./health";
import { getCurrentAirQuality } from "./openmeteo";
import { countyForPoint, COUNTY_SOURCE } from "./counties";
import type {
  RiskLevel,
  RiskScoreResult,
  ScoreComponent,
  SusceptibilityProfile,
} from "./types";

export const WEIGHTS = {
  exposure: 0.4,
  healthVulnerability: 0.2,
  equity: 0.2,
  susceptibility: 0.2,
} as const;

/** AQI -> exposure score. Piecewise so 100 AQI (Moderate ceiling) maps to 50. */
export function exposureFromAqi(aqi: number): number {
  if (aqi <= 50) return clampNumber(aqi * 0.5, 0, 25);
  if (aqi <= 100) return 25 + (aqi - 50) * 0.5;
  if (aqi <= 200) return 50 + (aqi - 100) * 0.35;
  return clampNumber(85 + (aqi - 200) * 0.05, 85, 100);
}

const CONDITION_POINTS: Record<string, number> = {
  asthma: 30,
  copd: 30,
  "heart-disease": 25,
  heartdisease: 25,
  diabetes: 15,
  pregnancy: 15,
  hypertension: 10,
};

export function susceptibilityFromProfile(profile: SusceptibilityProfile): {
  score: number;
  notes: string[];
} {
  let score = 20; // general-population baseline
  const notes: string[] = [];
  if (profile.age != null) {
    if (profile.age >= 65) {
      score += 25;
      notes.push("age 65+ increases sensitivity to particle pollution");
    } else if (profile.age <= 12) {
      score += 20;
      notes.push("children breathe more air per body weight");
    }
  }
  for (const raw of profile.conditions) {
    const key = raw.trim().toLowerCase().replace(/[\s_]/g, "-");
    const pts = CONDITION_POINTS[key] ?? CONDITION_POINTS[key.replace(/-/g, "")];
    if (pts) {
      score += pts;
      notes.push(`${raw} is aggravated by PM2.5/ozone exposure`);
    }
  }
  return { score: clampNumber(score, 0, 100), notes };
}

export function levelForScore(score: number): RiskLevel {
  if (score < 25) return "Low";
  if (score < 50) return "Moderate";
  if (score < 70) return "High";
  return "Very High";
}

export async function calculateRiskScore(
  lat: number,
  lng: number,
  profile: SusceptibilityProfile = { conditions: [] }
): Promise<RiskScoreResult> {
  const [{ snapshot }, countyHit] = await Promise.all([
    getCurrentAirQuality(lat, lng),
    countyForPoint(lat, lng),
  ]);
  const county = countyHit?.county ?? null;
  const caveats: string[] = [];

  // --- Exposure ---
  const aqi = snapshot.usAqi.value;
  const exposureScore = aqi != null ? Math.round(exposureFromAqi(aqi)) : 35;
  if (aqi == null) caveats.push("Current AQI unavailable; exposure assumed mid-range.");
  if (snapshot.usAqi.source.status === "fallback") {
    caveats.push(
      "Air-quality source unreachable — exposure uses a labeled synthetic fallback field, not real conditions."
    );
  }
  const exposure: ScoreComponent = {
    score: exposureScore,
    weight: WEIGHTS.exposure,
    label: "Current exposure",
    explanation:
      aqi != null
        ? `Snapshot US AQI ${aqi} (${snapshot.category ?? "unknown"}), dominant pollutant ${snapshot.dominantPollutant ?? "n/a"}. This is an hourly model snapshot, not a 24-hour regulatory AQI.`
        : "No current AQI available for this point.",
    inputs: {
      usAqi: aqi,
      pm25_ugm3: snapshot.pm25.value,
      ozone_ugm3: snapshot.ozone.value,
      no2_ugm3: snapshot.no2.value,
      observedAt: snapshot.observedAt,
    },
    sources: [snapshot.usAqi.source],
  };

  // --- Monitor confidence ---
  const mc = monitorConfidenceScore(lat, lng);
  const monitorConfidence: ScoreComponent = {
    score: mc.score,
    weight: 0, // shown separately; feeds the equity component below
    label: "Monitor coverage confidence",
    explanation: mc.nearest
      ? `Nearest monitor ${mc.nearest.monitor.name} is ${mc.nearest.distanceKm} km away; ${mc.nearest.monitorsWithin25Km} monitor(s) within 25 km (coverage: ${mc.nearest.coverage}). Distance-decay 70% + density 30%.`
      : "No monitors in the metadata set.",
    inputs: {
      nearestDistanceKm: mc.nearest?.distanceKm ?? null,
      monitorsWithin25Km: mc.nearest?.monitorsWithin25Km ?? null,
      coverage: mc.nearest?.coverage ?? null,
    },
    sources: mc.nearest ? [mc.nearest.source] : [],
  };
  if (mc.nearest?.source.status === "fallback") {
    caveats.push(
      "Monitor list is a seed fallback (synthetic placements) — run the AirNow ingestion for real EPA site distances."
    );
  }

  // --- Health vulnerability (county) ---
  const hb = county ? healthBurdenScore(county.fips) : { score: null, dominant: null, detail: {} };
  const healthScore = hb.score ?? 40;
  if (hb.score == null) caveats.push("No county health indicators found; mid-range assumed.");
  const healthVulnerability: ScoreComponent = {
    score: healthScore,
    weight: WEIGHTS.healthVulnerability,
    label: "Community health burden",
    explanation: county
      ? `County-level chronic-condition prevalence for ${county.name}, ${county.state} normalized against high-burden reference ceilings; heaviest contributor: ${hb.dominant ?? "n/a"}. Population context — NOT an individual diagnosis.`
      : "Point could not be matched to a US county.",
    inputs: { countyFips: county?.fips ?? null, ...hb.detail },
    sources: [HEALTH_SOURCE, COUNTY_SOURCE],
  };
  if (HEALTH_SOURCE.status === "fallback") {
    caveats.push("County health values are labeled fallback estimates, not CDC PLACES data.");
  }

  // --- Equity: vulnerability × weak monitoring ---
  const vs = county ? vulnerabilityScore(county.fips) : { score: null, svi: null };
  const vulnScore = vs.score ?? 40;
  const coverageGap = 100 - mc.score;
  const equityScore = Math.round(0.6 * vulnScore + 0.4 * coverageGap);
  const equity: ScoreComponent = {
    score: equityScore,
    weight: WEIGHTS.equity,
    label: "Equity burden",
    explanation: `Social vulnerability (${vulnScore}/100${vs.svi != null ? `, SVI percentile ${vs.svi}` : ""}) weighted 60% + monitoring coverage gap (${coverageGap}/100) weighted 40%. High values flag vulnerable communities with weak observational coverage.`,
    inputs: { vulnerabilityScore: vulnScore, sviPercentile: vs.svi, coverageGap },
    sources: [VULNERABILITY_SOURCE],
  };
  if (VULNERABILITY_SOURCE.status === "fallback") {
    caveats.push("Vulnerability values are labeled fallback estimates, not CDC/ATSDR SVI data.");
  }

  // --- Susceptibility (user profile) ---
  const sus = susceptibilityFromProfile(profile);
  const susceptibility: ScoreComponent = {
    score: sus.score,
    weight: WEIGHTS.susceptibility,
    label: "Personal susceptibility",
    explanation:
      profile.conditions.length || profile.age != null
        ? `Profile-based sensitivity (age ${profile.age ?? "unspecified"}; conditions: ${profile.conditions.join(", ") || "none"}). ${sus.notes.join("; ")}. Prevention-focused weighting, not a medical assessment.`
        : "No susceptibility profile provided — general-population baseline of 20 used.",
    inputs: { age: profile.age ?? null, conditions: profile.conditions.join(", ") || null },
    sources: [],
  };

  const finalScore = Math.round(
    exposure.score * WEIGHTS.exposure +
      healthVulnerability.score * WEIGHTS.healthVulnerability +
      equity.score * WEIGHTS.equity +
      susceptibility.score * WEIGHTS.susceptibility
  );
  const level = levelForScore(finalScore);

  caveats.push(
    "Scores combine snapshot conditions with long-vintage population data; they prioritize attention, they do not measure personal dose."
  );

  const explanation =
    `${level} alert priority (${finalScore}/100). ` +
    `Exposure ${exposure.score}/100 × ${WEIGHTS.exposure}, community health ${healthVulnerability.score}/100 × ${WEIGHTS.healthVulnerability}, ` +
    `equity ${equity.score}/100 × ${WEIGHTS.equity}, susceptibility ${susceptibility.score}/100 × ${WEIGHTS.susceptibility}. ` +
    `Monitor coverage confidence is reported separately at ${monitorConfidence.score}/100 and raises the equity term when coverage is weak.`;

  return {
    lat,
    lng,
    countyFips: county?.fips ?? null,
    exposure,
    monitorConfidence,
    healthVulnerability,
    equity,
    susceptibility,
    finalScore,
    level,
    explanation,
    caveats,
    calculatedAt: new Date().toISOString(),
  };
}
