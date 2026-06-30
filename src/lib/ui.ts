import type { RiskLevel, PollutantStatus, Confidence } from "./scoring";

export const RISK_STYLES: Record<RiskLevel, { text: string; bg: string; border: string; dot: string; hex: string }> = {
  Low: { text: "text-green-700", bg: "bg-green-50", border: "border-green-200", dot: "bg-green-600", hex: "#16a34a" },
  Moderate: { text: "text-yellow-700", bg: "bg-yellow-50", border: "border-yellow-200", dot: "bg-yellow-500", hex: "#eab308" },
  High: { text: "text-orange-700", bg: "bg-orange-50", border: "border-orange-200", dot: "bg-orange-500", hex: "#f97316" },
  "Very High": { text: "text-red-700", bg: "bg-red-50", border: "border-red-200", dot: "bg-red-600", hex: "#dc2626" },
};

export const STATUS_STYLES: Record<PollutantStatus, { label: string; text: string; bg: string; hex: string }> = {
  good: { label: "Good", text: "text-green-700", bg: "bg-green-100", hex: "#16a34a" },
  moderate: { label: "Moderate", text: "text-yellow-700", bg: "bg-yellow-100", hex: "#eab308" },
  "unhealthy-sensitive": { label: "Sensitive", text: "text-orange-700", bg: "bg-orange-100", hex: "#f97316" },
  unhealthy: { label: "Unhealthy", text: "text-red-700", bg: "bg-red-100", hex: "#dc2626" },
  hazardous: { label: "Hazardous", text: "text-purple-700", bg: "bg-purple-100", hex: "#9333ea" },
};

export const CONFIDENCE_STYLES: Record<Confidence, { text: string; bg: string; border: string }> = {
  High: { text: "text-green-700", bg: "bg-green-50", border: "border-green-200" },
  Medium: { text: "text-yellow-700", bg: "bg-yellow-50", border: "border-yellow-200" },
  Low: { text: "text-orange-700", bg: "bg-orange-50", border: "border-orange-200" },
};

export function scoreHex(v: number): string {
  if (v < 25) return "#16a34a";
  if (v < 45) return "#eab308";
  if (v < 65) return "#f97316";
  return "#dc2626";
}

export const BURDEN_HEX: Record<string, string> = {
  low: "#16a34a",
  moderate: "#eab308",
  elevated: "#f97316",
  high: "#dc2626",
};
