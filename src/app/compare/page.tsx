"use client";

/** Compare Mode: 2-5 locations side by side with data-status flags. */
import { useState } from "react";
import SiteHeader from "@/components/SiteHeader";
import SearchBox, { type PickedPlace } from "@/components/ui/SearchBox";
import { api } from "@/lib/client/api";
import { aqiChip } from "@/lib/client/colors";
import { LevelChip, Spinner, StatusBadge } from "@/components/ui/bits";
import type { RiskScoreResult, AirQualitySnapshot } from "@/lib/types";

interface Row {
  place: PickedPlace;
  aq: AirQualitySnapshot | null;
  risk: RiskScoreResult | null;
  loading: boolean;
}

const CONDITIONS = ["asthma", "copd", "heart-disease", "diabetes"];

export default function ComparePage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [conditions, setConditions] = useState<string[]>([]);

  async function addPlace(place: PickedPlace) {
    if (rows.length >= 5 || rows.some((r) => r.place.label === place.label)) return;
    setRows((cur) => [...cur, { place, aq: null, risk: null, loading: true }]);
    await loadRow(place, conditions);
  }

  async function loadRow(place: PickedPlace, conds: string[]) {
    try {
      const [aq, risk] = await Promise.all([
        api<AirQualitySnapshot>(`/api/air-quality/current?lat=${place.lat}&lng=${place.lng}`),
        api<RiskScoreResult>(
          `/api/risk-score?lat=${place.lat}&lng=${place.lng}&conditions=${conds.join(",")}`
        ),
      ]);
      setRows((cur) =>
        cur.map((r) => (r.place.label === place.label ? { ...r, aq, risk, loading: false } : r))
      );
    } catch {
      setRows((cur) =>
        cur.map((r) => (r.place.label === place.label ? { ...r, loading: false } : r))
      );
    }
  }

  function toggleCondition(c: string) {
    const next = conditions.includes(c) ? conditions.filter((x) => x !== c) : [...conditions, c];
    setConditions(next);
    setRows((cur) => cur.map((r) => ({ ...r, loading: true })));
    for (const r of rows) void loadRow(r.place, next);
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
        <h1 className="text-lg font-semibold">Compare locations</h1>
        <p className="mt-1 text-sm text-ink-2">
          Side-by-side alert priority, exposure, monitor confidence, and community context for 2–5
          places. Watch the status badges — a “fallback” AQI is synthetic, not real conditions.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <SearchBox placeholder="Add a location…" onPick={addPlace} />
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-ink-3">Profile:</span>
            {CONDITIONS.map((c) => (
              <button
                key={c}
                onClick={() => toggleCondition(c)}
                className={`rounded-sm border px-2 py-0.5 text-[11px] ${
                  conditions.includes(c)
                    ? "border-accent bg-accent-soft text-accent"
                    : "border-hairline text-ink-2 hover:border-baseline"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        {rows.length === 0 ? (
          <p className="mt-10 text-center text-sm text-ink-3">
            Add locations to compare — e.g. Allentown, PA vs Camden, NJ.
          </p>
        ) : (
          <div className="panel mt-4 overflow-x-auto">
            <table className="tabular w-full text-sm">
              <thead>
                <tr className="border-b border-hairline text-left text-[11px] uppercase tracking-wide text-ink-3">
                  <th className="px-3 py-2 font-medium">Location</th>
                  <th className="px-3 py-2 font-medium">AQI (snapshot)</th>
                  <th className="px-3 py-2 font-medium">Priority</th>
                  <th className="px-3 py-2 font-medium">Exposure</th>
                  <th className="px-3 py-2 font-medium">Monitor conf.</th>
                  <th className="px-3 py-2 font-medium">Health burden</th>
                  <th className="px-3 py-2 font-medium">Equity</th>
                  <th className="px-3 py-2 font-medium">Data status</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.place.label} className="border-b border-hairline last:border-0">
                    <td className="px-3 py-2.5">
                      <span className="font-medium">{r.place.label}</span>
                      <span className="block text-[10px] text-ink-3">
                        {r.place.lat.toFixed(3)}, {r.place.lng.toFixed(3)}
                      </span>
                    </td>
                    {r.loading ? (
                      <td colSpan={7} className="px-3 py-2.5">
                        <Spinner label="Scoring…" />
                      </td>
                    ) : (
                      <>
                        <td className="px-3 py-2.5">
                          <span
                            className="font-semibold"
                            style={{ color: aqiChip(r.aq?.usAqi.value ?? null) }}
                          >
                            {r.aq?.usAqi.value ?? "—"}
                          </span>
                          <span className="ml-1.5 text-[10px] text-ink-3">{r.aq?.category}</span>
                        </td>
                        <td className="px-3 py-2.5">
                          <span className="mr-1.5 font-semibold">{r.risk?.finalScore ?? "—"}</span>
                          {r.risk && <LevelChip level={r.risk.level} />}
                        </td>
                        <td className="px-3 py-2.5">{r.risk?.exposure.score ?? "—"}</td>
                        <td className="px-3 py-2.5">{r.risk?.monitorConfidence.score ?? "—"}</td>
                        <td className="px-3 py-2.5">{r.risk?.healthVulnerability.score ?? "—"}</td>
                        <td className="px-3 py-2.5">{r.risk?.equity.score ?? "—"}</td>
                        <td className="px-3 py-2.5">
                          {r.aq && <StatusBadge status={r.aq.usAqi.source.status} />}
                        </td>
                      </>
                    )}
                    <td className="px-3 py-2.5 text-right">
                      <a
                        className="mr-2 text-xs text-accent hover:underline"
                        href={`/?lat=${r.place.lat}&lng=${r.place.lng}`}
                        title="Open on the command map"
                      >
                        map
                      </a>
                      <button
                        onClick={() =>
                          setRows((cur) => cur.filter((x) => x.place.label !== r.place.label))
                        }
                        className="text-xs text-ink-3 hover:text-critical"
                      >
                        remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {rows.length > 0 && (
          <p className="mt-3 text-[11px] leading-snug text-ink-3">
            Priority combines snapshot exposure (×0.4), county health burden (×0.2), equity (×0.2),
            and the selected susceptibility profile (×0.2); monitor confidence is reported
            separately. Full formula on the Methods page.
          </p>
        )}
      </main>
    </div>
  );
}
