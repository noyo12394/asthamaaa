import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { countiesOfState } from "@/lib/counties";
import { classifySparsity } from "@/lib/sparsity";
import { getCurrentBatch } from "@/lib/openmeteo";
import { healthForCounty, vulnerabilityForCounty, HEALTH_SOURCE, VULNERABILITY_SOURCE } from "@/lib/health";
import { populationForCounty, POPULATION_SOURCE } from "@/lib/population";
import { MONITOR_SOURCE } from "@/lib/monitors";
import { cached } from "@/lib/cache";
import { bad, handleError, ok, parseQuery } from "@/lib/api";

/**
 * Equity Lens: structural facts, carefully framed.
 *  - scope=state  — counties of one state grouped into poverty terciles:
 *      coverage (sparsity), exposure (current PM2.5), burden (prevalence)
 *  - scope=pass   — cross-state comparison across the PASS Mid-Atlantic
 *      region at a shared county-equivalent unit
 *
 * Numbers are stated with sources and status labels; the response includes
 * explicit framing notes (correlation ≠ causal mechanism; monitor siting and
 * zoning history are structural, not behavioral).
 */
const PASS_STATES = ["PA", "NJ", "NY", "MD", "DE"];

const schema = z.object({
  scope: z.enum(["state", "pass"]).default("state"),
  state: z.string().length(2).default("PA"),
});

interface CountyRow {
  fips: string;
  name: string;
  poverty: number | null;
  minorityPct: number | null;
  sparsityClass: string;
  nearestKm: number | null;
  pm25: number | null;
  asthma: number | null;
  copd: number | null;
  population: number | null;
}

async function stateRows(state: string): Promise<CountyRow[]> {
  const counties = countiesOfState(state);
  const batchPoints = counties.slice(0, 60).map((c) => ({ lat: c.centroidLat, lng: c.centroidLng }));
  const { values } = await getCurrentBatch(batchPoints);
  return counties.map((c, i) => {
    const s = classifySparsity(c.centroidLat, c.centroidLng);
    const health = healthForCounty(c.fips);
    const vuln = vulnerabilityForCounty(c.fips);
    const pop = populationForCounty(c.fips);
    return {
      fips: c.fips,
      name: c.name,
      poverty: vuln?.poverty ?? null,
      minorityPct: pop?.minorityPct ?? null,
      sparsityClass: s.class,
      nearestKm: s.nearestMonitorKm,
      pm25: i < 60 ? (values[i]?.pm25 ?? null) : null,
      asthma: health?.asthma ?? null,
      copd: health?.copd ?? null,
      population: pop?.population ?? null,
    };
  });
}

function mean(xs: (number | null)[]): number | null {
  const v = xs.filter((x): x is number => x != null);
  return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 100) / 100 : null;
}

function terciles(rows: CountyRow[]) {
  const ranked = rows.filter((r) => r.poverty != null).sort((a, b) => a.poverty! - b.poverty!);
  const n = Math.floor(ranked.length / 3);
  const groups = [
    { label: "Lowest-poverty third", rows: ranked.slice(0, n) },
    { label: "Middle third", rows: ranked.slice(n, 2 * n) },
    { label: "Highest-poverty third", rows: ranked.slice(2 * n) },
  ];
  return groups.map((g) => ({
    group: g.label,
    counties: g.rows.length,
    povertyPct: mean(g.rows.map((r) => r.poverty)),
    minorityPct: mean(g.rows.map((r) => r.minorityPct)),
    meanNearestMonitorKm: mean(g.rows.map((r) => r.nearestKm)),
    pctSparseOrRemote: g.rows.length
      ? Math.round(
          (g.rows.filter((r) => r.sparsityClass === "sparse" || r.sparsityClass === "remote").length /
            g.rows.length) *
            100
        )
      : null,
    meanPm25: mean(g.rows.map((r) => r.pm25)),
    meanAsthmaPct: mean(g.rows.map((r) => r.asthma)),
    meanCopdPct: mean(g.rows.map((r) => r.copd)),
  }));
}

export async function GET(req: NextRequest) {
  try {
    const query = parseQuery(req, schema);
    if (query instanceof NextResponse) return query;

    const framing = {
      note: "These are structural, infrastructural observations — monitor siting history and land-use/zoning patterns shape both who is monitored and who is exposed. Group differences here are correlations in the data, not proof of a specific causal mechanism, and never a statement about any group's behavior.",
      sources: [MONITOR_SOURCE, HEALTH_SOURCE, VULNERABILITY_SOURCE, POPULATION_SOURCE],
    };

    if (query.scope === "pass") {
      const hit = await cached("equity:pass", 30 * 60 * 1000, async () => {
        const states = await Promise.all(
          PASS_STATES.map(async (st) => {
            const rows = await stateRows(st);
            const totalPop = rows.reduce((s, r) => s + (r.population ?? 0), 0);
            const sparsePop = rows
              .filter((r) => r.sparsityClass === "sparse" || r.sparsityClass === "remote")
              .reduce((s, r) => s + (r.population ?? 0), 0);
            return {
              state: st,
              counties: rows.length,
              meanNearestMonitorKm: mean(rows.map((r) => r.nearestKm)),
              pctPopulationSparseOrRemote: totalPop
                ? Math.round((sparsePop / totalPop) * 100)
                : null,
              meanPm25: mean(rows.map((r) => r.pm25)),
              meanAsthmaPct: mean(rows.map((r) => r.asthma)),
              meanPovertyPct: mean(rows.map((r) => r.poverty)),
            };
          })
        );
        return states;
      });
      return ok({ scope: "pass", states: PASS_STATES, comparison: hit.value, framing });
    }

    const state = query.state.toUpperCase();
    if (countiesOfState(state).length === 0) return bad(`Unknown state: ${state}`, 404);
    const hit = await cached(`equity:state:${state}`, 30 * 60 * 1000, async () => {
      const rows = await stateRows(state);
      return { groups: terciles(rows), countiesAnalyzed: rows.length };
    });
    return ok({ scope: "state", state, ...hit.value, framing });
  } catch (err) {
    return handleError(err);
  }
}
