/**
 * Patient-facing "safe to go out?" guidance.
 *
 * Maps a snapshot US AQI + personal sensitivity to an EPA-action-level verdict
 * and prevention-focused measures. This is decision support, NOT medical
 * advice or a diagnosis — every consumer must keep that framing.
 */

export type GoOutVerdict = "safe" | "ok-sensitive-care" | "reduce" | "avoid" | "stay-in";

export interface OutdoorAdvice {
  verdict: GoOutVerdict;
  /** short headline, e.g. "OK to go outside" */
  headline: string;
  /** one-line summary of the recommendation */
  summary: string;
  /** whether general outdoor activity is reasonable right now */
  canGoOut: boolean;
  /** AQI category label for the reading used */
  aqiCategory: string;
  /** prevention measures, ordered most-important first */
  measures: string[];
  /** true when the reading is a labeled fallback, not live conditions */
  provisional: boolean;
}

export const SENSITIZING_CONDITIONS = [
  "asthma",
  "copd",
  "heart-disease",
  "heartdisease",
  "diabetes",
  "pregnancy",
  "hypertension",
];

export function isSensitive(age: number | null, conditions: string[]): boolean {
  if (age != null && (age >= 65 || age <= 12)) return true;
  return conditions.some((c) =>
    SENSITIZING_CONDITIONS.includes(c.trim().toLowerCase().replace(/[\s_]/g, "-"))
  );
}

export function aqiCategory(aqi: number | null): string {
  if (aqi == null) return "Unknown";
  if (aqi <= 50) return "Good";
  if (aqi <= 100) return "Moderate";
  if (aqi <= 150) return "Unhealthy for Sensitive Groups";
  if (aqi <= 200) return "Unhealthy";
  if (aqi <= 300) return "Very Unhealthy";
  return "Hazardous";
}

function conditionMeasures(conditions: string[]): string[] {
  const set = new Set(conditions.map((c) => c.trim().toLowerCase().replace(/[\s_]/g, "-")));
  const out: string[] = [];
  if (set.has("asthma") || set.has("copd")) {
    out.push("Keep your reliever/rescue inhaler with you and follow your written action plan.");
  }
  if (set.has("heart-disease") || set.has("heartdisease")) {
    out.push("Avoid heavy exertion; stop and rest if you feel chest tightness, palpitations, or unusual breathlessness.");
  }
  if (set.has("diabetes")) {
    out.push("Combined heat and poor air quality add strain — stay hydrated and monitor how you feel.");
  }
  if (set.has("pregnancy")) {
    out.push("Favor indoor activity on poor-air days and raise any concerns with your prenatal provider.");
  }
  return out;
}

/**
 * Build advice from a snapshot AQI. `sensitive` widens caution one tier.
 */
export function outdoorAdvice(
  aqi: number | null,
  sensitive: boolean,
  conditions: string[],
  provisional: boolean
): OutdoorAdvice {
  const category = aqiCategory(aqi);
  const base: string[] = [];
  const condMeasures = conditionMeasures(conditions);

  let verdict: GoOutVerdict;
  let headline: string;
  let summary: string;
  let canGoOut: boolean;

  const a = aqi ?? 75; // unknown → treat as mid Moderate, and flag provisional

  if (a <= 50) {
    verdict = "safe";
    headline = "OK to go outside";
    summary = "Air quality is good. Normal outdoor activity is fine for everyone.";
    canGoOut = true;
    base.push("Enjoy normal outdoor activity.");
  } else if (a <= 100) {
    if (sensitive) {
      verdict = "ok-sensitive-care";
      headline = "OK — but ease into exertion";
      summary = "Air quality is moderate. You can go out; unusually sensitive people should watch how they feel during long or intense activity.";
      canGoOut = true;
      base.push("Fine for errands and light activity; take breaks during prolonged or intense exertion.");
      base.push("Prefer mornings, when ozone is usually lower.");
    } else {
      verdict = "safe";
      headline = "OK to go outside";
      summary = "Air quality is moderate. Outdoor activity is fine for most people.";
      canGoOut = true;
      base.push("Normal outdoor activity is fine.");
    }
  } else if (a <= 150) {
    verdict = sensitive ? "reduce" : "ok-sensitive-care";
    headline = sensitive ? "Limit longer time outdoors" : "OK for most — sensitive groups take care";
    summary = sensitive
      ? "Unhealthy for sensitive groups. Shorten and lighten outdoor activity, and take more breaks."
      : "Unhealthy for sensitive groups only. Most people are fine; sensitive individuals should ease up.";
    canGoOut = !sensitive;
    base.push("Cut back on prolonged or heavy outdoor exertion; move intense workouts indoors.");
    base.push("Schedule outdoor errands for the cleanest part of the day.");
  } else if (a <= 200) {
    verdict = sensitive ? "avoid" : "reduce";
    headline = sensitive ? "Best to stay indoors" : "Reduce time outdoors";
    summary = sensitive
      ? "Unhealthy air. If you have a heart or lung condition, are older, pregnant, or a young child, stay indoors where you can."
      : "Unhealthy air. Everyone should reduce prolonged or heavy outdoor exertion.";
    canGoOut = false;
    base.push("Keep outings short and low-effort; avoid outdoor exercise.");
    base.push("Close windows and run an air purifier / set HVAC to recirculate if you can.");
    base.push("If you must be outside for a while during smoke, a well-fitting N95/KN95 helps.");
  } else if (a <= 300) {
    verdict = "stay-in";
    headline = "Stay indoors";
    summary = "Very unhealthy air. Avoid outdoor activity; keep indoor air as clean as possible.";
    canGoOut = false;
    base.push("Stay indoors with windows closed; run HEPA filtration.");
    base.push("Avoid all outdoor exertion. Wear an N95/KN95 for unavoidable trips.");
  } else {
    verdict = "stay-in";
    headline = "Stay indoors — hazardous air";
    summary = "Hazardous air quality. Remain indoors and follow local emergency guidance.";
    canGoOut = false;
    base.push("Remain indoors; seal gaps and run air cleaners.");
    base.push("Follow local health-department and emergency guidance.");
  }

  const measures = [...base, ...condMeasures];
  measures.push(
    "Watch for symptoms like coughing, wheezing, chest tightness, or shortness of breath, and follow your care plan or contact your provider if they worsen."
  );

  return {
    verdict,
    headline,
    summary,
    canGoOut,
    aqiCategory: category,
    measures,
    provisional: provisional || aqi == null,
  };
}
