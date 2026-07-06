/**
 * Shared color scales for map layers, legend, and charts.
 * - AQI uses the official EPA category colors (domain standard) for map
 *   surfaces; text chips use darkened variants for contrast.
 * - Score scales are single-hue sequential ramps (dataviz method): one hue
 *   per meaning, light→dark.
 */

export const AQI_BREAKS = [
  { max: 50, label: "Good", fill: "#00e400", chip: "#1a7a1a" },
  { max: 100, label: "Moderate", fill: "#ffff00", chip: "#8a7500" },
  { max: 150, label: "Unhealthy for Sensitive Groups", fill: "#ff7e00", chip: "#a85300" },
  { max: 200, label: "Unhealthy", fill: "#ff0000", chip: "#b91c1c" },
  { max: 300, label: "Very Unhealthy", fill: "#8f3f97", chip: "#7c3aed" },
  { max: Infinity, label: "Hazardous", fill: "#7e0023", chip: "#7e0023" },
] as const;

export function aqiFill(aqi: number | null): string {
  if (aqi == null) return "#c9c8c1";
  return AQI_BREAKS.find((b) => aqi <= b.max)?.fill ?? "#7e0023";
}

export function aqiChip(aqi: number | null): string {
  if (aqi == null) return "#898781";
  return AQI_BREAKS.find((b) => aqi <= b.max)?.chip ?? "#7e0023";
}

/** Blue sequential (vulnerability / generic magnitude), 5 steps light→dark. */
export const BLUE_RAMP = ["#cde2fb", "#9ec5f4", "#5598e7", "#256abf", "#0d366b"];

/** Violet sequential (equity burden). */
export const VIOLET_RAMP = ["#e5e1f7", "#c5bcee", "#9a8cdc", "#6f5cc3", "#43349b"];

/** Teal sequential (monitor coverage confidence). */
export const TEAL_RAMP = ["#d2ecec", "#9ed4d4", "#5fb3b3", "#2d8888", "#125858"];

/** Red-orange sequential (alert priority). */
export const ALERT_RAMP = ["#fbe3d4", "#f5b898", "#e97f56", "#d0492f", "#9c2317"];

export function rampColor(ramp: string[], value: number | null, max = 100): string {
  if (value == null) return "#c9c8c1";
  const idx = Math.min(ramp.length - 1, Math.floor((value / max) * ramp.length));
  return ramp[Math.max(0, idx)];
}

export const LEVEL_COLORS: Record<string, { bg: string; text: string }> = {
  Low: { bg: "#e5f4e5", text: "#186318" },
  Moderate: { bg: "#faf3d7", text: "#8a6d00" },
  High: { bg: "#fbe8dc", text: "#a04416" },
  "Very High": { bg: "#fbdddd", text: "#a52727" },
};

export const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  live: { bg: "#e5f4e5", text: "#186318", label: "LIVE" },
  cached: { bg: "#e3edf9", text: "#1c5cab", label: "CACHED" },
  modeled: { bg: "#e3edf9", text: "#1c5cab", label: "MODELED" },
  official: { bg: "#eee9fb", text: "#4a3aa7", label: "OFFICIAL" },
  estimated: { bg: "#faf3d7", text: "#8a6d00", label: "ESTIMATED" },
  fallback: { bg: "#fbe8dc", text: "#a04416", label: "FALLBACK" },
  seed: { bg: "#f0efec", text: "#52514e", label: "SEED" },
};
