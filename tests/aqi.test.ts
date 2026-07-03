import { describe, expect, it } from "vitest";
import {
  aqiFromPm25,
  aqiFromOzonePpb,
  categoryForAqi,
  computeAqi,
  ugm3ToPpb,
  MOLAR_MASS,
} from "@/lib/aqi";

describe("EPA AQI breakpoints (2024 revision)", () => {
  it("maps PM2.5 boundaries correctly", () => {
    expect(aqiFromPm25(0)).toBe(0);
    expect(aqiFromPm25(9.0)).toBe(50); // new Good ceiling
    expect(aqiFromPm25(9.1)).toBe(51);
    expect(aqiFromPm25(35.4)).toBe(100);
    expect(aqiFromPm25(55.4)).toBe(150);
    expect(aqiFromPm25(125.4)).toBe(200);
  });

  it("clamps beyond the top breakpoint", () => {
    expect(aqiFromPm25(700)).toBe(500);
  });

  it("rejects invalid concentrations", () => {
    expect(aqiFromPm25(-1)).toBeNull();
    expect(aqiFromPm25(NaN)).toBeNull();
  });

  it("maps 8-hr ozone ppb", () => {
    expect(aqiFromOzonePpb(54)).toBe(50);
    expect(aqiFromOzonePpb(70)).toBe(100);
  });

  it("converts µg/m³ to ppb for ozone", () => {
    // 100 µg/m³ O3 ≈ 50.9 ppb at 25°C/1013hPa
    expect(ugm3ToPpb(100, MOLAR_MASS.O3)).toBeCloseTo(50.94, 1);
  });

  it("labels categories", () => {
    expect(categoryForAqi(42)).toBe("Good");
    expect(categoryForAqi(101)).toBe("Unhealthy for Sensitive Groups");
    expect(categoryForAqi(320)).toBe("Hazardous");
    expect(categoryForAqi(null)).toBeNull();
  });

  it("composite AQI takes the max sub-index and reports dominant pollutant", () => {
    const r = computeAqi({ pm25: 12, ozoneUgm3: 30 });
    expect(r.dominantPollutant).toBe("PM2.5");
    expect(r.usAqi).toBeGreaterThan(50);
    expect(r.category).toBe("Moderate");
  });

  it("returns nulls with no inputs", () => {
    expect(computeAqi({})).toEqual({ usAqi: null, category: null, dominantPollutant: null });
  });
});
