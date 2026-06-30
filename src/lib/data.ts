// Constants hub for intake options. County dataset lives in ./counties.ts and
// the scoring engine in ./scoring.ts.
import { COUNTIES, EPA_MONITORS } from "./counties";

export { EPA_MONITORS };
export type { County, MonitorLocation, CountyMetrics } from "./counties";

export const AGE_GROUPS = [
  { value: "under18", label: "Under 18" },
  { value: "18-29", label: "18–29" },
  { value: "30-49", label: "30–49" },
  { value: "50-64", label: "50–64" },
  { value: "65plus", label: "65 and older" },
];

export interface HealthCondition {
  value: string;
  label: string;
  short: string;
}

export const HEALTH_CONDITIONS: HealthCondition[] = [
  { value: "asthma", label: "Asthma", short: "Asthma" },
  { value: "copd", label: "COPD (Chronic Obstructive Pulmonary Disease)", short: "COPD" },
  { value: "heart_disease", label: "Heart Disease", short: "Heart Disease" },
  { value: "diabetes", label: "Diabetes", short: "Diabetes" },
  { value: "hypertension", label: "Hypertension (High Blood Pressure)", short: "Hypertension" },
  { value: "obesity", label: "Obesity", short: "Obesity" },
  { value: "cancer", label: "Cancer (current or history)", short: "Cancer" },
  { value: "hypothyroidism", label: "Hypothyroidism", short: "Hypothyroid" },
  { value: "immunocompromised", label: "Immunocompromised Condition", short: "Immunocompromised" },
  { value: "pregnancy", label: "Pregnancy", short: "Pregnancy" },
  { value: "none", label: "None of the above", short: "None" },
];

// Backwards-compatible shape consumed by the map (value/label/region/lat/lng).
export const PA_COUNTIES = COUNTIES.map((c) => ({
  value: c.value,
  label: c.label,
  region: c.region,
  lat: c.lat,
  lng: c.lng,
}));
