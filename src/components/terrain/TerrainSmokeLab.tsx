"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  BarChart3,
  BrainCircuit,
  Check,
  Layers3,
  Mountain,
  Play,
  Satellite,
  Wind,
} from "lucide-react";
import SearchBox, { type PickedPlace } from "@/components/ui/SearchBox";
import { api } from "@/lib/client/api";
import { convertKm, type DistanceUnit } from "@/lib/distance";
import type { TerrainSmokeAnalysis } from "@/lib/terrain-smoke";
import TerrainStudyMap from "./TerrainStudyMap";

const DEFAULT_PLACE: PickedPlace = {
  label: "Allentown, Pennsylvania",
  lat: 40.6023,
  lng: -75.4714,
};

function fmt(value: number | null, digits = 1, suffix = "") {
  return value == null ? "Unavailable" : `${value.toFixed(digits)}${suffix}`;
}

function Metric({ label, value, note, tone = "ink" }: { label: string; value: string; note: string; tone?: "ink" | "teal" | "orange" | "blue" }) {
  const tones = {
    ink: "text-ink",
    teal: "text-[#147c70]",
    orange: "text-[#bd5d33]",
    blue: "text-accent",
  };
  return (
    <div className="min-w-0 border-r border-hairline px-3 py-3 last:border-r-0">
      <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-3">{label}</div>
      <div className={`tabular mt-1 text-xl font-semibold ${tones[tone]}`}>{value}</div>
      <div className="mt-0.5 text-[10px] leading-snug text-ink-3">{note}</div>
    </div>
  );
}

