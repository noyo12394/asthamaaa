/**
 * US EPA AQI conversion. Breakpoints follow EPA's Technical Assistance
 * Document for the Reporting of Daily Air Quality (May 2024 revision, which
 * lowered the PM2.5 "Good" ceiling to 9.0 µg/m³).
 *
 * IMPORTANT UNIT NOTES (also surfaced in the UI):
 * - PM2.5 / PM10 concentrations are µg/m³; ozone/NO2/SO2 are ppb; CO is ppm.
 * - Open-Meteo reports gases in µg/m³, so we convert to ppb at 25°C/1013hPa
 *   before applying EPA breakpoints. That conversion is an approximation and
 *   is labeled as such in the source trail.
 * - An AQI computed from a 1-hour snapshot is a "NowCast-style estimate",
 *   not a regulatory daily AQI, and never an annual design value.
 */
import type { AqiCategory } from "./types";

interface Breakpoint {
  cLow: number;
  cHigh: number;
  iLow: number;
  iHigh: number;
}

const CATEGORIES: { max: number; label: AqiCategory }[] = [
  { max: 50, label: "Good" },
  { max: 100, label: "Moderate" },
  { max: 150, label: "Unhealthy for Sensitive Groups" },
  { max: 200, label: "Unhealthy" },
  { max: 300, label: "Very Unhealthy" },
  { max: Infinity, label: "Hazardous" },
];

// PM2.5, µg/m³ (24-hr averaging period; applied to NowCast-style snapshots)
const PM25: Breakpoint[] = [
  { cLow: 0.0, cHigh: 9.0, iLow: 0, iHigh: 50 },
  { cLow: 9.1, cHigh: 35.4, iLow: 51, iHigh: 100 },
  { cLow: 35.5, cHigh: 55.4, iLow: 101, iHigh: 150 },
  { cLow: 55.5, cHigh: 125.4, iLow: 151, iHigh: 200 },
  { cLow: 125.5, cHigh: 225.4, iLow: 201, iHigh: 300 },
  { cLow: 225.5, cHigh: 500.4, iLow: 301, iHigh: 500 },
];

// PM10, µg/m³
const PM10: Breakpoint[] = [
  { cLow: 0, cHigh: 54, iLow: 0, iHigh: 50 },
  { cLow: 55, cHigh: 154, iLow: 51, iHigh: 100 },
  { cLow: 155, cHigh: 254, iLow: 101, iHigh: 150 },
  { cLow: 255, cHigh: 354, iLow: 151, iHigh: 200 },
  { cLow: 355, cHigh: 424, iLow: 201, iHigh: 300 },
  { cLow: 425, cHigh: 604, iLow: 301, iHigh: 500 },
];

// Ozone 8-hr, ppb
const OZONE_8H: Breakpoint[] = [
  { cLow: 0, cHigh: 54, iLow: 0, iHigh: 50 },
  { cLow: 55, cHigh: 70, iLow: 51, iHigh: 100 },
  { cLow: 71, cHigh: 85, iLow: 101, iHigh: 150 },
  { cLow: 86, cHigh: 105, iLow: 151, iHigh: 200 },
  { cLow: 106, cHigh: 200, iLow: 201, iHigh: 300 },
];

// NO2 1-hr, ppb
const NO2_1H: Breakpoint[] = [
  { cLow: 0, cHigh: 53, iLow: 0, iHigh: 50 },
  { cLow: 54, cHigh: 100, iLow: 51, iHigh: 100 },
  { cLow: 101, cHigh: 360, iLow: 101, iHigh: 150 },
  { cLow: 361, cHigh: 649, iLow: 151, iHigh: 200 },
  { cLow: 650, cHigh: 1249, iLow: 201, iHigh: 300 },
  { cLow: 1250, cHigh: 2049, iLow: 301, iHigh: 500 },
];

function piecewise(bps: Breakpoint[], c: number): number | null {
  if (!Number.isFinite(c) || c < 0) return null;
  for (const bp of bps) {
    if (c >= bp.cLow && c <= bp.cHigh) {
      return Math.round(
        ((bp.iHigh - bp.iLow) / (bp.cHigh - bp.cLow)) * (c - bp.cLow) + bp.iLow
      );
    }
  }
  // Above the highest breakpoint: clamp to the scale top.
  return c > bps[bps.length - 1].cHigh ? 500 : null;
}

export function aqiFromPm25(ugm3: number): number | null {
  // EPA truncates PM2.5 to 0.1 µg/m³ before lookup
  return piecewise(PM25, Math.floor(ugm3 * 10) / 10);
}

export function aqiFromPm10(ugm3: number): number | null {
  return piecewise(PM10, Math.floor(ugm3));
}

export function aqiFromOzonePpb(ppb: number): number | null {
  return piecewise(OZONE_8H, Math.floor(ppb));
}

export function aqiFromNo2Ppb(ppb: number): number | null {
  return piecewise(NO2_1H, Math.floor(ppb));
}

/** µg/m³ -> ppb at 25°C, 1013.25 hPa. molarMass in g/mol. */
export function ugm3ToPpb(ugm3: number, molarMass: number): number {
  return (ugm3 * 24.45) / molarMass;
}

export const MOLAR_MASS = { O3: 48, NO2: 46.01, SO2: 64.07, CO: 28.01 };

export function categoryForAqi(aqi: number | null): AqiCategory | null {
  if (aqi == null || !Number.isFinite(aqi)) return null;
  return CATEGORIES.find((c) => aqi <= c.max)?.label ?? null;
}

export interface ComputedAqi {
  usAqi: number | null;
  category: AqiCategory | null;
  dominantPollutant: string | null;
}

/**
 * Composite snapshot AQI = max of per-pollutant sub-indices.
 * Inputs: pm25/pm10 in µg/m³, ozone/no2 in µg/m³ (converted internally).
 */
export function computeAqi(input: {
  pm25?: number | null;
  pm10?: number | null;
  ozoneUgm3?: number | null;
  no2Ugm3?: number | null;
}): ComputedAqi {
  const subs: { pollutant: string; aqi: number }[] = [];
  if (input.pm25 != null) {
    const a = aqiFromPm25(input.pm25);
    if (a != null) subs.push({ pollutant: "PM2.5", aqi: a });
  }
  if (input.pm10 != null) {
    const a = aqiFromPm10(input.pm10);
    if (a != null) subs.push({ pollutant: "PM10", aqi: a });
  }
  if (input.ozoneUgm3 != null) {
    const a = aqiFromOzonePpb(ugm3ToPpb(input.ozoneUgm3, MOLAR_MASS.O3));
    if (a != null) subs.push({ pollutant: "O3", aqi: a });
  }
  if (input.no2Ugm3 != null) {
    const a = aqiFromNo2Ppb(ugm3ToPpb(input.no2Ugm3, MOLAR_MASS.NO2));
    if (a != null) subs.push({ pollutant: "NO2", aqi: a });
  }
  if (subs.length === 0) return { usAqi: null, category: null, dominantPollutant: null };
  const top = subs.reduce((a, b) => (b.aqi > a.aqi ? b : a));
  return {
    usAqi: top.aqi,
    category: categoryForAqi(top.aqi),
    dominantPollutant: top.pollutant,
  };
}
