import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { countiesOfState } from "@/lib/counties";
import { healthForCounty, HEALTH_SOURCE } from "@/lib/health";
import { populationForCounty } from "@/lib/population";
import { classifySparsity } from "@/lib/sparsity";
import { bad, handleError, ok, parseQuery } from "@/lib/api";

/**
 * Outcome Watchlist: county-level health-outcome SIGNALS TO WATCH — calm,
 * sourced, never outbreak language. Chronic-disease burden rows come from
 * the county health snapshot (CDC PLACES when ingested; labeled fallback
 * otherwise). ER-visit/syndromic rows are architecture-flagged "not yet
 * live" rather than faked.
 */
const schema = z.object({
  state: z.string().length(2).default("PA"),
  limit: z.coerce.number().int().min(1).max(50).default(15),
});

export async function GET(req: NextRequest) {
  try {
    const query = parseQuery(req, schema);
    if (query instanceof NextResponse) return query;
    const state = query.state.toUpperCase();
    const counties = countiesOfState(state);
    if (counties.length === 0) return bad(`Unknown state: ${state}`, 404);

    const rows = counties
      .map((c) => {
        const h = healthForCounty(c.fips);
        const pop = populationForCounty(c.fips);
        const s = classifySparsity(c.centroidLat, c.centroidLng);
        const signals = [
          { id: "asthma", label: "Adult asthma prevalence", value: h?.asthma ?? null, unit: "%", live: true },
          { id: "copd", label: "COPD prevalence", value: h?.copd ?? null, unit: "%", live: true },
          { id: "hypertension", label: "Hypertension prevalence", value: h?.hypertension ?? null, unit: "%", live: true },
          { id: "diabetes", label: "Diabetes prevalence", value: h?.diabetes ?? null, unit: "%", live: true },
          { id: "heartDisease", label: "Coronary heart disease", value: h?.heartDisease ?? null, unit: "%", live: true },
          { id: "asthma-er", label: "Asthma ER visits (syndromic)", value: null, unit: null, live: false, note: "Not yet live — requires state syndromic/HCUP feed; shown as unavailable rather than estimated." },
          { id: "heat-stress", label: "Heat-stress admissions", value: null, unit: null, live: false, note: "Not yet live — same as above." },
        ];
        const watchScore =
          (h?.asthma ?? 0) / 14 + (h?.copd ?? 0) / 12 + (h?.hypertension ?? 0) / 45;
        return {
          fips: c.fips,
          county: `${c.name}, ${c.state}`,
          population: pop?.population ?? null,
          monitorCoverage: s.class,
          signals,
          watchScore: Math.round(watchScore * 33.3),
        };
      })
      .sort((a, b) => b.watchScore - a.watchScore)
      .slice(0, query.limit);

    return ok({
      state,
      rows,
      source: HEALTH_SOURCE,
      framing:
        "Signals to watch, not alerts: these are slow-moving population prevalence figures that identify where respiratory/cardiovascular capacity planning matters most — not outbreak indicators. Rows marked 'not yet live' await a real syndromic data feed.",
    });
  } catch (err) {
    return handleError(err);
  }
}
