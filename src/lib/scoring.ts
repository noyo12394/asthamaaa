import { getCounty, type County, type CountyMetrics } from "./counties";

export interface UserProfile {
  ageGroup: string;
  conditions: string[];
  county: string;
}

export type RiskLevel = "Low" | "Moderate" | "High" | "Very High";
export type Confidence = "High" | "Medium" | "Low";
export type ActionLevel = "Routine" | "Caution" | "Reduce Exposure" | "Avoid Exposure";
export type PollutantStatus =
  | "good"
  | "moderate"
  | "unhealthy-sensitive"
  | "unhealthy"
  | "hazardous";

export interface ScoreComponent {
  /** 0–100 sub-score for this dimension */
  score: number;
  /** weighted points this dimension contributes to the overall (components sum to overall) */
  contribution: number;
  /** plain-language explanation of the sub-score */
  detail: string;
}

export interface PollutantReading {
  key: string;
  label: string;
  /** 0–100 normalized risk for charts */
  value: number;
  /** display value with units */
  display: string;
  status: PollutantStatus;
  message: string;
}

export interface HealthBurdenReading {
  key: string;
  label: string;
  /** raw prevalence % */
  prevalence: number;
  /** 0–100 normalized for charts */
  value: number;
  level: "low" | "moderate" | "elevated" | "high";
}

export interface MonitorAssessment {
  nearestMonitorMiles: number;
  nearestMonitorName: string;
  monitorsWithin25mi: number;
  confidence: Confidence;
  confidenceNote: string;
  coverageGap: boolean;
}

export interface Assessment {
  county: County;
  overallScore: number; // 0–100
  level: RiskLevel;
  actionLevel: ActionLevel;
  components: {
    exposure: ScoreComponent;
    susceptibility: ScoreComponent;
    monitorGap: ScoreComponent;
    healthBurden: ScoreComponent;
  };
  topFactor: { key: string; label: string; contribution: number };
  why: string[];
  pollutants: PollutantReading[];
  healthBurden: HealthBurdenReading[];
  monitor: MonitorAssessment;
  recommendations: string[];
  sensitiveConditionCount: number;
  isSusceptible: boolean;
}

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));
const norm = (v: number, lo: number, hi: number) => clamp(((v - lo) / (hi - lo)) * 100);

// Weights — susceptibility, exposure and health burden drive risk; the monitor
// gap is a small contributor because it flags *uncertainty*, not danger.
const WEIGHTS = {
  exposure: 0.3,
  susceptibility: 0.3,
  monitorGap: 0.1,
  healthBurden: 0.3,
};

const AGE_POINTS: Record<string, number> = {
  under18: 25,
  "18-29": 5,
  "30-49": 10,
  "50-64": 25,
  "65plus": 45,
};

const CONDITION_POINTS: Record<string, number> = {
  asthma: 18,
  copd: 20,
  heart_disease: 18,
  diabetes: 14,
  hypertension: 12,
  obesity: 10,
  cancer: 14,
  hypothyroidism: 6,
  immunocompromised: 18,
  pregnancy: 14,
};

function exposureComponent(m: CountyMetrics): ScoreComponent {
  const pm = norm(m.pm25, 5, 15);
  const score = clamp(pm * 0.4 + m.no2Index * 0.3 + m.ozoneIndex * 0.2 + m.so2Index * 0.1);
  const drivers: string[] = [];
  if (pm >= 60) drivers.push("elevated PM2.5");
  if (m.no2Index >= 55) drivers.push("traffic-related NO₂");
  if (m.ozoneIndex >= 58) drivers.push("seasonal ozone");
  if (m.so2Index >= 45) drivers.push("industrial SO₂");
  return {
    score: Math.round(score),
    contribution: score * WEIGHTS.exposure,
    detail: drivers.length
      ? `Driven by ${drivers.join(", ")}.`
      : "Ambient pollutant levels are relatively moderate for the region.",
  };
}

function susceptibilityComponent(profile: UserProfile): ScoreComponent {
  const agePts = AGE_POINTS[profile.ageGroup] ?? 10;
  const condPts = profile.conditions
    .filter((c) => c !== "none")
    .reduce((s, c) => s + (CONDITION_POINTS[c] ?? 0), 0);
  const score = clamp(agePts + condPts);
  const parts: string[] = [];
  if (agePts >= 25) parts.push("age group with heightened sensitivity");
  const conds = profile.conditions.filter((c) => c !== "none");
  if (conds.length) parts.push(`${conds.length} reported condition${conds.length > 1 ? "s" : ""}`);
  return {
    score: Math.round(score),
    contribution: score * WEIGHTS.susceptibility,
    detail: parts.length
      ? `Based on ${parts.join(" and ")}.`
      : "No elevated personal susceptibility factors reported.",
  };
}

