"use client";

import {
  CheckCircle2,
  ChevronRight,
  CircleDot,
  Download,
  ExternalLink,
  FlaskConical,
  Info,
  Layers3,
  Map as MapIcon,
  RefreshCw,
  Search,
  ShieldQuestion,
  TableProperties,
  Waves,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Map as MlMap } from "maplibre-gl";
import type {
  PfasCompound,
  PfasPilotSnapshot,
  PfasState,
  UcmrPfasSystem,
  WqpPfasSample,
} from "@/lib/pfas-types";

type View = "map" | "samples" | "ucmr" | "methods";
type DetectionFilter = "all" | "detected" | "non-detect";
type CompoundFilter = "core" | "all" | PfasCompound;

const STATES: Array<{ value: "all" | PfasState; label: string }> = [
  { value: "all", label: "All five states" },
  { value: "DE", label: "Delaware" },
  { value: "MD", label: "Maryland" },
  { value: "NJ", label: "New Jersey" },
  { value: "NY", label: "New York" },
  { value: "PA", label: "Pennsylvania" },
];

const STATE_BOUNDS: Record<PfasState, [[number, number], [number, number]]> = {
  DE: [[-75.79, 38.38], [-74.98, 39.84]],
  MD: [[-79.55, 37.86], [-74.93, 39.78]],
  NJ: [[-75.62, 38.88], [-73.86, 41.36]],
  NY: [[-79.77, 40.45], [-71.75, 45.1]],
  PA: [[-80.63, 39.68], [-74.69, 42.28]],
};

const TOPO_STYLE = {
  version: 8 as const,
  sources: {
    topo: {
      type: "raster" as const,
      tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}"],
      tileSize: 256,
      attribution: "Tiles © Esri — Source: Esri, USGS, NOAA",
    },
  },
  layers: [{ id: "topo", type: "raster" as const, source: "topo", paint: { "raster-opacity": 0.9 } }],
};

function matchesCompound(compound: PfasCompound, filter: CompoundFilter) {
  if (filter === "all") return true;
  if (filter === "core") return compound === "PFOA" || compound === "PFOS";
  return compound === filter;
}

function formatResult(sample: WqpPfasSample) {
  if (!sample.detected) return sample.limitNgL == null ? "Not detected" : `< ${sample.limitNgL.toLocaleString()} ng/L`;
  return `${sample.valueNgL?.toLocaleString(undefined, { maximumFractionDigits: 3 })} ng/L`;
}

function MiniStat({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="border-r border-hairline px-4 py-3 last:border-r-0">
      <p className="text-[10px] font-semibold uppercase text-ink-3">{label}</p>
      <p className="mt-0.5 text-xl font-semibold tabular text-ink">{value}</p>
      <p className="mt-0.5 truncate text-[11px] text-ink-3">{detail}</p>
    </div>
  );
}

function SourceBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-hairline bg-surface-2 px-2 py-0.5 text-[10px] font-medium text-ink-2">
      <CircleDot size={10} /> {children}
    </span>
  );
}

