import { describe, it, expect } from "vitest";
import { outdoorAdvice, isSensitive, aqiCategory } from "../src/lib/advice";

describe("outdoor advice", () => {
  it("good AQI is safe for everyone", () => {
    const a = outdoorAdvice(35, false, [], false);
    expect(a.verdict).toBe("safe");
    expect(a.canGoOut).toBe(true);
    expect(a.aqiCategory).toBe("Good");
  });

  it("USG-range widens caution for sensitive users", () => {
    const general = outdoorAdvice(130, false, [], false);
    const sensitive = outdoorAdvice(130, true, ["asthma"], false);
    expect(general.canGoOut).toBe(true);
    expect(sensitive.canGoOut).toBe(false);
    expect(sensitive.verdict).toBe("reduce");
    // condition-specific measure surfaces
    expect(sensitive.measures.join(" ")).toMatch(/inhaler/i);
  });

  it("very unhealthy air tells everyone to stay indoors", () => {
    const a = outdoorAdvice(260, false, [], false);
    expect(a.verdict).toBe("stay-in");
    expect(a.canGoOut).toBe(false);
  });

  it("null AQI is provisional and never crashes", () => {
    const a = outdoorAdvice(null, true, ["copd"], false);
    expect(a.provisional).toBe(true);
    expect(a.measures.length).toBeGreaterThan(0);
  });

  it("sensitivity detection covers age and conditions", () => {
    expect(isSensitive(70, [])).toBe(true);
    expect(isSensitive(8, [])).toBe(true);
    expect(isSensitive(30, ["asthma"])).toBe(true);
    expect(isSensitive(30, [])).toBe(false);
    expect(aqiCategory(120)).toBe("Unhealthy for Sensitive Groups");
  });
});