function monitorComponent(m: CountyMetrics): ScoreComponent {
  const distPenalty = norm(m.nearestMonitorMiles, 5, 30);
  const countRelief = (Math.min(m.monitorsWithin25mi, 4) / 4) * 30;
  const score = clamp(distPenalty - countRelief);
  return {
    score: Math.round(score),
    contribution: score * WEIGHTS.monitorGap,
    detail:
      m.nearestMonitorMiles > 20
        ? `Nearest EPA monitor is ${m.nearestMonitorMiles.toFixed(0)} mi away — large coverage gap increases estimate uncertainty.`
        : `Nearest EPA monitor is ${m.nearestMonitorMiles.toFixed(1)} mi away with ${m.monitorsWithin25mi} within 25 mi.`,
  };
}

function healthBurdenComponent(m: CountyMetrics): ScoreComponent {
  const asthma = norm(m.asthma, 8, 14);
  const diabetes = norm(m.diabetes, 7, 14);
  const heart = norm(m.heartDisease, 4, 7);
  const copd = norm(m.copd, 4, 8);
  const obesity = norm(m.obesity, 24, 35);
  const prevAvg = (asthma + diabetes + heart + copd + obesity) / 5;
  const score = clamp(prevAvg * 0.6 + m.vulnerabilityIndex * 0.4);
  return {
    score: Math.round(score),
    contribution: score * WEIGHTS.healthBurden,
    detail:
      m.vulnerabilityIndex >= 60
        ? "High community health burden and population vulnerability in this county."
        : "Community health burden is around or below the state midpoint.",
  };
}

function pollutantStatus(value: number): PollutantStatus {
  if (value < 25) return "good";
  if (value < 45) return "moderate";
  if (value < 65) return "unhealthy-sensitive";
  if (value < 82) return "unhealthy";
  return "hazardous";
}

const POLLUTANT_MESSAGES: Record<PollutantStatus, (label: string) => string> = {
  good: (l) => `${l} levels are within a generally safe range.`,
  moderate: (l) => `${l} levels are moderate — sensitive individuals should stay aware.`,
  "unhealthy-sensitive": (l) =>
    `${l} may affect sensitive groups. Consider limiting prolonged outdoor exertion.`,
  unhealthy: (l) => `${l} is elevated. Reduce outdoor activity, especially if you are sensitive.`,
  hazardous: (l) => `${l} is at a hazardous level. Stay indoors and use filtration where possible.`,
};

function buildPollutants(m: CountyMetrics, susceptible: boolean): PollutantReading[] {
  // Lower the effective threshold for sensitive users by inflating perceived value.
  const bump = susceptible ? 1.15 : 1;
  const pm = clamp(norm(m.pm25, 5, 15) * bump);
  const readings: Array<Omit<PollutantReading, "status" | "message">> = [
    { key: "pm25", label: "PM2.5", value: Math.round(pm), display: `${m.pm25.toFixed(1)} µg/m³` },
    { key: "no2", label: "NO₂", value: Math.round(clamp(m.no2Index * bump)), display: `Index ${m.no2Index}` },
    { key: "ozone", label: "Ozone", value: Math.round(clamp(m.ozoneIndex * bump)), display: `Index ${m.ozoneIndex}` },
    { key: "so2", label: "SO₂", value: Math.round(clamp(m.so2Index * bump)), display: `Index ${m.so2Index}` },
  ];
  return readings.map((r) => {
    const status = pollutantStatus(r.value);
    return { ...r, status, message: POLLUTANT_MESSAGES[status](r.label) };
  });
}

function burdenLevel(v: number): HealthBurdenReading["level"] {
  if (v < 30) return "low";
  if (v < 55) return "moderate";
  if (v < 75) return "elevated";
  return "high";
}

function buildHealthBurden(m: CountyMetrics): HealthBurdenReading[] {
  return [
    { key: "asthma", label: "Asthma", prevalence: m.asthma, value: Math.round(norm(m.asthma, 8, 14)) },
    { key: "diabetes", label: "Diabetes", prevalence: m.diabetes, value: Math.round(norm(m.diabetes, 7, 14)) },
    { key: "heart", label: "Heart Disease", prevalence: m.heartDisease, value: Math.round(norm(m.heartDisease, 4, 7)) },
    { key: "copd", label: "COPD", prevalence: m.copd, value: Math.round(norm(m.copd, 4, 8)) },
    { key: "obesity", label: "Obesity", prevalence: m.obesity, value: Math.round(norm(m.obesity, 24, 35)) },
  ].map((r) => ({ ...r, level: burdenLevel(r.value) }));
}

