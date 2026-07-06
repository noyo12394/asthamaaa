"use client";

/**
 * Exposure × Susceptibility weekly outlook: one row per condition group, one
 * cell per day — the planning view, distinct from the hourly operational
 * strip on the command map.
 */
import { useState } from "react";
import SiteHeader from "@/components/SiteHeader";
import SearchBox, { type PickedPlace } from "@/components/ui/SearchBox";
import { api } from "@/lib/client/api";
import { Spinner, StatusBadge } from "@/components/ui/bits";
import type { SourceRef } from "@/lib/types";

interface OutlookData {
  days: { date: string; peakAqi: number; meanAqi: number; kind: string }[];
  rows: {
    group: string;
    label: string;
    thresholds: { caution: number; high: number };
    cells: { date: string; peakAqi: number; kind: string; level: "ok" | "caution" | "high" }[];
  }[];
  source: SourceRef;
  note: string;
}

const LEVEL_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  ok: { bg: "#e5f4e5", text: "#186318", label: "OK" },
  caution: { bg: "#faf3d7", text: "#8a6d00", label: "Caution" },
  high: { bg: "#fbdddd", text: "#a52727", label: "High" },
};

export default function OutlookPage() {
  const [place, setPlace] = useState<PickedPlace | null>(null);
  const [data, setData] = useState<OutlookData | null>(null);
  const [loading, setLoading] = useState(false);

  async function load(p: PickedPlace) {
    setLoading(true);
    try {
      const d = await api<OutlookData>(`/api/weekly-outlook?lat=${p.lat}&lng=${p.lng}`);
      setData(d);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6">
        <h1 className="text-lg font-semibold">7-day outlook by condition</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-2">
          A weekly planning view: each row is a susceptibility group with its own thresholds —
          sensitive groups flag concern earlier than the generic AQI strip would. Forecast days
          are model output and less certain.
        </p>

        <div className="mt-4">
          <SearchBox
            placeholder="Plan for a location…"
            onPick={(p) => {
              setPlace(p);
              void load(p);
            }}
          />
        </div>

        {loading && (
          <div className="mt-8 text-center">
            <Spinner label="Building the weekly grid…" />
          </div>
        )}

        {data && !loading && place && (
          <>
            <div className="panel mt-5 overflow-x-auto">
              <table className="tabular w-full text-xs">
                <thead>
                  <tr className="border-b border-hairline text-left text-[10px] uppercase tracking-wide text-ink-3">
                    <th className="px-3 py-2 font-medium">Group</th>
                    {data.days.map((d) => (
                      <th key={d.date} className="px-1.5 py-2 text-center font-medium">
                        {new Date(d.date + "T12:00:00Z").toLocaleDateString([], {
                          weekday: "short",
                        })}
                        <span className="block font-normal normal-case">
                          {d.date.slice(5)}
                          {d.kind === "forecast" && " ᶠ"}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((row) => (
                    <tr key={row.group} className="border-b border-hairline last:border-0">
                      <td className="px-3 py-2">
                        <span className="font-medium">{row.label}</span>
                        <span className="block text-[10px] text-ink-3">
                          caution ≥{row.thresholds.caution} · high ≥{row.thresholds.high}
                        </span>
                      </td>
                      {row.cells.map((cell) => {
                        const s = LEVEL_STYLE[cell.level];
                        return (
                          <td key={cell.date} className="px-1.5 py-2 text-center">
                            <span
                              className="inline-block w-full rounded-sm px-1 py-1.5 font-semibold"
                              style={{
                                background: s.bg,
                                color: s.text,
                                opacity: cell.kind === "forecast" ? 0.75 : 1,
                              }}
                              title={`peak AQI ${cell.peakAqi}${cell.kind === "forecast" ? " (forecast)" : ""}`}
                            >
                              {cell.peakAqi}
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-ink-3">
              {Object.entries(LEVEL_STYLE).map(([k, s]) => (
                <span key={k} className="inline-flex items-center gap-1">
                  <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.bg, border: `1px solid ${s.text}33` }} />
                  {s.label}
                </span>
              ))}
              <span>ᶠ = forecast</span>
              <StatusBadge status={data.source.status} />
              <span>{data.source.name}</span>
            </div>
            <p className="mt-2 max-w-2xl text-[11px] leading-snug text-ink-3">{data.note}</p>
          </>
        )}

        {!data && !loading && (
          <p className="mt-10 text-center text-sm text-ink-3">
            Search a location to see its week, e.g. “Allentown, PA”.
          </p>
        )}
      </main>
    </div>
  );
}
