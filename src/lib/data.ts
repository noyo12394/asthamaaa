export const AGE_GROUPS = [
  { value: "under18", label: "Under 18" },
  { value: "18-29", label: "18–29" },
  { value: "30-49", label: "30–49" },
  { value: "50-64", label: "50–64" },
  { value: "65plus", label: "65 and older" },
];

export const HEALTH_CONDITIONS = [
  { value: "asthma", label: "Asthma" },
  { value: "diabetes", label: "Diabetes" },
  { value: "hypertension", label: "Hypertension (High Blood Pressure)" },
  { value: "obesity", label: "Obesity" },
  { value: "heart_disease", label: "Heart Disease" },
  { value: "copd", label: "COPD (Chronic Obstructive Pulmonary Disease)" },
  { value: "cancer", label: "Cancer (current or history)" },
  { value: "hypothyroidism", label: "Hypothyroidism" },
  { value: "immunocompromised", label: "Immunocompromised Condition" },
  { value: "pregnancy", label: "Pregnancy" },
  { value: "none", label: "None of the above" },
];

export const PA_COUNTIES = [
  { value: "lehigh", label: "Lehigh County", region: "Lehigh Valley" },
  { value: "northampton", label: "Northampton County", region: "Lehigh Valley" },
  { value: "berks", label: "Berks County", region: "Southeast PA" },
  { value: "philadelphia", label: "Philadelphia County", region: "Southeast PA" },
  { value: "allegheny", label: "Allegheny County (Pittsburgh)", region: "Southwest PA" },
  { value: "dauphin", label: "Dauphin County (Harrisburg)", region: "Central PA" },
  { value: "lancaster", label: "Lancaster County", region: "Southeast PA" },
  { value: "monroe", label: "Monroe County", region: "Northeast PA" },
  { value: "luzerne", label: "Luzerne County", region: "Northeast PA" },
  { value: "centre", label: "Centre County", region: "Central PA" },
  { value: "other", label: "Other PA County" },
];

export interface UserProfile {
  ageGroup: string;
  conditions: string[];
  county: string;
}

export interface RiskAssessment {
  overallRisk: "low" | "moderate" | "high" | "very-high";
  susceptibilityScore: number;
  exposureAlerts: ExposureAlert[];
  healthOutcomes: HealthOutcome[];
  recommendations: string[];
  monitorCoverage: MonitorCoverage;
}

export interface ExposureAlert {
  pollutant: string;
  level: string;
  unit: string;
  status: "good" | "moderate" | "unhealthy-sensitive" | "unhealthy" | "hazardous";
  message: string;
}

export interface HealthOutcome {
  condition: string;
  prevalenceRate: string;
  riskLevel: "low" | "moderate" | "elevated" | "high";
  description: string;
}

export interface MonitorCoverage {
  nearestMonitorMiles: number;
  withinCoverage: boolean;
  coverageGap: boolean;
  monitorType: string;
}

