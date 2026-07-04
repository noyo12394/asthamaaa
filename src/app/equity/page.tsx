"use client";

/**
 * Equity Lens: three factual panels — who has less monitoring coverage, who
 * has higher exposure, who has higher health burden — grouped by county
 * poverty terciles, plus a cross-state PASS-region comparison. Structural
 * framing, sourced numbers, no causal overreach.
 */
import { useEffect, useState } from "react";
import SiteHeader from "@/components/SiteHeader";
import { api } from "@/lib/client/api";
import { Spinner, StatusBadge } from "@/components/ui/bits";
import type { SourceRef } from "@/lib/types";

interface Group {
  group: string;
  counties: number;
  povertyPct: number | null;
  minorityPct: number | null;
  meanNearestMonitorKm: number | null;
  pctSparseOrRemote: number | null;
  meanPm25: number | null;
  meanAsthmaPct: number | null;
  meanCopdPct: number | null;
}

interface StateComparison {
  state: string;
  counties: number;
  meanNearestMonitorKm: number | null;
  pctPopulationSparseOrRemote: number | null;
  meanPm25: number | null;
  meanAsthmaPct: number | null;
  meanPovertyPct: number | null;
}

interface Framing {
  note: string;
  sources: SourceRef[];
}

const STATES = ["PA", "NJ", "NY", "MD", "DE"];

export default function EquityPage() {
  const [state, setState] = useState("PA");
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [passRows, setPassRows] = useState<StateComparison[] | null>(null);
  const [framing, setFraming] = useState<Framing | null>(null);
  const [loadedState, setLoadedState] = useState<string | null>(null);
  const loading = loadedState !== state;

  useEffect(() => {
    if (loadedState === state) return;
    let stale = false;
    void Promise.all([
      api<{ groups: Group[]; framing: Framing }>(`/api/equity-lens?scope=state&state=${state}`),
      passRows
        ? Promise.resolve(null)
        : api<{ comparison: StateComparison[] }>(`/api/equity-lens?scope=pass`).catch(() => null),
    ])
      .then(([st, pass]) => {
        if (stale) return;
        setGroups(st.groups);
        setFraming(st.framing);
        if (pass) setPassRows(pass.comparison);
      })
      .catch(() => {})
      .finally(() => !stale && setLoadedState(state));
    return () => {
      stale = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, loadedState]);

  const fmt = (v: number | null, suffix = "") => (v == null ? "—" : `${v}${suffix}`);

  const panel = (
    title: string,
    question: string,
    cols: { label: string; value: (g: Group) => string }[]
  ) =>
    groups && (
      <section className="panel p-4">
        <h2 className="text-sm font-semibold">{title}</h2>
        <p className="mt-0.5 text-xs text-ink-3">{question}</p>
        <table className="tabular mt-3 w-full text-xs">
          <thead>
            <tr className="border-b border-hairline text-left text-[10px] uppercase tracking-wide text-ink-3">
              <th className="py-1.5 pr-2 font-medium">County group (by poverty)</th>
              {cols.map((c) => (
                <th key={c.label} className="py-1.5 pr-2 text-right font-medium">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <tr key={g.group} className="border-b border-hairline last:border-0">
                <td className="py-1.5 pr-2">
                  {g.group}
                  <span className="block text-[10px] text-ink-3">
                    {g.counties} counties · poverty {fmt(g.povertyPct, "%")} · minority{" "}
                    {fmt(g.minorityPct, "%")}
                  </span>
                </td>
                {cols.map((c) => (
                  <td key={c.label} className="py-1.5 pr-2 text-right font-medium">
                    {c.value(g)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    );

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6">
        <h1 className="text-lg font-semibold">Equity Lens</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-2">
          Structural facts about who gets monitored, who gets exposed, and who carries the health
          burden — stated plainly, with sources, and without causal claims the data can’t support.
        </p>

        <div className="mt-4 flex items-center gap-2">
          <span className="text-xs text-ink-3">State:</span>
          {STATES.map((s) => (
            <button
              key={s}
              onClick={() => setState(s)}
              className={`rounded-sm border px-2.5 py-1 text-xs font-medium ${
                state === s ? "border-accent bg-accent-soft text-accent" : "border-hairline text-ink-2"
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        {loading && (
          <div className="mt-8 text-center">
            <Spinner label="Computing group statistics…" />
          </div>
        )}

        {!loading && groups && (
          <div className="mt-4 space-y-4">
            {panel("1 · Who has less monitoring coverage?", "Monitor siting is infrastructure — its history decides who gets measured.", [
              { label: "Mean dist. to monitor", value: (g) => fmt(g.meanNearestMonitorKm, " km") },
              { label: "% counties sparse/remote", value: (g) => fmt(g.pctSparseOrRemote, "%") },
            ])}
            {panel("2 · Who has higher exposure?", "Current PM2.5 (model snapshot) averaged over each group's county centroids.", [
              { label: "Mean PM2.5 (µg/m³)", value: (g) => fmt(g.meanPm25) },
            ])}
            {panel("3 · Who has higher health burden?", "County prevalence — population burden shaped by decades of land use, housing, and access to care.", [
              { label: "Adult asthma", value: (g) => fmt(g.meanAsthmaPct, "%") },
              { label: "COPD", value: (g) => fmt(g.meanCopdPct, "%") },
            ])}

            {passRows && (
              <section className="panel p-4">
                <h2 className="text-sm font-semibold">Cross-state comparison — PASS region</h2>
                <p className="mt-0.5 text-xs text-ink-3">
                  Same county-equivalent metrics across the five-state Mid-Atlantic study region —
                  monitoring infrastructure does not stop at state lines, and neither should the
                  comparison.
                </p>
                <table className="tabular mt-3 w-full text-xs">
                  <thead>
                    <tr className="border-b border-hairline text-left text-[10px] uppercase tracking-wide text-ink-3">
                      <th className="py-1.5 pr-2 font-medium">State</th>
                      <th className="py-1.5 pr-2 text-right font-medium">Mean dist. to monitor</th>
                      <th className="py-1.5 pr-2 text-right font-medium">% pop. sparse/remote</th>
                      <th className="py-1.5 pr-2 text-right font-medium">Mean PM2.5</th>
                      <th className="py-1.5 pr-2 text-right font-medium">Adult asthma</th>
                      <th className="py-1.5 pr-2 text-right font-medium">Poverty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {passRows.map((r) => (
                      <tr key={r.state} className="border-b border-hairline last:border-0">
                        <td className="py-1.5 pr-2 font-medium">{r.state}</td>
                        <td className="py-1.5 pr-2 text-right">{fmt(r.meanNearestMonitorKm, " km")}</td>
                        <td className="py-1.5 pr-2 text-right">{fmt(r.pctPopulationSparseOrRemote, "%")}</td>
                        <td className="py-1.5 pr-2 text-right">{fmt(r.meanPm25)}</td>
                        <td className="py-1.5 pr-2 text-right">{fmt(r.meanAsthmaPct, "%")}</td>
                        <td className="py-1.5 pr-2 text-right">{fmt(r.meanPovertyPct, "%")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}

            {framing && (
              <div className="text-[11px] leading-snug text-ink-3">
                <p>{framing.note}</p>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                  {framing.sources.map((s) => (
                    <span key={s.name} className="inline-flex items-center gap-1.5">
                      <StatusBadge status={s.status} />
                      {s.name}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
