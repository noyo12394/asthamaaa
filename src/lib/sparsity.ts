/**
 * Monitor-sparsity classification — the core concept of the PASS research
 * framing. Confidence in an air-quality estimate depends on how observable
 * the location is; most dashboards hide this. Here it is a first-class value
 * with its own classes, layer, legend, and public API endpoint.
 *
 * Classes (distance to nearest active monitor):
 *   dense    < 10 km   — estimate anchored by nearby ground truth
 *   moderate 10–25 km  — partially anchored; local gradients may be missed
 *   sparse   25–50 km  — model/satellite-informed estimate; weakly anchored
 *   remote   ≥ 50 km   — no meaningful ground anchor; treat as rough guide
 *
 * Thresholds are transparency heuristics informed by typical urban-scale
 * PM2.5 spatial correlation — documented in SCORING.md, not an EPA standard.
 */
import { nearestMonitor } from "./monitors";
import type { MonitorRecord, NearestMonitorResult, SourceRef } from "./types";
import { haversineKm } from "./geo";

export type SparsityClass = "dense" | "moderate" | "sparse" | "remote";

export interface SparsityResult {
  class: SparsityClass;
  nearestMonitorKm: number | null;
  nearestMonitor: NearestMonitorResult | null;
  monitorsWithin25Km: number;
  dataBasis: "ground-anchored" | "model-satellite-estimate";
  plainLanguage: string;
  confidenceForecast: string;
  metadataStatus: SourceRef["status"];
}

export function classForDistance(km: number | null): SparsityClass {
  if (km == null) return "remote";
  if (km < 10) return "dense";
  if (km < 25) return "moderate";
  if (km < 50) return "sparse";
  return "remote";
}

const PLAIN: Record<SparsityClass, string> = {
  dense:
    "A regulatory monitor is close by, so model estimates here are anchored by ground truth.",
  moderate:
    "The nearest monitor is a moderate distance away; estimates are partially anchored and can miss local gradients (roads, industry, terrain).",
  sparse:
    "No monitor is nearby — values here are model/satellite-informed estimates with weak ground anchoring. Treat them as a guide, not a measurement.",
  remote:
    "There is no meaningful ground anchor here. Values are model/satellite estimates only — useful for planning, not verification.",
};

const FORECAST: Record<SparsityClass, string> = {
  dense: "Confidence is already high; the next hourly monitor cycle keeps it current.",
  moderate:
    "Confidence improves with each hourly monitor cycle; a temporary sensor within ~10 km would raise this area to dense coverage.",
  sparse:
    "Model refreshes hourly, but ground confidence will not improve until a monitor or low-cost sensor is placed within ~25 km — try the Sensor Placement Simulator.",
  remote:
    "Only new sensor placement materially improves confidence here — the Sensor Placement Simulator can quantify what one temporary monitor would change.",
};

export function classifySparsity(lat: number, lng: number): SparsityResult {
  const nearest = nearestMonitor(lat, lng);
  const km = nearest?.distanceKm ?? null;
  const cls = classForDistance(km);
  return {
    class: cls,
    nearestMonitorKm: km,
    nearestMonitor: nearest,
    monitorsWithin25Km: nearest?.monitorsWithin25Km ?? 0,
    dataBasis: cls === "dense" || cls === "moderate" ? "ground-anchored" : "model-satellite-estimate",
    plainLanguage: PLAIN[cls],
    confidenceForecast: FORECAST[cls],
    metadataStatus: nearest?.source.status ?? "fallback",
  };
}

/**
 * Same classification but against an augmented monitor list — used by the
 * Sensor Placement Simulator to compute before/after without mutating the
 * real metadata set.
 */
export function classifyWithExtraMonitors(
  lat: number,
  lng: number,
  extra: { lat: number; lng: number }[],
  baseMonitors: MonitorRecord[]
): { class: SparsityClass; nearestKm: number | null } {
  let best = Infinity;
  for (const m of baseMonitors) {
    if (!m.active) continue;
    const d = haversineKm({ lat, lng }, { lat: m.lat, lng: m.lng });
    if (d < best) best = d;
  }
  for (const e of extra) {
    const d = haversineKm({ lat, lng }, { lat: e.lat, lng: e.lng });
    if (d < best) best = d;
  }
  const km = Number.isFinite(best) ? best : null;
  return { class: classForDistance(km), nearestKm: km == null ? null : Math.round(km * 10) / 10 };
}