const COUNTY_DATA: Record<string, {
  pm25: number;
  no2: number;
  so2: number;
  ozone: number;
  nearestMonitorMiles: number;
  monitorType: string;
  asthmaRate: number;
  diabetesRate: number;
  heartDiseaseRate: number;
  cancerRate: number;
  obesityRate: number;
}> = {
  lehigh: {
    pm25: 11.2, no2: 18.5, so2: 3.1, ozone: 0.062,
    nearestMonitorMiles: 5.2, monitorType: "EPA AQS Monitor",
    asthmaRate: 12.8, diabetesRate: 11.5, heartDiseaseRate: 6.2, cancerRate: 4.1, obesityRate: 33.2,
  },
  northampton: {
    pm25: 10.8, no2: 15.2, so2: 2.8, ozone: 0.059,
    nearestMonitorMiles: 12.4, monitorType: "EPA AQS Monitor",
    asthmaRate: 11.5, diabetesRate: 10.8, heartDiseaseRate: 5.9, cancerRate: 3.8, obesityRate: 31.5,
  },
  philadelphia: {
    pm25: 13.1, no2: 24.3, so2: 4.5, ozone: 0.068,
    nearestMonitorMiles: 2.1, monitorType: "EPA AQS Monitor",
    asthmaRate: 15.2, diabetesRate: 14.1, heartDiseaseRate: 7.8, cancerRate: 4.9, obesityRate: 36.1,
  },
  allegheny: {
    pm25: 14.5, no2: 22.1, so2: 5.8, ozone: 0.065,
    nearestMonitorMiles: 3.5, monitorType: "EPA AQS Monitor",
    asthmaRate: 14.1, diabetesRate: 12.9, heartDiseaseRate: 7.2, cancerRate: 4.6, obesityRate: 34.8,
  },
  berks: {
    pm25: 10.5, no2: 14.1, so2: 2.5, ozone: 0.058,
    nearestMonitorMiles: 18.7, monitorType: "EPA AQS Monitor",
    asthmaRate: 11.2, diabetesRate: 10.2, heartDiseaseRate: 5.5, cancerRate: 3.5, obesityRate: 30.8,
  },
  dauphin: {
    pm25: 10.9, no2: 16.3, so2: 3.2, ozone: 0.060,
    nearestMonitorMiles: 7.8, monitorType: "EPA AQS Monitor",
    asthmaRate: 12.1, diabetesRate: 11.1, heartDiseaseRate: 6.0, cancerRate: 3.9, obesityRate: 32.1,
  },
  lancaster: {
    pm25: 11.8, no2: 13.8, so2: 2.3, ozone: 0.061,
    nearestMonitorMiles: 15.3, monitorType: "EPA AQS Monitor",
    asthmaRate: 10.8, diabetesRate: 9.8, heartDiseaseRate: 5.3, cancerRate: 3.4, obesityRate: 29.5,
  },
  monroe: {
    pm25: 8.9, no2: 9.5, so2: 1.8, ozone: 0.055,
    nearestMonitorMiles: 33.1, monitorType: "Nearest EPA Monitor (remote)",
    asthmaRate: 10.5, diabetesRate: 9.5, heartDiseaseRate: 5.1, cancerRate: 3.2, obesityRate: 28.9,
  },
  luzerne: {
    pm25: 9.8, no2: 11.2, so2: 2.9, ozone: 0.057,
    nearestMonitorMiles: 28.5, monitorType: "Nearest EPA Monitor (remote)",
    asthmaRate: 12.5, diabetesRate: 11.8, heartDiseaseRate: 6.5, cancerRate: 4.0, obesityRate: 33.8,
  },
  centre: {
    pm25: 8.2, no2: 8.8, so2: 1.5, ozone: 0.053,
    nearestMonitorMiles: 42.3, monitorType: "Nearest EPA Monitor (remote)",
    asthmaRate: 9.2, diabetesRate: 8.5, heartDiseaseRate: 4.8, cancerRate: 3.0, obesityRate: 27.2,
  },
  other: {
    pm25: 9.5, no2: 10.5, so2: 2.0, ozone: 0.056,
    nearestMonitorMiles: 35.0, monitorType: "Nearest EPA Monitor (remote)",
    asthmaRate: 10.8, diabetesRate: 10.0, heartDiseaseRate: 5.5, cancerRate: 3.5, obesityRate: 30.0,
  },
};

function getSusceptibilityMultiplier(profile: UserProfile): number {
  let multiplier = 1.0;

  if (profile.ageGroup === "65plus") multiplier += 0.6;
  else if (profile.ageGroup === "under18") multiplier += 0.4;
  else if (profile.ageGroup === "50-64") multiplier += 0.3;

  const conditionWeights: Record<string, number> = {
    asthma: 0.5,
    copd: 0.6,
    heart_disease: 0.5,
    diabetes: 0.4,
    hypertension: 0.35,
    obesity: 0.3,
    cancer: 0.4,
    hypothyroidism: 0.2,
    immunocompromised: 0.5,
    pregnancy: 0.4,
  };

  for (const c of profile.conditions) {
    multiplier += conditionWeights[c] ?? 0;
  }

  return Math.min(multiplier, 3.5);
}

