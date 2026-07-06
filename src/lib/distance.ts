export type DistanceUnit = "km" | "mi";

const MI_PER_KM = 0.621371;

export function normalizeDistanceUnit(value: unknown): DistanceUnit {
  return value === "mi" ? "mi" : "km";
}

export function convertKm(km: number, unit: DistanceUnit): number {
  return unit === "mi" ? km * MI_PER_KM : km;
}

export function formatDistance(km: number | null | undefined, unit: DistanceUnit, digits = 1): string {
  if (km == null || !Number.isFinite(km)) return "?";
  return `${convertKm(km, unit).toFixed(digits)} ${unit}`;
}

export function formatDistanceBand(kmA: number, kmB: number, unit: DistanceUnit): string {
  return `${formatDistance(kmA, unit, 0)}/${formatDistance(kmB, unit, 0)}`;
}