export default function PfasWaterAtlas() {
  const [snapshot, setSnapshot] = useState<PfasPilotSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [view, setView] = useState<View>("map");
  const [state, setState] = useState<"all" | PfasState>("all");
  const [compound, setCompound] = useState<CompoundFilter>("core");
  const [detection, setDetection] = useState<DetectionFilter>("all");
  const [year, setYear] = useState("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<WqpPfasSample | null>(null);
  const [tablePage, setTablePage] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/pfas/snapshot");
      const body = await response.json();
      if (!response.ok || !body.ok) throw new Error("PFAS snapshot could not be loaded");
      setSnapshot(body.data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "PFAS snapshot could not be loaded");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => void load(), [load]);

  const years = useMemo(
    () => [...new Set(snapshot?.wqpSamples.map((sample) => sample.year).filter(Boolean) ?? [])].sort((a, b) => Number(b) - Number(a)),
    [snapshot]
  );

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (snapshot?.wqpSamples ?? []).filter((sample) => {
      if (state !== "all" && sample.state !== state) return false;
      if (!matchesCompound(sample.compound, compound)) return false;
      if (detection === "detected" && !sample.detected) return false;
      if (detection === "non-detect" && sample.detected) return false;
      if (year !== "all" && sample.year !== Number(year)) return false;
      if (query && !`${sample.locationName} ${sample.provider} ${sample.monitoringLocationId}`.toLowerCase().includes(query)) return false;
      return true;
    });
  }, [snapshot, state, compound, detection, year, search]);

  const ucmrFiltered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (snapshot?.ucmrSystems ?? []).filter((system) => {
      if (state !== "all" && system.state !== state) return false;
      if (!matchesCompound(system.compound, compound)) return false;
      if (detection === "detected" && system.detectionCount === 0) return false;
      if (detection === "non-detect" && system.detectionCount > 0) return false;
      return !query || `${system.pwsName} ${system.pwsid} ${system.zip}`.toLowerCase().includes(query);
    });
  }, [snapshot, state, compound, detection, search]);

  useEffect(() => {
    setTablePage(0);
  }, [state, compound, detection, year, search, view]);

  const detectedCount = filtered.filter((sample) => sample.detected).length;
  const nonDetectCount = filtered.length - detectedCount;
  const locations = new Set(filtered.map((sample) => sample.monitoringLocationId || `${sample.lat},${sample.lng}`)).size;

  const exportUrl = useMemo(() => {
    const params = new URLSearchParams({ state, compound, detection, year });
    if (search.trim()) params.set("q", search.trim());
    return `/api/pfas/export?${params.toString()}`;
  }, [state, compound, detection, year, search]);

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-paper">
      <div className="border-b border-[#cadfdc] bg-[#edf7f5] px-4 py-2.5">
        <div className="mx-auto flex max-w-[1600px] items-start gap-3 text-xs text-[#254a47]">
          <Info size={16} className="mt-0.5 shrink-0" />
          <p className="leading-relaxed">
            <strong>Research pilot.</strong> This view shows where PFAS was sampled and reported, not whether a home&apos;s water is safe. Non-detection means none was reported above that test&apos;s threshold, not zero PFAS. UCMR locations are presented as water-system records, never as exact homes.
          </p>
        </div>
      </div>

      <div className="border-b border-hairline bg-surface px-4">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-4 py-3">
          <div>
            <div className="flex items-center gap-2">
              <Waves size={20} className="text-[#007f86]" />
              <h1 className="text-lg font-semibold text-ink">Water &amp; PFAS Intelligence</h1>
              <SourceBadge>official public data</SourceBadge>
            </div>
            <p className="mt-0.5 text-xs text-ink-3">Five-state measurement explorer · DE, MD, NJ, NY, PA</p>
          </div>
          <a href={exportUrl} download className={`inline-flex h-9 items-center gap-2 rounded-sm border border-hairline bg-surface px-3 text-xs font-medium text-ink shadow-sm ${!filtered.length ? "pointer-events-none opacity-40" : ""}`}>
            <Download size={15} /> Download filtered CSV
          </a>
        </div>
        <div className="mx-auto flex max-w-[1600px] gap-6 overflow-x-auto" role="tablist" aria-label="Water data views">
          {([
            ["map", MapIcon, "Measurement map"],
            ["samples", TableProperties, "Sample records"],
            ["ucmr", FlaskConical, "UCMR drinking water"],
            ["methods", ShieldQuestion, "Methods & uncertainty"],
          ] as const).map(([id, Icon, label]) => (
            <button key={id} onClick={() => setView(id)} role="tab" aria-selected={view === id} className={`flex h-10 items-center gap-2 border-b-2 px-1 text-xs font-medium ${view === id ? "border-[#007f86] text-[#006a70]" : "border-transparent text-ink-3 hover:text-ink"}`}>
              <Icon size={15} /> {label}
            </button>
          ))}
        </div>
      </div>

      <div className="mx-auto grid w-full max-w-[1600px] grid-cols-2 border-b border-hairline bg-surface md:grid-cols-4">
        <MiniStat label="Displayed records" value={loading ? "—" : filtered.length.toLocaleString()} detail={`${locations.toLocaleString()} reported locations`} />
        <MiniStat label="Reported detections" value={loading ? "—" : detectedCount.toLocaleString()} detail="sample results, not exposure" />
        <MiniStat label="Reported non-detects" value={loading ? "—" : nonDetectCount.toLocaleString()} detail="threshold varies by test" />
        <MiniStat label="UCMR systems" value={loading ? "—" : new Set(ucmrFiltered.map((row) => row.pwsid)).size.toLocaleString()} detail="PFOA / PFOS system records" />
      </div>

      <div className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col lg:min-h-[680px] lg:flex-row">
        <aside className="w-full shrink-0 border-b border-hairline bg-surface p-4 lg:w-64 lg:border-b-0 lg:border-r">
          <div className="flex items-center justify-between">
            <h2 className="panel-title">Explore measurements</h2>
            <button onClick={() => { setState("all"); setCompound("core"); setDetection("all"); setYear("all"); setSearch(""); }} className="text-[11px] font-medium text-[#006a70]">Reset</button>
          </div>
          <label className="mt-4 block text-[11px] font-medium text-ink-2">Search location or provider</label>
          <div className="relative mt-1">
            <Search size={14} className="absolute left-2.5 top-2.5 text-ink-3" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="e.g. Delaware River" className="h-9 w-full rounded-sm border border-hairline bg-surface pl-8 pr-2 text-xs" />
          </div>
          <FilterSelect label="State" value={state} onChange={(value) => setState(value as "all" | PfasState)} options={STATES} />
          <FilterSelect label="PFAS compound" value={compound} onChange={(value) => setCompound(value as CompoundFilter)} options={[
            { value: "core", label: "PFOA + PFOS (default)" }, { value: "all", label: "All four downloaded" },
            { value: "PFOA", label: "PFOA" }, { value: "PFOS", label: "PFOS" }, { value: "PFHxS", label: "PFHxS" }, { value: "PFNA", label: "PFNA" },
          ]} />
          <FilterSelect label="Result" value={detection} onChange={(value) => setDetection(value as DetectionFilter)} options={[
            { value: "all", label: "Detections + non-detects" }, { value: "detected", label: "Reported detections" }, { value: "non-detect", label: "Reported non-detects" },
          ]} />
          <FilterSelect label="Sample year" value={year} onChange={setYear} options={[{ value: "all", label: "All years" }, ...years.map((value) => ({ value: String(value), label: String(value) }))]} />

          <div className="mt-5 border-t border-hairline pt-4">
            <p className="panel-title">Map key</p>
            <div className="mt-3 space-y-3 text-xs text-ink-2">
              <div className="flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-[#007f86] shadow-[0_0_0_2px_white,0_0_0_3px_#006a70]" /> Reported detection</div>
              <div className="flex items-center gap-2"><span className="h-3 w-3 rounded-full border-2 border-[#335d7e] bg-white" /> Reported non-detect</div>
              <p className="leading-relaxed text-ink-3">Symbol color identifies result status only. It does not communicate safety or regulatory compliance.</p>
            </div>
          </div>
        </aside>

        <main className="min-w-0 flex-1 bg-[#e9efed]">
          {error ? (
            <div className="grid h-full min-h-[520px] place-items-center p-6"><div className="max-w-sm text-center"><p className="font-medium">Water data did not load</p><p className="mt-1 text-xs text-ink-3">{error}</p><button onClick={load} className="mt-4 inline-flex items-center gap-2 rounded-sm bg-ink px-3 py-2 text-xs font-medium text-white"><RefreshCw size={14} /> Try again</button></div></div>
          ) : view === "map" ? (
            <WaterMap samples={filtered} state={state} selected={selected} onSelect={setSelected} loading={loading} />
          ) : view === "samples" ? (
            <SampleTable samples={filtered} page={tablePage} setPage={setTablePage} onSelect={(sample) => { setSelected(sample); setView("map"); }} />
          ) : view === "ucmr" ? (
            <UcmrView snapshot={snapshot} systems={ucmrFiltered} state={state} page={tablePage} setPage={setTablePage} />
          ) : (
            <MethodsView generatedAt={snapshot?.generatedAt} />
          )}
        </main>

        {view === "map" && <Inspector sample={selected} onClose={() => setSelected(null)} />}
      </div>
    </div>
  );
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }> }) {
  return <label className="mt-3 block text-[11px] font-medium text-ink-2">{label}<select value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 h-9 w-full rounded-sm border border-hairline bg-surface px-2 text-xs text-ink">{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>;
}