function getPollutantStatus(pollutant: string, value: number, susceptible: boolean): ExposureAlert["status"] {
  if (pollutant === "pm25") {
    const thresholds = susceptible
      ? { good: 6, moderate: 9, unhealthySensitive: 12, unhealthy: 25 }
      : { good: 9, moderate: 12, unhealthySensitive: 35.4, unhealthy: 55.4 };
    if (value <= thresholds.good) return "good";
    if (value <= thresholds.moderate) return "moderate";
    if (value <= thresholds.unhealthySensitive) return "unhealthy-sensitive";
    if (value <= thresholds.unhealthy) return "unhealthy";
    return "hazardous";
  }
  if (pollutant === "no2") {
    const thresholds = susceptible
      ? { good: 10, moderate: 15, unhealthySensitive: 25, unhealthy: 50 }
      : { good: 20, moderate: 35, unhealthySensitive: 53, unhealthy: 100 };
    if (value <= thresholds.good) return "good";
    if (value <= thresholds.moderate) return "moderate";
    if (value <= thresholds.unhealthySensitive) return "unhealthy-sensitive";
    if (value <= thresholds.unhealthy) return "unhealthy";
    return "hazardous";
  }
  if (pollutant === "so2") {
    const thresholds = susceptible
      ? { good: 2, moderate: 3, unhealthySensitive: 5, unhealthy: 15 }
      : { good: 4, moderate: 5, unhealthySensitive: 15, unhealthy: 35 };
    if (value <= thresholds.good) return "good";
    if (value <= thresholds.moderate) return "moderate";
    if (value <= thresholds.unhealthySensitive) return "unhealthy-sensitive";
    if (value <= thresholds.unhealthy) return "unhealthy";
    return "hazardous";
  }
  // ozone
  const thresholds = susceptible
    ? { good: 0.050, moderate: 0.055, unhealthySensitive: 0.060, unhealthy: 0.070 }
    : { good: 0.054, moderate: 0.060, unhealthySensitive: 0.070, unhealthy: 0.085 };
  if (value <= thresholds.good) return "good";
  if (value <= thresholds.moderate) return "moderate";
  if (value <= thresholds.unhealthySensitive) return "unhealthy-sensitive";
  if (value <= thresholds.unhealthy) return "unhealthy";
  return "hazardous";
}

const STATUS_MESSAGES: Record<string, Record<ExposureAlert["status"], string>> = {
  pm25: {
    good: "PM2.5 levels are within safe range.",
    moderate: "PM2.5 levels are moderate. Sensitive individuals should be aware.",
    "unhealthy-sensitive": "PM2.5 levels may cause respiratory symptoms in sensitive groups. Consider limiting prolonged outdoor exertion.",
    unhealthy: "PM2.5 levels are unhealthy. Reduce outdoor activity and consult your healthcare provider if symptoms arise.",
    hazardous: "PM2.5 levels are hazardous. Stay indoors, use air filtration, and contact your healthcare provider.",
  },
  no2: {
    good: "NO₂ levels are within safe range.",
    moderate: "NO₂ levels are moderate. Those with respiratory conditions should monitor symptoms.",
    "unhealthy-sensitive": "NO₂ levels may aggravate asthma and respiratory conditions. Limit outdoor exposure near traffic corridors.",
    unhealthy: "NO₂ levels are elevated. Avoid prolonged outdoor activity, especially near major roads.",
    hazardous: "NO₂ levels are hazardous. Stay indoors and seek medical attention if experiencing breathing difficulty.",
  },
  so2: {
    good: "SO₂ levels are within safe range.",
    moderate: "SO₂ levels are moderate. Individuals with asthma should monitor symptoms.",
    "unhealthy-sensitive": "SO₂ levels may trigger bronchoconstriction in asthmatics. Limit outdoor activity near industrial areas.",
    unhealthy: "SO₂ levels are elevated. Reduce outdoor exposure and consult your healthcare provider.",
    hazardous: "SO₂ levels are hazardous. Stay indoors and seek immediate medical attention if symptomatic.",
  },
  ozone: {
    good: "Ozone levels are within safe range.",
    moderate: "Ozone levels are moderate. Sensitive groups should limit prolonged outdoor exertion during peak hours.",
    "unhealthy-sensitive": "Ozone levels may cause respiratory irritation in sensitive groups. Avoid strenuous outdoor activity in the afternoon.",
    unhealthy: "Ozone levels are unhealthy. Minimize outdoor activity, especially between 10 AM and 6 PM.",
    hazardous: "Ozone levels are hazardous. Remain indoors and seek medical care if experiencing chest tightness or coughing.",
  },
};