function LineChart({ points }: { points: { time: string; value: number }[] }) {
  if (points.length < 2) return <div className="grid h-32 place-items-center text-xs text-ink-3">No complete history</div>;
  const width = 620;
  const height = 150;
  const padding = 22;
  const values = points.map((point) => point.value);
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 0);
  const span = Math.max(1, max - min);
  const x = (index: number) => padding + (index / (points.length - 1)) * (width - padding * 2);
  const y = (value: number) => height - padding - ((value - min) / span) * (height - padding * 2);
  const path = points.map((point, index) => `${index ? "L" : "M"}${x(index)},${y(point.value)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-36 w-full" role="img" aria-label="Hourly orographic exposure differential line chart">
      <line x1={padding} x2={width - padding} y1={y(0)} y2={y(0)} stroke="currentColor" opacity="0.24" strokeDasharray="4 4" />
      <path d={`${path} L${x(points.length - 1)},${y(0)} L${x(0)},${y(0)} Z`} fill="#3157b7" opacity="0.1" />
      <path d={path} fill="none" stroke="#3157b7" strokeWidth="2.2" />
      <text x={padding} y={14} fontSize="10" fill="currentColor" opacity="0.6">{max.toFixed(1)}</text>
      <text x={padding} y={height - 4} fontSize="10" fill="currentColor" opacity="0.6">{min.toFixed(1)} µg/m³</text>
    </svg>
  );
}

function ScatterPlot({ analysis }: { analysis: TerrainSmokeAnalysis }) {
  const points = analysis.cells.filter((cell) => cell.currentPm25 != null);
  if (!points.length) return <div className="grid h-36 place-items-center text-xs text-ink-3">No current modeled PM2.5</div>;
  const width = 420;
  const height = 170;
  const pad = 27;
  const elevations = points.map((cell) => cell.elevationM);
  const values = points.map((cell) => cell.currentPm25 as number);
  const minX = Math.min(...elevations);
  const maxX = Math.max(...elevations);
  const minY = Math.min(...values);
  const maxY = Math.max(...values);
  const x = (value: number) => pad + ((value - minX) / Math.max(1, maxX - minX)) * (width - pad * 2);
  const y = (value: number) => height - pad - ((value - minY) / Math.max(1, maxY - minY)) * (height - pad * 2);
  const colors = { lowland: "#1f9d8a", transition: "#d7a62d", highland: "#d9654b" };
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-40 w-full" role="img" aria-label="Elevation versus current modeled PM2.5 scatter plot">
      <line x1={pad} x2={pad} y1={pad} y2={height - pad} stroke="currentColor" opacity="0.25" />
      <line x1={pad} x2={width - pad} y1={height - pad} y2={height - pad} stroke="currentColor" opacity="0.25" />
      {points.map((cell) => (
        <circle key={cell.id} cx={x(cell.elevationM)} cy={y(cell.currentPm25 as number)} r="4.5" fill={colors[cell.terrainClass]} fillOpacity="0.78" stroke="#fff" strokeWidth="0.8" />
      ))}
      <text x={width / 2} y={height - 5} textAnchor="middle" fontSize="10" fill="currentColor" opacity="0.65">Elevation (m)</text>
      <text x={8} y={height / 2} transform={`rotate(-90 8 ${height / 2})`} textAnchor="middle" fontSize="10" fill="currentColor" opacity="0.65">PM2.5</text>
    </svg>
  );
}

function Toggle({ active, label, icon, onClick }: { active: boolean; label: string; icon: React.ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active} className={`flex min-h-9 items-center gap-1.5 rounded-sm border px-2.5 text-xs font-medium ${active ? "border-accent bg-accent-soft text-accent" : "border-hairline bg-surface text-ink-2 hover:bg-surface-2"}`}>
      {icon}{label}{active && <Check size={12} className="ml-auto" />}
    </button>
  );
}

export default function TerrainSmokeLab() {
  const [place, setPlace] = useState(DEFAULT_PLACE);
  const [radiusKm, setRadiusKm] = useState(40);
  const [pastDays, setPastDays] = useState(3);
  const [unit, setUnit] = useState<DistanceUnit>("km");
  const [analysis, setAnalysis] = useState<TerrainSmokeAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [visible, setVisible] = useState({ terrain: true, pm25: true, smoke: true });
  const requestId = useRef(0);

  async function run(nextPlace = place, nextRadius = radiusKm, nextDays = pastDays) {
    const id = ++requestId.current;
    setLoading(true);
    setError("");
    setAnalysis(null);
    try {
      const result = await api<TerrainSmokeAnalysis>(
        `/api/terrain-smoke?lat=${nextPlace.lat}&lng=${nextPlace.lng}&radiusKm=${nextRadius}&pastDays=${nextDays}`
      );
      if (id === requestId.current) setAnalysis(result);
    } catch (cause) {
      if (id === requestId.current) setError(cause instanceof Error ? cause.message : "Analysis failed.");
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }

  function selectRadius(nextRadius: number) {
    if (nextRadius === radiusKm) return;
    setRadiusKm(nextRadius);
    void run(place, nextRadius, pastDays);
  }

  function selectEvidenceWindow(nextDays: number) {
    if (nextDays === pastDays) return;
    setPastDays(nextDays);
    void run(place, radiusKm, nextDays);
  }

  useEffect(() => {
    const id = ++requestId.current;
    api<TerrainSmokeAnalysis>(
      `/api/terrain-smoke?lat=${DEFAULT_PLACE.lat}&lng=${DEFAULT_PLACE.lng}&radiusKm=40&pastDays=3`
    )
      .then((result) => {
        if (id === requestId.current) setAnalysis(result);
      })
      .catch((cause: unknown) => {
        if (id === requestId.current) setError(cause instanceof Error ? cause.message : "Analysis failed.");
      })
      .finally(() => {
        if (id === requestId.current) setLoading(false);
      });
  }, []);

  const radiusLabel = `${Math.round(convertKm(radiusKm, unit))} ${unit}`;
  const updated = analysis ? new Date(analysis.generatedAt).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "";
  const modelTone = (analysis?.model.terrainLiftPct ?? 0) > 0 ? "teal" : "orange";
  const leadingFeatures = useMemo(() => analysis?.model.featureImportance.slice(0, 5) ?? [], [analysis]);

  return (
    <main className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-hairline bg-surface px-4 py-3">
        <div className="mx-auto flex max-w-[1800px] flex-wrap items-end justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-accent"><BrainCircuit size={14} /> Research workbench</div>
            <h1 className="mt-1 text-lg font-semibold">Terrain &amp; Smoke Lab</h1>
            <p className="mt-0.5 max-w-3xl text-xs text-ink-2">Test whether modeled PM2.5 differs between local lowlands and highlands, then measure whether terrain improves a held-out prediction.</p>
          </div>
          <div className="flex items-center gap-2 text-[10px] text-ink-3">
            <span className="inline-flex items-center gap-1"><Activity size={12} className={loading ? "animate-pulse text-warning" : "text-good"} />{loading ? "Analyzing sources" : updated ? `Updated ${updated} · ${analysis?.pastDays}-day window` : "Ready"}</span>
            <span>Exploratory · not personal exposure</span>
          </div>
        </div>
      </div>

      <div className="mx-auto grid w-full max-w-[1800px] flex-1 grid-cols-1 bg-surface xl:grid-cols-[300px_minmax(520px,1fr)_390px]">
        <aside className="border-b border-hairline bg-surface p-4 xl:border-r xl:border-b-0">
          <div className="panel-title">Study area</div>
          <div className="mt-2"><SearchBox placeholder="City, county, or place…" onPick={(picked) => { setPlace(picked); void run(picked, radiusKm, pastDays); }} /></div>
          <div className="mt-3 rounded-sm border border-hairline bg-surface-2 px-3 py-2.5">
            <div className="text-sm font-medium text-ink">{place.label}</div>
            <div className="tabular mt-0.5 text-[10px] text-ink-3">{place.lat.toFixed(4)}, {place.lng.toFixed(4)}</div>
          </div>

          <fieldset className="mt-5">
            <legend className="panel-title">Analysis radius</legend>
            <div className="mt-2 grid grid-cols-3 rounded-sm border border-hairline bg-surface-2 p-0.5">
              {[20, 40, 60].map((value) => (
                <button key={value} type="button" onClick={() => selectRadius(value)} className={`h-8 rounded-sm text-xs font-medium ${radiusKm === value ? "bg-surface text-accent shadow-sm" : "text-ink-2"}`}>{Math.round(convertKm(value, unit))}</button>
              ))}
            </div>
            <div className="mt-1 flex justify-between text-[10px] text-ink-3"><span>Local</span><span>{radiusLabel}</span><span>Regional</span></div>
          </fieldset>

          <fieldset className="mt-5">
            <legend className="panel-title">Evidence window</legend>
            <div className="mt-2 grid grid-cols-3 rounded-sm border border-hairline bg-surface-2 p-0.5">
              {[3, 5, 7].map((value) => (
                <button key={value} type="button" onClick={() => selectEvidenceWindow(value)} className={`h-8 rounded-sm text-xs font-medium ${pastDays === value ? "bg-surface text-accent shadow-sm" : "text-ink-2"}`}>{value} days</button>
              ))}
            </div>
          </fieldset>

          <fieldset className="mt-5">
            <legend className="panel-title">Distance units</legend>
            <div className="mt-2 grid grid-cols-2 rounded-sm border border-hairline bg-surface-2 p-0.5">
              {(["km", "mi"] as const).map((value) => <button key={value} type="button" onClick={() => setUnit(value)} className={`h-8 rounded-sm text-xs font-medium ${unit === value ? "bg-surface text-accent shadow-sm" : "text-ink-2"}`}>{value === "km" ? "Kilometers" : "Miles"}</button>)}
            </div>
          </fieldset>

          <button type="button" onClick={() => void run()} disabled={loading} className="mt-5 flex h-10 w-full items-center justify-center gap-2 rounded-sm bg-accent px-4 text-sm font-semibold text-white shadow-sm disabled:opacity-60">
            <Play size={15} fill="currentColor" />{loading ? "Running analysis…" : "Run terrain test"}
          </button>
          {error && <p className="mt-3 rounded-sm border border-critical/25 bg-critical/10 px-3 py-2 text-xs leading-relaxed text-critical">{error}</p>}

          <div className="mt-6 border-t border-hairline pt-4">
            <div className="panel-title">Map evidence</div>
            <div className="mt-2 grid gap-2">
              <Toggle active={visible.terrain} label="Terrain thirds" icon={<Mountain size={14} />} onClick={() => setVisible((state) => ({ ...state, terrain: !state.terrain }))} />
              <Toggle active={visible.pm25} label="Modeled PM2.5" icon={<Wind size={14} />} onClick={() => setVisible((state) => ({ ...state, pm25: !state.pm25 }))} />
              <Toggle active={visible.smoke} label="NOAA smoke" icon={<Satellite size={14} />} onClick={() => setVisible((state) => ({ ...state, smoke: !state.smoke }))} />
            </div>
          </div>

          <div className="mt-5 border-t border-hairline pt-4 text-[10px] leading-relaxed text-ink-3">
            <p><strong className="text-ink-2">Terrain:</strong> local thirds from 29 DEM samples.</p>
            <p className="mt-1"><strong className="text-ink-2">Smoke:</strong> analyst-drawn satellite plume, not ground concentration.</p>
            <p className="mt-1"><strong className="text-ink-2">PM2.5:</strong> CAMS model estimate, not monitor truth.</p>
          </div>
        </aside>

        <section className="relative min-h-[560px] border-b border-hairline xl:border-r xl:border-b-0">
          <TerrainStudyMap analysis={analysis} visible={visible} />
          <div className="pointer-events-none absolute top-3 left-3 flex flex-wrap gap-1.5">
            <span className="rounded-sm border border-hairline bg-surface/95 px-2 py-1 text-[10px] font-medium shadow-sm"><span className="mr-1 inline-block h-2 w-2 bg-[#1f9d8a]" />Lowland</span>
            <span className="rounded-sm border border-hairline bg-surface/95 px-2 py-1 text-[10px] font-medium shadow-sm"><span className="mr-1 inline-block h-2 w-2 bg-[#d7a62d]" />Transition</span>
            <span className="rounded-sm border border-hairline bg-surface/95 px-2 py-1 text-[10px] font-medium shadow-sm"><span className="mr-1 inline-block h-2 w-2 bg-[#d9654b]" />Highland</span>
          </div>
        </section>

        <aside className="bg-surface xl:max-h-[calc(100dvh-111px)] xl:overflow-y-auto">
          {!analysis ? (
            <div className="grid min-h-[420px] place-items-center px-8 text-center text-sm text-ink-3">{loading ? "Building the terrain evidence cube…" : "Choose a location to begin."}</div>
          ) : (
            <div>
              <div className="border-b border-hairline px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div><div className="panel-title">Terrain diagnosis</div><div className="mt-1 text-base font-semibold capitalize">{analysis.terrain.landscapeClass}</div></div>
                  <div className="rounded-sm bg-surface-2 px-2 py-1 text-right text-[10px] text-ink-3"><span className="tabular block text-sm font-semibold text-ink">{analysis.terrain.reliefM.toFixed(0)} m</span>local relief</div>
                </div>
              </div>

              <div className="grid grid-cols-2 border-b border-hairline">
                <Metric label="Current OED" value={fmt(analysis.current.oedPm25, 1)} note="µg/m³ lowland minus highland" tone="blue" />
                <Metric label="Elevation ρ" value={fmt(analysis.current.spearmanRho, 2)} note="Spearman correlation" tone={analysis.current.spearmanRho != null && analysis.current.spearmanRho < 0 ? "teal" : "orange"} />
              </div>
              <div className="grid grid-cols-2 border-b border-hairline">
                <Metric label="Lowland PM2.5" value={fmt(analysis.current.lowlandMedianPm25, 1)} note="median modeled µg/m³" tone="teal" />
                <Metric label="Highland PM2.5" value={fmt(analysis.current.highlandMedianPm25, 1)} note="median modeled µg/m³" tone="orange" />
              </div>

              <section className="border-b border-hairline px-4 py-4">
                <div className="flex items-center justify-between"><div className="panel-title">Orographic exposure differential</div><BarChart3 size={15} className="text-ink-3" /></div>
                <LineChart points={analysis.history.hourlyOed} />
                <div className="grid grid-cols-2 gap-3 border-t border-hairline pt-2 text-[10px] text-ink-3"><span><strong className="tabular text-ink">{fmt(analysis.history.medianOedPm25, 1)}</strong> median OED</span><span><strong className="tabular text-ink">{fmt(analysis.history.positiveHoursPct, 0, "%")}</strong> positive hours</span></div>
              </section>

              <section className="border-b border-hairline px-4 py-4">
                <div className="panel-title">Elevation × PM2.5 snapshot</div>
                <ScatterPlot analysis={analysis} />
                <div className="flex flex-wrap gap-3 text-[10px] text-ink-3"><span><i className="mr-1 inline-block h-2 w-2 bg-[#1f9d8a]" />lowland</span><span><i className="mr-1 inline-block h-2 w-2 bg-[#d7a62d]" />transition</span><span><i className="mr-1 inline-block h-2 w-2 bg-[#d9654b]" />highland</span></div>
              </section>

              <section className="border-b border-hairline px-4 py-4">
                <div className="flex items-center justify-between gap-3"><div><div className="panel-title">Held-out ML ablation</div><p className="mt-1 text-xs text-ink-2">Does terrain beat weather + time + smoke?</p></div><BrainCircuit size={18} className="text-accent" /></div>
                <div className="mt-3 grid grid-cols-3 border-y border-hairline">
                  <Metric label="Baseline" value={fmt(analysis.model.baselineRmse, 2)} note="RMSE" />
                  <Metric label="+ Terrain" value={fmt(analysis.model.terrainRmse, 2)} note="RMSE" />
                  <Metric label="Lift" value={fmt(analysis.model.terrainLiftPct, 1, "%")} note="lower RMSE is better" tone={modelTone} />
                </div>
                <p className="mt-3 text-xs leading-relaxed text-ink-2">{analysis.model.interpretation}</p>
                {leadingFeatures.length > 0 && <div className="mt-3 space-y-1.5">{leadingFeatures.map((feature) => <div key={feature.feature} className="grid grid-cols-[112px_1fr_28px] items-center gap-2 text-[10px]"><span className="truncate text-ink-2">{feature.feature}</span><span className="h-1.5 bg-surface-2"><span className="block h-full bg-accent" style={{ width: `${feature.importance}%` }} /></span><span className="tabular text-right text-ink-3">{feature.importance}%</span></div>)}</div>}
                <p className="mt-3 text-[10px] text-ink-3">Final {analysis.model.heldOutHours} UTC hours held out · {analysis.model.trainObservations} train rows · {analysis.model.testObservations} test rows</p>
              </section>

              <section className="border-b border-hairline px-4 py-4">
                <div className="flex items-center justify-between"><div className="panel-title">Satellite smoke context</div><Satellite size={15} className="text-warning" /></div>
                <div className="mt-2 flex items-baseline justify-between gap-3"><span className="text-base font-semibold capitalize">{analysis.smoke.latestDensity}</span><span className="text-[10px] text-ink-3">NOAA HMS {analysis.smoke.latestAnalysisDate ?? "unavailable"}</span></div>
                <p className="mt-1 text-xs text-ink-2">Overhead smoke crossed the study grid on {analysis.smoke.daysWithOverheadSmoke} of {analysis.smoke.analyzedDates.length} available analysis days.</p>
              </section>

              <section className="px-4 py-4">
                <div className="flex items-center justify-between"><div className="panel-title">Evidence ledger</div><Layers3 size={15} className="text-ink-3" /></div>
                <div className="mt-2 divide-y divide-hairline border-y border-hairline">{analysis.sources.map((source) => <a key={source.name} href={source.url ?? "#"} target="_blank" rel="noreferrer" className="flex items-start justify-between gap-3 py-2 text-xs hover:text-accent"><span><strong className="block font-medium">{source.name}</strong><span className="mt-0.5 block text-[10px] leading-snug text-ink-3">{source.notes}</span></span><span className="shrink-0 rounded-sm bg-surface-2 px-1.5 py-0.5 text-[9px] uppercase text-ink-3">{source.status}</span></a>)}</div>
                <details className="mt-3 text-xs text-ink-2"><summary className="cursor-pointer font-medium">Interpretation limits</summary><ul className="mt-2 list-disc space-y-1.5 pl-4 text-[10px] leading-relaxed text-ink-3">{analysis.limitations.map((item) => <li key={item}>{item}</li>)}</ul></details>
              </section>
            </div>
          )}
        </aside>
      </div>
    </main>
  );
}
