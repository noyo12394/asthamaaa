/** Monitor metadata access + coverage confidence heuristics. */
import monitorsFile from "@/data/monitors.json";
import type { MonitorRecord, NearestMonitorResult, SourceRef } from "./types";
import { haversineKm } from "./geo";

const monitors = monitorsFile.monitors as MonitorRecord[];

export const MONITOR_SOURCE: SourceRef = {
  name: monitorsFile.source,
  url: monitorsFile.sourceUrl,
  vintage: monitorsFile.vintage,
  fetchedAt: monitorsFile.generatedAt,
  status: monitorsFile.status as SourceRef["status"],
  confidence: monitorsFile.status === "official" ? "high" : "low",
  notes: monitorsFile.notes,
};

export function allMonitors(): MonitorRecord[] {
  return monitors;
}

export function monitorsInBbox(bbox: {
  west: number;
  south: number;
  east: number;
  north: number;
}): MonitorRecord[] {
  return monitors.filter(
    (m) => m.lng >= bbox.west && m.lng <= bbox.east && m.lat >= bbox.south && m.lat <= bbox.north
  );
}

export function monitorById(id: string): MonitorRecord | undefined {
  return monitors.find((m) => m.id === id);
}

/**
 * Coverage heuristic used across the app:
 *   good    — a monitor within 10 km
 *   partial — a monitor within 25 km
 *   sparse  — nothing within 25 km
 * These thresholds reflect typical urban-scale PM2.5 spatial correlation and
 * are documented in SCORING.md; they are a transparency heuristic, not an
 * EPA siting standard.
 */
export function nearestMonitor(lat: number, lng: number): NearestMonitorResult | null {
  if (monitors.length === 0) return null;
  let best: MonitorRecord | null = null;
  let bestD = Infinity;
  let within25 = 0;
  for (const m of monitors) {
    if (!m.active) continue;
    const d = haversineKm({ lat, lng }, { lat: m.lat, lng: m.lng });
    if (d <= 25) within25++;
    if (d < bestD) {
      bestD = d;
      best = m;
    }
  }
  if (!best) return null;
  const coverage = bestD <= 10 ? "good" : bestD <= 25 ? "partial" : "sparse";
  return {
    monitor: best,
    distanceKm: Math.round(bestD * 10) / 10,
    monitorsWithin25Km: within25,
    coverage,
    source: MONITOR_SOURCE,
  };
}

/**
 * Monitor confidence score 0-100 for a point: distance-decayed nearest-monitor
 * term (70%) plus a local-density term (30%).
 */
export function monitorConfidenceScore(lat: number, lng: number): {
  score: number;
  nearest: NearestMonitorResult | null;
} {
  const nearest = nearestMonitor(lat, lng);
  if (!nearest) return { score: 0, nearest: null };
  const distanceTerm = Math.max(0, 1 - nearest.distanceKm / 50); // 0 at >=50km
  const densityTerm = Math.min(1, nearest.monitorsWithin25Km / 4); // saturates at 4 monitors
  const score = Math.round((distanceTerm * 0.7 + densityTerm * 0.3) * 100);
  return { score, nearest };
}