function WaterMap({ samples, state, selected, onSelect, loading }: { samples: WqpPfasSample[]; state: "all" | PfasState; selected: WqpPfasSample | null; onSelect: (sample: WqpPfasSample) => void; loading: boolean }) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const sampleRef = useRef(new Map<string, WqpPfasSample>());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!container.current || mapRef.current) return;
      const maplibregl = (await import("maplibre-gl")).default;
      if (cancelled || !container.current) return;
      const map = new maplibregl.Map({ container: container.current, style: TOPO_STYLE, center: [-75.25, 40.55], zoom: 5.7, attributionControl: { compact: true } });
      mapRef.current = map;
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
      map.addControl(new maplibregl.ScaleControl({ unit: "imperial" }), "bottom-left");
      map.on("load", () => {
        map.addSource("pfas-samples", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        map.addLayer({ id: "pfas-nondetect", type: "circle", source: "pfas-samples", filter: ["==", ["get", "detected"], false], paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 5, 3, 10, 6], "circle-color": "#ffffff", "circle-stroke-color": "#335d7e", "circle-stroke-width": 1.5, "circle-opacity": 0.92 } });
        map.addLayer({ id: "pfas-detected", type: "circle", source: "pfas-samples", filter: ["==", ["get", "detected"], true], paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 5, 4, 10, 7], "circle-color": "#007f86", "circle-stroke-color": "#ffffff", "circle-stroke-width": 1.5, "circle-opacity": 0.88 } });
        map.addLayer({ id: "pfas-selected", type: "circle", source: "pfas-samples", filter: ["==", ["get", "id"], ""], paint: { "circle-radius": 11, "circle-color": "rgba(0,0,0,0)", "circle-stroke-color": "#111827", "circle-stroke-width": 2.5 } });
        const click = (event: maplibregl.MapMouseEvent) => {
          const feature = map.queryRenderedFeatures(event.point, { layers: ["pfas-detected", "pfas-nondetect"] })[0];
          const id = String(feature?.properties?.id ?? "");
          const sample = sampleRef.current.get(id);
          if (sample) onSelect(sample);
        };
        map.on("click", click);
        map.on("mouseenter", "pfas-detected", () => { map.getCanvas().style.cursor = "pointer"; });
        map.on("mouseenter", "pfas-nondetect", () => { map.getCanvas().style.cursor = "pointer"; });
        map.on("mouseleave", "pfas-detected", () => { map.getCanvas().style.cursor = ""; });
        map.on("mouseleave", "pfas-nondetect", () => { map.getCanvas().style.cursor = ""; });
        setReady(true);
      });
    })();
    return () => { cancelled = true; mapRef.current?.remove(); mapRef.current = null; };
  }, [onSelect]);

  useEffect(() => {
    if (!ready || !mapRef.current) return;
    sampleRef.current = new Map(samples.map((sample) => [sample.id, sample]));
    const data: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: samples.map((sample) => ({ type: "Feature", geometry: { type: "Point", coordinates: [sample.lng, sample.lat] }, properties: { id: sample.id, detected: sample.detected, compound: sample.compound } })) };
    (mapRef.current.getSource("pfas-samples") as maplibregl.GeoJSONSource).setData(data);
  }, [samples, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    map.setFilter("pfas-selected", ["==", ["get", "id"], selected?.id ?? ""]);
    if (selected) map.easeTo({ center: [selected.lng, selected.lat], zoom: Math.max(map.getZoom(), 9), duration: 700 });
  }, [selected, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    if (state === "all") map.fitBounds([[-80.8, 37.7], [-71.5, 45.2]], { padding: 32, duration: 700 });
    else map.fitBounds(STATE_BOUNDS[state], { padding: 32, duration: 700 });
  }, [state, ready]);

  return <div className="relative h-[560px] lg:h-full lg:min-h-[680px]"><div ref={container} className="absolute inset-0" />{(loading || !ready) && <div className="absolute inset-0 grid place-items-center bg-surface/75 backdrop-blur-sm"><div className="flex items-center gap-2 text-xs font-medium text-ink-2"><RefreshCw size={15} className="animate-spin" /> Loading official sample records</div></div>}<div className="pointer-events-none absolute bottom-8 left-3 rounded-sm border border-hairline bg-surface/95 px-2.5 py-2 text-[10px] text-ink-2 shadow-md"><strong className="block text-ink">WQP reported coordinates</strong>Point is a monitoring location, not a home.</div></div>;
}