function getRecommendations(profile: UserProfile, alerts: ExposureAlert[]): string[] {
  const recs: string[] = [];
  const isSusceptible = profile.conditions.length > 0 && !profile.conditions.includes("none");
  const hasHighExposure = alerts.some(a => a.status === "unhealthy-sensitive" || a.status === "unhealthy" || a.status === "hazardous");

  if (isSusceptible && hasHighExposure) {
    recs.push("Based on your health profile and local air quality, consider scheduling a checkup with your healthcare provider to discuss preventive strategies.");
  }

  if (profile.conditions.includes("asthma")) {
    recs.push("Keep your rescue inhaler accessible. Monitor daily air quality before outdoor activities.");
  }
  if (profile.conditions.includes("diabetes") || profile.conditions.includes("hypertension")) {
    recs.push("Chronic conditions like diabetes and hypertension can increase vulnerability to air pollution. Regular monitoring of blood pressure and blood sugar is recommended.");
  }
  if (profile.conditions.includes("heart_disease") || profile.conditions.includes("copd")) {
    recs.push("Cardiovascular and respiratory conditions significantly increase susceptibility. Avoid outdoor exertion during poor air quality days.");
  }
  if (profile.conditions.includes("pregnancy")) {
    recs.push("Pregnant individuals should take extra precautions during elevated pollution events. Discuss air quality concerns with your prenatal care provider.");
  }
  if (profile.conditions.includes("immunocompromised")) {
    recs.push("Immunocompromised individuals face increased risk from both air pollutants and opportunistic infections. Consider using HEPA air filtration at home.");
  }

  if (profile.ageGroup === "65plus") {
    recs.push("Adults 65 and older may be more sensitive to air pollution effects. Pay close attention to daily air quality forecasts.");
  }
  if (profile.ageGroup === "under18") {
    recs.push("Children are more vulnerable to air pollution due to developing lungs. Limit outdoor play during poor air quality days.");
  }

  if (!isSusceptible && !hasHighExposure) {
    recs.push("Your current risk profile appears low. Continue monitoring local air quality and maintain regular health checkups.");
  }

  return recs;
}

