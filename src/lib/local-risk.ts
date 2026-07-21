export type LocalRiskTier = "Low" | "Moderate" | "High" | "Very high" | "Data unavailable";

export interface NwsAlertSummary {
  id: string;
  event: string;
  headline: string;
  description: string | null;
  instruction: string | null;
  severity: string;
  certainty: string;
  urgency: string;
  effective: string | null;
  expires: string | null;
  sourceUrl: string;
}

export function aqiTier(aqi: number | null): LocalRiskTier {
  if (aqi == null || !Number.isFinite(aqi)) return "Data unavailable";
  if (aqi <= 50) return "Low";
  if (aqi <= 100) return "Moderate";
  if (aqi <= 150) return "High";
  return "Very high";
}

export function alertTier(severity: string | null | undefined): LocalRiskTier {
  switch ((severity ?? "").toLowerCase()) {
    case "extreme":
      return "Very high";
    case "severe":
      return "High";
    case "moderate":
      return "Moderate";
    case "minor":
      return "Low";
    default:
      return "Moderate";
  }
}

export function highestAlertTier(alerts: NwsAlertSummary[]): LocalRiskTier {
  if (!alerts.length) return "Low";
  const order: LocalRiskTier[] = ["Low", "Moderate", "High", "Very high"];
  return alerts.reduce<LocalRiskTier>((highest, alert) => {
    const next = alertTier(alert.severity);
    return order.indexOf(next) > order.indexOf(highest) ? next : highest;
  }, "Low");
}

export const ALERT_GROUPS = {
  flood: /flood|dam failure|levee/i,
  heat: /heat/i,
  fireWeather: /red flag|fire weather|wildfire/i,
  severeWeather: /tornado|thunderstorm|hurricane|tropical|winter|snow|ice|wind|storm|hail|lightning/i,
};

export function alertsForGroup(alerts: NwsAlertSummary[], group: keyof typeof ALERT_GROUPS) {
  return alerts.filter((alert) => ALERT_GROUPS[group].test(`${alert.event} ${alert.headline}`));
}
