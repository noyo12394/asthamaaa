export type DistanceUnit = "km" | "mi";

const MI_PER_KM = 0.621371;
const EARTH_RADIUS_KM = 6371.0088;

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

export function distanceKm(latA: number, lngA: number, latB: number, lngB: number): number {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const deltaLat = radians(latB - latA);
  const deltaLng = radians(lngB - lngA);
  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(radians(latA)) * Math.cos(radians(latB)) * Math.sin(deltaLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}
