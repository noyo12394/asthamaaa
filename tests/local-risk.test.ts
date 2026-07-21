import { describe, expect, it } from "vitest";
import { alertTier, aqiTier, alertsForGroup, highestAlertTier, type NwsAlertSummary } from "@/lib/local-risk";

const alert = (event: string, severity = "Moderate"): NwsAlertSummary => ({
  id: event,
  event,
  headline: event,
  description: null,
  instruction: null,
  severity,
  certainty: "Likely",
  urgency: "Expected",
  effective: null,
  expires: null,
  sourceUrl: "https://api.weather.gov/alerts/active",
});

describe("local risk classification", () => {
  it("maps EPA AQI bands to the simpler PASS overview tiers", () => {
    expect(aqiTier(42)).toBe("Low");
    expect(aqiTier(88)).toBe("Moderate");
    expect(aqiTier(120)).toBe("High");
    expect(aqiTier(175)).toBe("Very high");
    expect(aqiTier(null)).toBe("Data unavailable");
  });

  it("maps NWS severity without inventing a numeric hazard score", () => {
    expect(alertTier("Extreme")).toBe("Very high");
    expect(alertTier("Severe")).toBe("High");
    expect(alertTier("Moderate")).toBe("Moderate");
    expect(highestAlertTier([alert("Flood Warning", "Moderate"), alert("Tornado Warning", "Extreme")])).toBe("Very high");
  });

  it("groups official alerts by hazard language", () => {
    const alerts = [alert("Flash Flood Warning"), alert("Heat Advisory"), alert("Red Flag Warning")];
    expect(alertsForGroup(alerts, "flood")).toHaveLength(1);
    expect(alertsForGroup(alerts, "heat")).toHaveLength(1);
    expect(alertsForGroup(alerts, "fireWeather")).toHaveLength(1);
  });
});