function Inspector({ sample, onClose }: { sample: WqpPfasSample | null; onClose: () => void }) {
  return <aside className="w-full shrink-0 border-t border-hairline bg-surface p-4 lg:w-80 lg:border-l lg:border-t-0"><div className="flex items-center justify-between"><h2 className="panel-title">Measurement inspector</h2>{sample && <button onClick={onClose} className="text-[11px] font-medium text-ink-3">Clear</button>}</div>{!sample ? <div className="mt-10 text-center"><Layers3 size={30} className="mx-auto text-baseline" /><p className="mt-3 text-sm font-medium text-ink">Select a map point</p><p className="mt-1 text-xs leading-relaxed text-ink-3">Open a reported sample result, its date, test threshold, provider, and location precision.</p></div> : <div className="mt-4 space-y-4"><div><div className="flex items-center justify-between gap-2"><span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${sample.detected ? "bg-[#d9eeec] text-[#006a70]" : "border border-[#b9c9d6] bg-white text-[#335d7e]"}`}>{sample.detected ? "Reported detection" : "Reported non-detect"}</span><SourceBadge>WQP</SourceBadge></div><p className="mt-3 text-2xl font-semibold tabular">{formatResult(sample)}</p><p className="mt-1 text-xs text-ink-3">{sample.compound} · {sample.chemicalName}</p></div><dl className="space-y-3 border-y border-hairline py-4 text-xs"><InspectorRow label="Sample date" value={sample.date || "Not reported"} /><InspectorRow label="Water medium" value={sample.medium} /><InspectorRow label="Monitoring location" value={sample.locationName} /><InspectorRow label="Provider" value={sample.provider} /><InspectorRow label="Reporting limit" value={sample.limitNgL == null ? "Not reported" : `${sample.limitNgL} ng/L`} /><InspectorRow label="Method" value={sample.method || "Not reported"} /><InspectorRow label="Location precision" value={sample.coordinatePrecision} /></dl><div className="rounded-sm border border-[#cadfdc] bg-[#edf7f5] p-3 text-xs leading-relaxed text-[#315a57]"><strong>How to read this:</strong> The result describes this sample on this date. It does not establish current tap-water quality or personal exposure. A non-detect is limited by the laboratory reporting threshold.</div><a href={sample.sourceUrl} target="_blank" rel="noreferrer" className="flex items-center justify-between rounded-sm border border-hairline px-3 py-2.5 text-xs font-medium text-ink hover:border-baseline">Open official source <ExternalLink size={14} /></a></div>}</aside>;
}

function InspectorRow({ label, value }: { label: string; value: string }) { return <div><dt className="text-[10px] font-semibold uppercase text-ink-3">{label}</dt><dd className="mt-0.5 leading-relaxed text-ink">{value}</dd></div>; }

function SampleTable({ samples, page, setPage, onSelect }: { samples: WqpPfasSample[]; page: number; setPage: (page: number) => void; onSelect: (sample: WqpPfasSample) => void }) {
  const pageSize = 30;
  const rows = samples.slice(page * pageSize, (page + 1) * pageSize);
  const pages = Math.max(1, Math.ceil(samples.length / pageSize));
  return <DataTableShell title="Water Quality Portal records" detail={`${samples.length.toLocaleString()} validated display records`} page={page} pages={pages} setPage={setPage}><table className="w-full min-w-[860px] text-left text-xs"><thead className="sticky top-0 bg-surface-2 text-[10px] uppercase text-ink-3"><tr>{["Result", "Compound", "State", "Sample date", "Location", "Medium", "Provider", ""].map((header) => <th key={header} className="px-3 py-2.5 font-semibold">{header}</th>)}</tr></thead><tbody>{rows.map((sample) => <tr key={sample.id} className="border-t border-hairline bg-surface hover:bg-[#f2f8f7]"><td className="px-3 py-2.5 font-medium tabular">{formatResult(sample)}</td><td className="px-3 py-2.5">{sample.compound}</td><td className="px-3 py-2.5">{sample.state}</td><td className="px-3 py-2.5 tabular">{sample.date}</td><td className="max-w-52 truncate px-3 py-2.5" title={sample.locationName}>{sample.locationName}</td><td className="max-w-40 truncate px-3 py-2.5" title={sample.medium}>{sample.medium}</td><td className="max-w-52 truncate px-3 py-2.5" title={sample.provider}>{sample.provider}</td><td className="px-3 py-2.5"><button onClick={() => onSelect(sample)} title="Show on map" className="grid h-7 w-7 place-items-center rounded-sm border border-hairline"><ChevronRight size={14} /></button></td></tr>)}</tbody></table></DataTableShell>;
}

function UcmrView({ snapshot, systems, state, page, setPage }: { snapshot: PfasPilotSnapshot | null; systems: UcmrPfasSystem[]; state: "all" | PfasState; page: number; setPage: (page: number) => void }) {
  const pageSize = 30;
  const rows = systems.slice(page * pageSize, (page + 1) * pageSize);
  const pages = Math.max(1, Math.ceil(systems.length / pageSize));
  return <div className="h-full overflow-auto p-4"><div className="grid gap-3 sm:grid-cols-5">{snapshot?.ucmrStateSummary.filter((summary) => state === "all" || summary.state === state).map((summary) => <div key={summary.state} className="panel rounded-sm p-3"><div className="flex items-center justify-between"><span className="text-sm font-semibold">{summary.state}</span><CheckCircle2 size={14} className="text-[#007f86]" /></div><p className="mt-3 text-xl font-semibold tabular">{summary.systems.toLocaleString()}</p><p className="text-[10px] text-ink-3">public water systems</p><p className="mt-2 text-xs tabular text-ink-2">{summary.detections.toLocaleString()} detections / {summary.samples.toLocaleString()} results</p></div>)}</div><div className="mt-4 rounded-sm border border-[#d8d5c6] bg-[#fffdf3] p-3 text-xs leading-relaxed text-[#5d5638]"><strong>Location discipline:</strong> UCMR 5 records identify public water systems and sampling points but the public occurrence file does not supply defensible exact map coordinates. These results stay in a system table instead of being pinned to homes or arbitrary centroids.</div><div className="mt-4"><DataTableShell title="EPA UCMR 5 drinking-water system records" detail={`${systems.length.toLocaleString()} system / compound summaries`} page={page} pages={pages} setPage={setPage}><table className="w-full min-w-[840px] text-left text-xs"><thead className="bg-surface-2 text-[10px] uppercase text-ink-3"><tr>{["System", "State", "ZIP context", "PFAS", "Reported detections", "Highest reported", "Latest sample", "Source"].map((header) => <th key={header} className="px-3 py-2.5 font-semibold">{header}</th>)}</tr></thead><tbody>{rows.map((system) => <tr key={system.id} className="border-t border-hairline bg-surface"><td className="px-3 py-2.5"><p className="font-medium">{system.pwsName}</p><p className="text-[10px] text-ink-3">PWSID {system.pwsid}</p></td><td className="px-3 py-2.5">{system.state}</td><td className="px-3 py-2.5">{system.zip || "—"}</td><td className="px-3 py-2.5 font-medium">{system.compound}</td><td className="px-3 py-2.5 tabular">{system.detectionCount} / {system.sampleCount}</td><td className="px-3 py-2.5 tabular">{system.maxNgL == null ? `None ≥ ${system.mrlNgL ?? "reported"} ng/L` : `${system.maxNgL.toLocaleString()} ng/L`}</td><td className="px-3 py-2.5 tabular">{system.latestDate}</td><td className="px-3 py-2.5"><a href={system.sourceUrl} target="_blank" rel="noreferrer" className="text-[#006a70]">EPA <ExternalLink size={11} className="inline" /></a></td></tr>)}</tbody></table></DataTableShell></div></div>;
}

function DataTableShell({ title, detail, page, pages, setPage, children }: { title: string; detail: string; page: number; pages: number; setPage: (page: number) => void; children: React.ReactNode }) {
  return <div className="flex h-full min-h-[620px] flex-col bg-surface"><div className="flex items-center justify-between border-b border-hairline px-4 py-3"><div><h2 className="text-sm font-semibold">{title}</h2><p className="text-[11px] text-ink-3">{detail}</p></div><div className="flex items-center gap-2 text-xs"><button disabled={page === 0} onClick={() => setPage(page - 1)} className="rounded-sm border border-hairline px-2 py-1 disabled:opacity-30">Previous</button><span className="tabular text-ink-3">{page + 1} / {pages}</span><button disabled={page + 1 >= pages} onClick={() => setPage(page + 1)} className="rounded-sm border border-hairline px-2 py-1 disabled:opacity-30">Next</button></div></div><div className="min-h-0 flex-1 overflow-auto">{children}</div></div>;
}

function MethodsView({ generatedAt }: { generatedAt?: string }) {
  return <div className="mx-auto max-w-4xl space-y-4 p-5"><section className="panel rounded-sm p-5"><h2 className="text-base font-semibold">What this pilot can and cannot say</h2><div className="mt-4 grid gap-4 sm:grid-cols-2"><MethodCard title="Measured occurrence" text="WQP points represent reported water samples at submitted monitoring coordinates. UCMR records represent standardized public-water-system monitoring." /><MethodCard title="Not personal exposure" text="Neither source establishes what is currently in an individual household tap or whether a person was exposed." /><MethodCard title="Non-detects remain visible" text="A non-detect means the analyte was not reported above that test's detection or quantitation threshold. It is never converted to zero." /><MethodCard title="No safety score" text="The interface does not rank counties, calculate exposure, infer causation, or combine potential-source records with measurements." /></div></section><section className="panel rounded-sm p-5"><h2 className="text-base font-semibold">Source trail</h2><div className="mt-4 space-y-3 text-xs text-ink-2"><SourceLine name="EPA UCMR 5" detail="January 2026 occurrence-data release; PFOA and PFOS summaries for DE, MD, NJ, NY, PA." url="https://www.epa.gov/dwucmr/occurrence-data-unregulated-contaminant-monitoring-rule" /><SourceLine name="Water Quality Portal" detail="Water-media exports for PFOA, PFOS, PFHxS, and PFNA. Quality-control and blank records are excluded from public display." url="https://www.waterqualitydata.us/" /><p className="border-t border-hairline pt-3 text-ink-3">App snapshot generated {generatedAt ? new Date(generatedAt).toLocaleString() : "—"}. Raw files remain unchanged in the repository.</p></div></section></div>;
}

function MethodCard({ title, text }: { title: string; text: string }) { return <div className="rounded-sm border border-hairline p-4"><p className="text-xs font-semibold text-ink">{title}</p><p className="mt-2 text-xs leading-relaxed text-ink-2">{text}</p></div>; }
function SourceLine({ name, detail, url }: { name: string; detail: string; url: string }) { return <a href={url} target="_blank" rel="noreferrer" className="flex items-center justify-between gap-4 rounded-sm border border-hairline p-3 hover:border-baseline"><span><strong className="block text-ink">{name}</strong><span className="mt-0.5 block leading-relaxed">{detail}</span></span><ExternalLink size={15} className="shrink-0" /></a>; }