function monitorAssessment(m: CountyMetrics): MonitorAssessment {
  let confidence: Confidence;
  let confidenceNote: string;
  if (m.nearestMonitorMiles <= 10 && m.monitorsWithin25mi >= 2) {
    confidence = "High";
    confidenceNote = "A nearby EPA monitor anchors this estimate with strong certainty.";
  } else if (m.nearestMonitorMiles <= 20) {
    confidence = "Medium";
    confidenceNote = "Estimate blends a moderately distant monitor with county-level context.";
  } else {
    confidence = "Low";
    confidenceNote = "Sparse monitor coverage — risk is inferred from distant monitors and county vulnerability. Treat the level as a flag to investigate, not a precise reading.";
  }
  return {
    nearestMonitorMiles: m.nearestMonitorMiles,
    nearestMonitorName: m.nearestMonitorName,
    monitorsWithin25mi: m.monitorsWithin25mi,
    confidence,
    confidenceNote,
    coverageGap: m.nearestMonitorMiles > 15.5,
  };
}

function buildRecommendations(profile: UserProfile, pollutants: PollutantReading[]): string[] {
  const recs: string[] = [];
  const conds = profile.conditions.filter((c) => c !== "none");
  const highExposure = pollutants.some(
    (p) => p.status === "unhealthy-sensitive" || p.status === "unhealthy" || p.status === "hazardous"
  );
  const lowerThreshold =
    profile.ageGroup === "65plus" ||
    profile.ageGroup === "under18" ||
    conds.includes("pregnancy") ||
    conds.includes("immunocompromised");

  if (conds.includes("asthma") || conds.includes("copd")) {
    recs.push(
      "Asthma/COPD: avoid outdoor exertion on high PM2.5 or ozone days, keep your rescue inhaler accessible, and check the daily AQI before activity."
    );
  }
  if (conds.includes("heart_disease")) {
    recs.push(
      "Heart disease: avoid heavy exertion during high-pollution periods; PM2.5 spikes are linked to cardiovascular events."
    );
  }
  if (conds.includes("diabetes") || conds.includes("obesity")) {
    recs.push(
      "Diabetes/obesity: take extra caution combining heat and poor air quality; stay hydrated and limit midday outdoor activity."
    );
  }
  if (lowerThreshold) {
    recs.push(
      "Your group warrants a lower alert threshold — act on 'Moderate' air quality the way others would act on 'Unhealthy'."
    );
  }
  if (highExposure && conds.length) {
    recs.push(
      "Given your conditions and current local air quality, consider discussing a preventive plan with your healthcare provider before symptoms appear."
    );
  }
  if (!recs.length) {
    recs.push(
      "Your current risk profile is low. Keep monitoring local air quality and maintain routine preventive checkups."
    );
  }
  return recs;
}

function actionLevelFor(level: RiskLevel): ActionLevel {
  switch (level) {
    case "Low": return "Routine";
    case "Moderate": return "Caution";
    case "High": return "Reduce Exposure";
    case "Very High": return "Avoid Exposure";
  }
}

export function assess(profile: UserProfile): Assessment | null {
  const county = getCounty(profile.county);
  if (!county) return null;
  const m = county.metrics;

  const exposure = exposureComponent(m);
  const susceptibility = susceptibilityComponent(profile);
  const monitorGap = monitorComponent(m);
  const healthBurden = healthBurdenComponent(m);

  const overallScore = Math.round(
    exposure.contribution + susceptibility.contribution + monitorGap.contribution + healthBurden.contribution
  );

  let level: RiskLevel;
  if (overallScore < 25) level = "Low";
  else if (overallScore < 45) level = "Moderate";
  else if (overallScore < 65) level = "High";
  else level = "Very High";

  const factorList = [
    { key: "exposure", label: "Air pollution exposure", contribution: exposure.contribution },
    { key: "susceptibility", label: "Personal susceptibility", contribution: susceptibility.contribution },
    { key: "healthBurden", label: "County health burden", contribution: healthBurden.contribution },
    { key: "monitorGap", label: "Monitor coverage gap", contribution: monitorGap.contribution },
  ];
  const topFactor = factorList.reduce((a, b) => (b.contribution > a.contribution ? b : a));

  const sensitiveConditionCount = profile.conditions.filter((c) => c !== "none").length;
  const isSusceptible = susceptibility.score >= 25;

  const pollutants = buildPollutants(m, isSusceptible);
  const monitor = monitorAssessment(m);

  const why: string[] = [
    `${topFactor.label} is the largest contributor to your ${level.toLowerCase()} risk.`,
    exposure.detail,
    susceptibility.detail,
    monitor.confidence === "Low"
      ? "Monitor coverage here is sparse, so the estimate carries higher uncertainty."
      : `Monitor coverage is adequate (${monitor.confidence.toLowerCase()} confidence).`,
  ];

  return {
    county,
    overallScore,
    level,
    actionLevel: actionLevelFor(level),
    components: { exposure, susceptibility, monitorGap, healthBurden },
    topFactor,
    why,
    pollutants,
    healthBurden: buildHealthBurden(m),
    monitor,
    recommendations: buildRecommendations(profile, pollutants),
    sensitiveConditionCount,
    isSusceptible,
  };
}
