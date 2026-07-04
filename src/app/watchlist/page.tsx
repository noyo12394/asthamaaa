"use client";

/**
 * Outcome Watchlist: county-level health-outcome signals to watch — calm,
 * sourced framing; syndromic rows flagged "not yet live" instead of faked.
 */
import { useEffect, useState } from "react";
import SiteHeader from "@/components/SiteHeader";
import { api } from "@/lib/client/api";
import { Spinner, StatusBadge } from "@/components/ui/bits";
import type { SourceRef } from "@/lib/types";

interface Signal {
  id: string;
  label: string;
  value: number | null;
  unit: string | null;
  live: boolean;
  note?: string;
}

interface Row {
  fips: string;
  county: string;
  population: number | null;
  monitorCoverage: string;
  signals: Signal[];
  watchScore: number;
}

const STATES = ["PA", "NJ", "NY", "MD", "DE"];

export default function WatchlistPage() {
  const [state, setState] = useState("PA");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [source, setSource] = useState<SourceRef | null>(null);
  const [framing, setFraming] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [loadedState, setLoadedState] = useState<string | null>(null);
  const loading = loadedState !== state;

  useEffect(() => {
    if (loadedState === state) return;
    let stale = false;
    void api<{ rows: Row[]; source: SourceRef; framing: string }>(
      `/api/watchlist?state=${state}&limit=15`
    )
      .then((d) => {
        if (stale) return;
        setRows(d.rows);
        setSource(d.source);
        setFraming(d.framing);
      })
      .catch(() => {})
      .finally(() => !stale && setLoadedState(state));
    return () => {
      stale = true;
    };
  }, [state, loadedState]);

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
        <h1 className="text-lg font-semibold">Outcome watchlist</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-2">
          Counties where chronic respiratory/cardiovascular burden most warrants attention on
          poor-air days — signals to watch for planning, not alerts.
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
            <Spinner label="Ranking counties…" />
          </div>
        )}

        {rows && !loading && (
          <ol className="mt-4 space-y-2">
            {rows.map((r, i) => (
              <li key={r.fips} className="panel">
                <button
                  className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left"
                  onClick={() => setOpen(open === r.fips ? null : r.fips)}
                  aria-expanded={open === r.fips}
                >
                  <span>
                    <span className="text-sm font-medium">
                      {i + 1}. {r.county}
                    </span>
                    <span className="tabular block text-[11px] text-ink-3">
                      pop. {r.population?.toLocaleString() ?? "?"} · monitor coverage{" "}
                      {r.monitorCoverage}
                    </span>
                  </span>
                  <span className="tabular text-xs text-ink-2">
                    watch score <span className="text-base font-semibold text-ink">{r.watchScore}</span>
                  </span>
                </button>
                {open === r.fips && (
                  <div className="border-t border-hairline px-4 py-3">
                    <table className="tabular w-full text-xs">
                      <tbody>
                        {r.signals.map((s) => (
                          <tr key={s.id} className="border-b border-hairline last:border-0">
                            <td className="py-1.5 pr-2 text-ink-2">{s.label}</td>
                            <td className="py-1.5 pr-2 text-right font-medium">
                              {s.live ? (
                                `${s.value ?? "—"}${s.unit ?? ""}`
                              ) : (
                                <span className="rounded-sm bg-surface-2 px-1.5 py-0.5 text-[10px] font-medium text-ink-3">
                                  not yet live
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {r.signals.some((s) => !s.live) && (
                      <p className="mt-2 text-[10px] leading-snug text-ink-3">
                        {r.signals.find((s) => !s.live)?.note}
                      </p>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ol>
        )}

        {source && !loading && (
          <div className="mt-4 text-[11px] leading-snug text-ink-3">
            <p>{framing}</p>
            <p className="mt-1.5 inline-flex items-center gap-1.5">
              <StatusBadge status={source.status} /> {source.name} · {source.vintage}
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
