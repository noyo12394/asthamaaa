"use client";

/**
 * Bottom drawer: 48h past + 48h forecast for the selected location, one
 * metric at a time (single axis — AQI, PM2.5, and ozone have different
 * scales so they never share a plot). Crosshair + tooltip; a slider scrubs
 * the same series. Forecast hours are drawn dashed.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/client/api";
import { Spinner, StatusBadge } from "@/components/ui/bits";
import type { HourlyPoint, SourceRef } from "@/lib/types";

type Metric = "usAqi" | "pm25" | "ozone";
const METRICS: { id: Metric; label: string; unit: string }[] = [
  { id: "usAqi", label: "US AQI", unit: "index" },
  { id: "pm25", label: "PM2.5", unit: "µg/m³" },
  { id: "ozone", label: "Ozone", unit: "µg/m³" },
];

const W = 900;
const H = 132;
const PAD = { l: 44, r: 12, t: 10, b: 20 };

export default function Timeline({
  selected,
  open,
  onToggle,
}: {
  selected: { lat: number; lng: number; label: string | null } | null;
  open: boolean;
  onToggle: () => void;
}) {
  const [points, setPoints] = useState<HourlyPoint[]>([]);
  const [source, setSource] = useState<SourceRef | null>(null);
  const [metric, setMetric] = useState<Metric>("usAqi");
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [scrub, setScrub] = useState<number | null>(null); // index
  const [hover, setHover] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const key = selected ? `${selected.lat.toFixed(4)},${selected.lng.toFixed(4)}` : null;
  const loading = Boolean(key) && loadedKey !== key;

  useEffect(() => {
    if (!selected || !open || !key || loadedKey === key) return;
    let stale = false;
    void api<{ points: HourlyPoint[]; source: SourceRef }>(
      `/api/air-quality/history?lat=${selected.lat}&lng=${selected.lng}&range=48h`
    )
      .then((d) => {
        if (stale) return;
        setPoints(d.points);
        setSource(d.source);
        setScrub(null);
        setLoadedKey(key);
      })
      .catch(() => !stale && setLoadedKey(key));
    return () => {
      stale = true;
    };
  }, [selected, open, key, loadedKey]);

  const { path, forecastPath, xOf, yOf, min, max, nowX } = useMemo(() => {
    const vals = points.map((p) => p[metric]).filter((v): v is number => v != null);
    const mn = vals.length ? Math.min(...vals, 0) : 0;
    const mx = vals.length ? Math.max(...vals) * 1.15 : 1;
    const xOf = (i: number) => PAD.l + (i / Math.max(1, points.length - 1)) * (W - PAD.l - PAD.r);
    const yOf = (v: number) => H - PAD.b - ((v - mn) / (mx - mn || 1)) * (H - PAD.t - PAD.b);
    let past = "";
    let fut = "";
    let nowX: number | null = null;
    points.forEach((p, i) => {
      const v = p[metric];
      if (v == null) return;
      const seg = `${xOf(i).toFixed(1)},${yOf(v).toFixed(1)}`;
      if (p.kind === "forecast") fut += fut ? ` L${seg}` : `M${seg}`;
      else {
        past += past ? ` L${seg}` : `M${seg}`;
        if (p.kind === "current") nowX = xOf(i);
      }
    });
    // connect the seams
    const lastPastIdx = points.findLastIndex((p) => p.kind !== "forecast" && p[metric] != null);
    if (lastPastIdx >= 0 && fut) {
      const v = points[lastPastIdx][metric]!;
      fut = `M${xOf(lastPastIdx).toFixed(1)},${yOf(v).toFixed(1)} ${fut.slice(1)}`;
    }
    return { path: past, forecastPath: fut, xOf, yOf, min: mn, max: mx, nowX };
  }, [points, metric]);

  const activeIdx = hover ?? scrub;
  const active = activeIdx != null ? points[activeIdx] : null;

  function idxFromEvent(e: React.MouseEvent<SVGSVGElement>): number | null {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || points.length === 0) return null;
    const x = ((e.clientX - rect.left) / rect.width) * W;
    const frac = (x - PAD.l) / (W - PAD.l - PAD.r);
    return Math.round(Math.min(1, Math.max(0, frac)) * (points.length - 1));
  }

  return (
    <div className="panel border-x-0 border-b-0">
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between px-3 py-1.5 text-left"
        aria-expanded={open}
      >
        <span className="panel-title">Timeline — recent · current · forecast</span>
        <span className="text-xs text-ink-3">{open ? "▾ collapse" : "▴ expand"}</span>
      </button>

      {open && (
        <div className="px-3 pb-2">
          {!selected && (
            <p className="py-4 text-center text-xs text-ink-3">Select a location to see its trend.</p>
          )}
          {selected && loading && (
            <div className="py-4 text-center">
              <Spinner label="Loading hourly series…" />
            </div>
          )}
          {selected && !loading && points.length > 0 && (
            <>
              <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                <div className="flex gap-1" role="tablist" aria-label="Timeline metric">
                  {METRICS.map((m) => (
                    <button
                      key={m.id}
                      role="tab"
                      aria-selected={metric === m.id}
                      onClick={() => setMetric(m.id)}
                      className={`rounded-sm px-2 py-0.5 text-[11px] ${
                        metric === m.id ? "bg-accent-soft font-medium text-accent" : "text-ink-3 hover:text-ink-2"
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2 text-[11px] text-ink-3">
                  {active && (
                    <span className="tabular font-medium text-ink">
                      {new Date(active.time).toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" })}
                      {" — "}
                      {active[metric] ?? "—"} {METRICS.find((m) => m.id === metric)?.unit}
                      {active.kind === "forecast" && " (forecast)"}
                    </span>
                  )}
                  {source && <StatusBadge status={source.status} />}
                  <span>{source?.name}</span>
                </div>
              </div>

              <svg
                ref={svgRef}
                viewBox={`0 0 ${W} ${H}`}
                className="w-full cursor-crosshair"
                role="img"
                aria-label={`Hourly ${metric} trend`}
                onMouseMove={(e) => setHover(idxFromEvent(e))}
                onMouseLeave={() => setHover(null)}
                onClick={(e) => setScrub(idxFromEvent(e))}
              >
                {/* gridlines */}
                {[0.25, 0.5, 0.75].map((f) => {
                  const y = PAD.t + f * (H - PAD.t - PAD.b);
                  return <line key={f} x1={PAD.l} x2={W - PAD.r} y1={y} y2={y} stroke="#e1e0d9" strokeWidth={1} />;
                })}
                {/* axis labels */}
                <text x={PAD.l - 6} y={PAD.t + 8} textAnchor="end" fontSize={10} fill="#898781" className="tabular">
                  {Math.round(max)}
                </text>
                <text x={PAD.l - 6} y={H - PAD.b} textAnchor="end" fontSize={10} fill="#898781" className="tabular">
                  {Math.round(min)}
                </text>
                {/* day ticks */}
                {points.map((p, i) =>
                  p.time.endsWith("00:00:00Z") ? (
                    <text key={i} x={xOf(i)} y={H - 6} textAnchor="middle" fontSize={9} fill="#898781">
                      {new Date(p.time).toLocaleDateString([], { weekday: "short" })}
                    </text>
                  ) : null
                )}
                {/* now marker */}
                {nowX != null && (
                  <>
                    <line x1={nowX} x2={nowX} y1={PAD.t} y2={H - PAD.b} stroke="#c3c2b7" strokeWidth={1} strokeDasharray="3 3" />
                    <text x={nowX + 3} y={PAD.t + 8} fontSize={9} fill="#898781">
                      now
                    </text>
                  </>
                )}
                {/* series: past solid, forecast dashed */}
                <path d={path} fill="none" stroke="#2a78d6" strokeWidth={2} strokeLinejoin="round" />
                <path d={forecastPath} fill="none" stroke="#2a78d6" strokeWidth={2} strokeDasharray="5 4" opacity={0.7} />
                {/* crosshair */}
                {activeIdx != null && points[activeIdx]?.[metric] != null && (
                  <>
                    <line
                      x1={xOf(activeIdx)}
                      x2={xOf(activeIdx)}
                      y1={PAD.t}
                      y2={H - PAD.b}
                      stroke="#52514e"
                      strokeWidth={1}
                    />
                    <circle
                      cx={xOf(activeIdx)}
                      cy={yOf(points[activeIdx][metric]!)}
                      r={4}
                      fill="#2a78d6"
                      stroke="#fcfcfb"
                      strokeWidth={2}
                    />
                  </>
                )}
              </svg>

              <input
                type="range"
                min={0}
                max={points.length - 1}
                value={scrub ?? points.findIndex((p) => p.kind === "current")}
                onChange={(e) => setScrub(parseInt(e.target.value, 10))}
                className="w-full accent-[#1c5cab]"
                aria-label="Scrub timeline"
              />
              <p className="text-[10px] text-ink-3">
                Map layers always show current conditions; the slider scrubs this location’s hourly
                series (dashed = model forecast).
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
