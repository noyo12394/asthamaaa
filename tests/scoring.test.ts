import { describe, expect, it } from "vitest";
import {
  exposureFromAqi,
  levelForScore,
  susceptibilityFromProfile,
  calculateRiskScore,
  WEIGHTS,
} from "@/lib/scoring";

describe("scoring engine", () => {
  it("exposure mapping hits documented anchor points", () => {
    expect(exposureFromAqi(0)).toBe(0);
    expect(exposureFromAqi(50)).toBe(25);
    expect(exposureFromAqi(100)).toBe(50);
    expect(exposureFromAqi(200)).toBe(85);
    expect(exposureFromAqi(500)).toBe(100);
  });

  it("weights sum to 1", () => {
    const sum = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1);
  });

  it("susceptibility: baseline, age, and condition points", () => {
    expect(susceptibilityFromProfile({ conditions: [] }).score).toBe(20);
    expect(susceptibilityFromProfile({ age: 70, conditions: [] }).score).toBe(45);
    expect(susceptibilityFromProfile({ age: 70, conditions: ["asthma"] }).score).toBe(75);
    expect(
      susceptibilityFromProfile({ age: 70, conditions: ["asthma", "copd", "heart-disease"] }).score
    ).toBe(100); // capped
  });

  it("levels match documented bands", () => {
    expect(levelForScore(10)).toBe("Low");
    expect(levelForScore(30)).toBe("Moderate");
    expect(levelForScore(55)).toBe("High");
    expect(levelForScore(80)).toBe("Very High");
  });

  it("full pipeline returns labeled, explained result (Allentown)", async () => {
    const r = await calculateRiskScore(40.6023, -75.4714, { age: 68, conditions: ["asthma"] });
    expect(r.finalScore).toBeGreaterThanOrEqual(0);
    expect(r.finalScore).toBeLessThanOrEqual(100);
    expect(["Low", "Moderate", "High", "Very High"]).toContain(r.level);
    expect(r.countyFips).toBe("42077"); // Lehigh County
    expect(r.caveats.length).toBeGreaterThan(0);
    expect(r.explanation).toContain("alert priority");
    // susceptibility must reflect the profile
    expect(r.susceptibility.score).toBe(75);
    // every component that uses external data must carry sources
    expect(r.healthVulnerability.sources.length).toBeGreaterThan(0);
    expect(r.exposure.sources[0].status).toBeDefined();
  });
});