export function assessRisk(profile: UserProfile): RiskAssessment {
  const county = COUNTY_DATA[profile.county] ?? COUNTY_DATA.other;
  const multiplier = getSusceptibilityMultiplier(profile);
  const isSusceptible = multiplier > 1.2;

  const exposureAlerts: ExposureAlert[] = [
    {
      pollutant: "PM2.5 (Fine Particulate Matter)",
      level: county.pm25.toFixed(1),
      unit: "µg/m³",
      status: getPollutantStatus("pm25", county.pm25, isSusceptible),
      message: STATUS_MESSAGES.pm25[getPollutantStatus("pm25", county.pm25, isSusceptible)],
    },
    {
      pollutant: "NO₂ (Nitrogen Dioxide)",
      level: county.no2.toFixed(1),
      unit: "ppb",
      status: getPollutantStatus("no2", county.no2, isSusceptible),
      message: STATUS_MESSAGES.no2[getPollutantStatus("no2", county.no2, isSusceptible)],
    },
    {
      pollutant: "SO₂ (Sulfur Dioxide)",
      level: county.so2.toFixed(1),
      unit: "ppb",
      status: getPollutantStatus("so2", county.so2, isSusceptible),
      message: STATUS_MESSAGES.so2[getPollutantStatus("so2", county.so2, isSusceptible)],
    },
    {
      pollutant: "O₃ (Ozone)",
      level: county.ozone.toFixed(3),
      unit: "ppm",
      status: getPollutantStatus("ozone", county.ozone, isSusceptible),
      message: STATUS_MESSAGES.ozone[getPollutantStatus("ozone", county.ozone, isSusceptible)],
    },
  ];

  const healthOutcomes: HealthOutcome[] = [];

  const addOutcome = (condition: string, rate: number, baseThresholds: [number, number, number]) => {
    const adjusted = rate * (isSusceptible ? 1.3 : 1.0);
    let riskLevel: HealthOutcome["riskLevel"];
    if (adjusted < baseThresholds[0]) riskLevel = "low";
    else if (adjusted < baseThresholds[1]) riskLevel = "moderate";
    else if (adjusted < baseThresholds[2]) riskLevel = "elevated";
    else riskLevel = "high";

    const descriptions: Record<string, Record<HealthOutcome["riskLevel"], string>> = {
      Asthma: {
        low: "Asthma prevalence in your area is below state average.",
        moderate: "Asthma rates in your area are near the state average. Monitor for symptoms during poor air quality days.",
        elevated: "Asthma prevalence is above state average. Air pollution exposure may exacerbate symptoms.",
        high: "Asthma rates are significantly elevated. This area warrants close attention to air quality and preventive care.",
      },
      Diabetes: {
        low: "Diabetes prevalence in your area is below state average.",
        moderate: "Diabetes rates are moderate. Environmental stressors can compound metabolic conditions.",
        elevated: "Diabetes prevalence is above average. Combined with environmental exposure, this increases health vulnerability.",
        high: "Diabetes rates are significantly elevated, increasing susceptibility to environmental health threats.",
      },
      "Heart Disease": {
        low: "Heart disease prevalence is below state average.",
        moderate: "Heart disease rates are moderate. Air pollution, particularly PM2.5, can aggravate cardiovascular conditions.",
        elevated: "Heart disease prevalence is above average. Elevated pollution exposure compounds cardiovascular risk.",
        high: "Heart disease rates are significantly elevated. Combined with air quality concerns, preventive cardiology consultation is recommended.",
      },
      Cancer: {
        low: "Cancer incidence is below state average.",
        moderate: "Cancer rates are near state average. Long-term pollution exposure is a known risk factor.",
        elevated: "Cancer rates are above average. Chronic environmental exposure may be a contributing factor.",
        high: "Cancer incidence is significantly elevated. This area may benefit from enhanced screening programs.",
      },
      Obesity: {
        low: "Obesity prevalence is below state average.",
        moderate: "Obesity rates are near state average. Obesity increases vulnerability to pollution-related health effects.",
        elevated: "Obesity prevalence is above average, compounding susceptibility to environmental health threats.",
        high: "Obesity rates are significantly elevated, substantially increasing population vulnerability to air pollution effects.",
      },
    };

    healthOutcomes.push({
      condition,
      prevalenceRate: `${rate.toFixed(1)}%`,
      riskLevel,
      description: descriptions[condition]?.[riskLevel] ?? "",
    });
  };

  addOutcome("Asthma", county.asthmaRate, [10, 12, 14]);
  addOutcome("Diabetes", county.diabetesRate, [9, 11, 13]);
  addOutcome("Heart Disease", county.heartDiseaseRate, [5, 6, 7]);
  addOutcome("Cancer", county.cancerRate, [3, 4, 4.5]);
  addOutcome("Obesity", county.obesityRate, [28, 32, 35]);

  const monitorCoverage: MonitorCoverage = {
    nearestMonitorMiles: county.nearestMonitorMiles,
    withinCoverage: county.nearestMonitorMiles <= 15.5,
    coverageGap: county.nearestMonitorMiles > 15.5,
    monitorType: county.monitorType,
  };

  const exposureScore = exposureAlerts.reduce((sum, a) => {
    const weights = { good: 0, moderate: 1, "unhealthy-sensitive": 2, unhealthy: 3, hazardous: 4 };
    return sum + weights[a.status];
  }, 0);
  const outcomeScore = healthOutcomes.reduce((sum, o) => {
    const weights = { low: 0, moderate: 1, elevated: 2, high: 3 };
    return sum + weights[o.riskLevel];
  }, 0);
  const combinedScore = (exposureScore + outcomeScore) * multiplier;

  let overallRisk: RiskAssessment["overallRisk"];
  if (combinedScore < 6) overallRisk = "low";
  else if (combinedScore < 12) overallRisk = "moderate";
  else if (combinedScore < 20) overallRisk = "high";
  else overallRisk = "very-high";

  return {
    overallRisk,
    susceptibilityScore: Math.round(multiplier * 100) / 100,
    exposureAlerts,
    healthOutcomes,
    recommendations: getRecommendations(profile, exposureAlerts),
    monitorCoverage,
  };
}
