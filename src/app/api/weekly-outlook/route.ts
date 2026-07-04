import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAirQualityHistory } from "@/lib/openmeteo";
import { handleError, ok, parseQuery } from "@/lib/api";

/**
 * Exposure × Susceptibility weekly outlook: one row per condition group, one
 * cell per day, colored by how concerning that day looks FOR THAT GROUP —
 * not a single generic AQI strip. Thresholds shift by group sensitivity.
 */
const schema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
});

// Per-group AQI thresholds: [caution, high]. Sensitive groups get concerned
// earlier, per EPA sensitive-groups guidance shape (heuristic offsets,
// documented on /methods).
const GROUPS: { id: string; label: string; caution: number; high: number }[] = [
  { id: "asthma", label: "Asthma", caution: 65, high: 100 },
  { id: "copd", label: "COPD", caution: 65, high: 100 },
  { id: "heart-disease", label: "Heart disease", caution: 80, high: 125 },
  { id: "children", label: "Children", caution: 75, high: 110 },
  { id: "older-adults", label: "Adults 65+", caution: 75, high: 110 },
  { id: "general", label: "General population", caution: 100, high: 150 },
];

export async function GET(req: NextRequest) {
  try {
    const query = parseQuery(req, schema);
    if (query instanceof NextResponse) return query;
    const { points, source } = await getAirQualityHistory(query.lat, query.lng, 1, 6);

    // Aggregate hourly -> daily peak + mean AQI
    const byDay = new Map<string, { max: number; sum: number; n: number; kinds: Set<string> }>();
    for (const p of points) {
      if (p.usAqi == null) continue;
      const day = p.time.slice(0, 10);
      const cur = byDay.get(day) ?? { max: 0, sum: 0, n: 0, kinds: new Set<string>() };
      cur.max = Math.max(cur.max, p.usAqi);
      cur.sum += p.usAqi;
      cur.n++;
      cur.kinds.add(p.kind);
      byDay.set(day, cur);
    }
    const days = [...byDay.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({
        date,
        peakAqi: Math.round(v.max),
        meanAqi: Math.round(v.sum / v.n),
        kind: v.kinds.has("forecast") && !v.kinds.has("past") ? "forecast" : v.kinds.has("past") && v.kinds.has("forecast") ? "mixed" : [...v.kinds][0],
      }));

    const rows = GROUPS.map((g) => ({
      group: g.id,
      label: g.label,
      thresholds: { caution: g.caution, high: g.high },
      cells: days.map((d) => ({
        date: d.date,
        peakAqi: d.peakAqi,
        kind: d.kind,
        level: d.peakAqi >= g.high ? "high" : d.peakAqi >= g.caution ? "caution" : "ok",
      })),
    }));

    return ok({
      lat: query.lat,
      lng: query.lng,
      days,
      rows,
      source,
      note: "Levels use the day's PEAK hourly snapshot AQI against group-specific thresholds (sensitive groups flag earlier). Heuristic planning view — see /methods; forecast days are model output and less certain.",
    });
  } catch (err) {
    return handleError(err);
  }
}
