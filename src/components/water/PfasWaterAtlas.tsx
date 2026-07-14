"use client";

import {
  Activity,
  ChartNoAxesCombined,
  ChartPie,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  Cloud,
  Download,
  ExternalLink,
  FlaskConical,
  Footprints,
  Info,
  LayoutDashboard,
  Layers3,
  LocateFixed,
  Map as MapIcon,
  Mountain,
  MoveHorizontal,
  Navigation,
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
  UsgsWaterSnapshot,
  UsgsWaterStation,
  WqpPfasSample,
} from "@/lib/pfas-types";
import SearchBox, { type PickedPlace } from "@/components/ui/SearchBox";
import { distanceKm } from "@/lib/distance";

type View = "map" | "snapshot" | "live" | "pathways" | "timeline" | "samples" | "ucmr" | "methods";
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

const MAX_RADIUS_KM = 250;
const QUICK_RADIUS_OPTIONS = [5, 10, 25, 50] as const;

interface NearbyReading {
  sample: WqpPfasSample;
  distanceKm: number;
}

function formatDistance(km: number) {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${Number.isInteger(km) ? km.toFixed(0) : km.toFixed(1)} km`;
}

function radiusForDistance(distance: number) {
  return Math.min(MAX_RADIUS_KM, Math.ceil((distance + 0.1) * 4) / 4);
}

function radiusPolygon(place: PickedPlace, radiusKm: number): GeoJSON.Feature<GeoJSON.Polygon> {
  const points: [number, number][] = [];
  const latRadians = (place.lat * Math.PI) / 180;
  for (let index = 0; index <= 64; index += 1) {
    const angle = (index / 64) * Math.PI * 2;
    const lat = place.lat + (radiusKm / 110.574) * Math.sin(angle);
    const lng = place.lng + (radiusKm / (111.32 * Math.cos(latRadians))) * Math.cos(angle);
    points.push([lng, lat]);
  }
  return {
    type: "Feature",
    properties: { radiusKm },
    geometry: { type: "Polygon", coordinates: [points] },
  };
}

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
  const [searchPlace, setSearchPlace] = useState<PickedPlace | null>(null);
  const [radiusKm, setRadiusKm] = useState<number>(5);
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

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const years = useMemo(
    () => [...new Set(snapshot?.wqpSamples.map((sample) => sample.year).filter(Boolean) ?? [])].sort((a, b) => Number(b) - Number(a)),
    [snapshot]
  );

  const candidateSamples = useMemo(() => {
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

  const filtered = useMemo(
    () =>
      searchPlace
        ? candidateSamples.filter(
            (sample) =>
              distanceKm(searchPlace.lat, searchPlace.lng, sample.lat, sample.lng) <= radiusKm
          )
        : candidateSamples,
    [candidateSamples, searchPlace, radiusKm]
  );

  const nearestReadings = useMemo<NearbyReading[]>(() => {
    if (!searchPlace) return [];
    return candidateSamples
      .map((sample) => ({
        sample,
        distanceKm: distanceKm(searchPlace.lat, searchPlace.lng, sample.lat, sample.lng),
      }))
      .sort((left, right) => left.distanceKm - right.distanceKm)
      .slice(0, 8);
  }, [candidateSamples, searchPlace]);
  const nearestSampleKm = nearestReadings[0]?.distanceKm ?? null;
  const radiusSliderMax = Math.min(
    MAX_RADIUS_KM,
    Math.max(50, radiusKm, Math.ceil((nearestSampleKm ?? 50) / 25) * 25)
  );

  const includeNearest = useCallback(() => {
    if (nearestSampleKm == null || nearestSampleKm > MAX_RADIUS_KM) return;
    setRadiusKm(radiusForDistance(nearestSampleKm));
    setTablePage(0);
  }, [nearestSampleKm]);

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

  const detectedCount = filtered.filter((sample) => sample.detected).length;
  const nonDetectCount = filtered.length - detectedCount;
  const locations = new Set(filtered.map((sample) => sample.monitoringLocationId || `${sample.lat},${sample.lng}`)).size;
  const ucmrDetectionCount = ucmrFiltered.reduce((sum, row) => sum + row.detectionCount, 0);
  const ucmrNonDetectCount = ucmrFiltered.reduce(
    (sum, row) => sum + Math.max(0, row.sampleCount - row.detectionCount),
    0
  );
  const ucmrSystemCount = new Set(ucmrFiltered.map((row) => row.pwsid)).size;
  const showingUcmr = view === "ucmr";

  const exportUrl = useMemo(() => {
    const params = new URLSearchParams({ state, compound, detection, year });
    if (search.trim()) params.set("q", search.trim());
    if (searchPlace) {
      params.set("centerLat", String(searchPlace.lat));
      params.set("centerLng", String(searchPlace.lng));
      params.set("radiusKm", String(radiusKm));
    }
    return `/api/pfas/export?${params.toString()}`;
  }, [state, compound, detection, year, search, searchPlace, radiusKm]);

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
        <div className="mx-auto flex max-w-[1600px] flex-col items-stretch justify-between gap-3 py-3 sm:flex-row sm:items-center sm:gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Waves size={20} className="text-[#007f86]" />
              <h1 className="text-lg font-semibold text-ink">Water &amp; PFAS Intelligence</h1>
              <SourceBadge>official public data</SourceBadge>
            </div>
            <p className="mt-0.5 text-xs text-ink-3">Five-state measurement explorer · DE, MD, NJ, NY, PA</p>
          </div>
          {!showingUcmr && view !== "methods" && (
            <a href={exportUrl} download className={`inline-flex h-9 w-fit items-center gap-2 rounded-sm border border-hairline bg-surface px-3 text-xs font-medium text-ink shadow-sm ${!filtered.length ? "pointer-events-none opacity-40" : ""}`}>
              <Download size={15} /> Download WQP CSV
            </a>
          )}
        </div>
        <div className="mx-auto flex max-w-[1600px] gap-6 overflow-x-auto" role="tablist" aria-label="Water data views">
          {([
            ["map", MapIcon, "Measurement map"],
            ["snapshot", LayoutDashboard, "Water snapshot"],
            ["live", Activity, "Water now"],
            ["pathways", Footprints, "Exposure pathways"],
            ["timeline", ChartNoAxesCombined, "Sampling history"],
            ["samples", TableProperties, "Sample records"],
            ["ucmr", FlaskConical, "UCMR drinking water"],
            ["methods", ShieldQuestion, "Methods & uncertainty"],
          ] as const).map(([id, Icon, label]) => (
            <button key={id} onClick={() => { setView(id); setTablePage(0); }} role="tab" aria-selected={view === id} className={`flex h-10 shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-1 text-xs font-medium ${view === id ? "border-[#007f86] text-[#006a70]" : "border-transparent text-ink-3 hover:text-ink"}`}>
              <Icon size={15} /> {label}
            </button>
          ))}
        </div>
      </div>

      <div className="mx-auto grid w-full max-w-[1600px] grid-cols-2 border-b border-hairline bg-surface md:grid-cols-4" aria-live="polite">
        <MiniStat label={showingUcmr ? "UCMR summaries" : "Nearby WQP records"} value={loading ? "—" : (showingUcmr ? ucmrFiltered.length : filtered.length).toLocaleString()} detail={showingUcmr ? "system / compound rows" : searchPlace ? `within ${formatDistance(radiusKm)}` : `${locations.toLocaleString()} reported locations`} />
        <MiniStat label="Reported detections" value={loading ? "—" : (showingUcmr ? ucmrDetectionCount : detectedCount).toLocaleString()} detail="sample results, not exposure" />
        <MiniStat label="Reported non-detects" value={loading ? "—" : (showingUcmr ? ucmrNonDetectCount : nonDetectCount).toLocaleString()} detail="threshold varies by test" />
        <MiniStat label="UCMR systems" value={loading ? "—" : ucmrSystemCount.toLocaleString()} detail={showingUcmr ? "address radius not applied" : "separate system records"} />
      </div>

      <div className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col lg:min-h-[680px] lg:flex-row">
        <aside className={`w-full shrink-0 border-b border-hairline bg-surface p-4 lg:w-64 lg:border-b-0 lg:border-r ${view === "snapshot" || view === "live" || view === "pathways" ? "order-2 lg:order-none" : ""}`}>
          <div className="flex items-center justify-between">
            <h2 className="panel-title">Explore measurements</h2>
            <button onClick={() => { setState("all"); setCompound("core"); setDetection("all"); setYear("all"); setSearch(""); setSearchPlace(null); setRadiusKm(5); setTablePage(0); }} className="text-[11px] font-medium text-[#006a70]">Reset</button>
          </div>
          <div className="mt-4 rounded-md border border-hairline bg-surface-2 p-3">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-ink">
              <LocateFixed size={14} className="text-[#006a70]" /> Search around an address
            </div>
            {searchPlace ? (
              <div>
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 text-xs leading-snug text-ink-2">{searchPlace.label}</p>
                  <button type="button" onClick={() => { setSearchPlace(null); setTablePage(0); }} className="shrink-0 text-[11px] font-medium text-[#006a70]">Clear</button>
                </div>
                <div className="mt-3">
                  <div className="flex items-center justify-between gap-3 text-[11px] font-medium text-ink-2">
                    <label htmlFor="water-radius">Search radius</label>
                    <span className="tabular text-ink">{formatDistance(radiusKm)}</span>
                  </div>
                  <input
                    id="water-radius"
                    type="range"
                    min="0.25"
                    max={radiusSliderMax}
                    step="0.25"
                    value={radiusKm}
                    aria-valuetext={formatDistance(radiusKm)}
                    onChange={(event) => { setRadiusKm(Number(event.target.value)); setTablePage(0); }}
                    className="mt-2 h-6 w-full cursor-ew-resize accent-[#007f86]"
                  />
                  <div className="mt-1 flex gap-1.5 overflow-x-auto pb-1">
                    {QUICK_RADIUS_OPTIONS.map((value) => (
                      <button key={value} type="button" onClick={() => { setRadiusKm(value); setTablePage(0); }} className={`h-7 shrink-0 rounded-sm border px-2 text-[10px] font-medium ${radiusKm === value ? "border-[#007f86] bg-[#edf7f5] text-[#006a70]" : "border-hairline bg-surface text-ink-2"}`}>
                        {value} km
                      </button>
                    ))}
                  </div>
                </div>
                <p className="mt-2 text-[11px] leading-snug text-ink-3">
                  {filtered.length > 0 ? (
                    <>{filtered.length.toLocaleString()} matching WQP sample records are inside this radius.</>
                  ) : (
                    <>No matching WQP sample records are inside this radius. This is a sampling-data gap, not a zero result or a safety finding.{nearestSampleKm != null && ` The nearest matching record is about ${nearestSampleKm.toFixed(1)} km away.`}</>
                  )}{" "}Your address is geocoded for this search and is not added to the dataset.
                </p>
                {filtered.length === 0 && nearestSampleKm != null && nearestSampleKm <= MAX_RADIUS_KM && (
                  <button type="button" onClick={includeNearest} className="mt-3 inline-flex h-9 w-full items-center justify-center gap-2 rounded-sm bg-[#006a70] px-3 text-xs font-semibold text-white shadow-sm">
                    <Navigation size={14} /> Include nearest at {formatDistance(nearestSampleKm)}
                  </button>
                )}
              </div>
            ) : (
              <SearchBox placeholder="Home, school, ZIP, or city" onPick={(place) => { setSearchPlace(place); setTablePage(0); }} />
            )}
          </div>
          <label className="mt-4 block text-[11px] font-medium text-ink-2">Search location or provider</label>
          <div className="relative mt-1">
            <Search size={14} className="absolute left-2.5 top-2.5 text-ink-3" />
            <input value={search} onChange={(event) => { setSearch(event.target.value); setTablePage(0); }} placeholder="e.g. Delaware River" className="h-9 w-full rounded-sm border border-hairline bg-surface pl-8 pr-2 text-xs" />
          </div>
          <FilterSelect label="State" value={state} onChange={(value) => { setState(value as "all" | PfasState); setTablePage(0); }} options={STATES} />
          <FilterSelect label="PFAS compound" value={compound} onChange={(value) => { setCompound(value as CompoundFilter); setTablePage(0); }} options={[
            { value: "core", label: "PFOA + PFOS (default)" }, { value: "all", label: "All four downloaded" },
            { value: "PFOA", label: "PFOA" }, { value: "PFOS", label: "PFOS" }, { value: "PFHxS", label: "PFHxS" }, { value: "PFNA", label: "PFNA" },
          ]} />
          <FilterSelect label="Result" value={detection} onChange={(value) => { setDetection(value as DetectionFilter); setTablePage(0); }} options={[
            { value: "all", label: "Detections + non-detects" }, { value: "detected", label: "Reported detections" }, { value: "non-detect", label: "Reported non-detects" },
          ]} />
          <FilterSelect label="Sample year" value={year} onChange={(value) => { setYear(value); setTablePage(0); }} options={[{ value: "all", label: "All years" }, ...years.map((value) => ({ value: String(value), label: String(value) }))]} />

          {view === "map" && <div className="mt-5 border-t border-hairline pt-4">
            <p className="panel-title">Map key</p>
            <div className="mt-3 space-y-3 text-xs text-ink-2">
              <div className="flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-[#007f86] shadow-[0_0_0_2px_white,0_0_0_3px_#006a70]" /> Reported detection</div>
              <div className="flex items-center gap-2"><span className="h-3 w-3 rounded-full border-2 border-[#335d7e] bg-white" /> Reported non-detect</div>
              <p className="leading-relaxed text-ink-3">Symbol color identifies result status only. It does not communicate safety or regulatory compliance.</p>
            </div>
          </div>}
        </aside>

        <main className={`min-w-0 flex-1 bg-[#e9efed] ${view === "snapshot" || view === "live" || view === "pathways" ? "order-1 lg:order-none" : ""}`}>
          {error ? (
            <div className="grid h-full min-h-[520px] place-items-center p-6"><div className="max-w-sm text-center"><p className="font-medium">Water data did not load</p><p className="mt-1 text-xs text-ink-3">{error}</p><button onClick={load} className="mt-4 inline-flex items-center gap-2 rounded-sm bg-ink px-3 py-2 text-xs font-medium text-white"><RefreshCw size={14} /> Try again</button></div></div>
          ) : view === "map" ? (
            <div className="flex h-full flex-col">
              <WaterMap samples={filtered} state={state} selected={selected} onSelect={setSelected} loading={loading} searchPlace={searchPlace} radiusKm={radiusKm} nearestSampleKm={nearestSampleKm} onExpandToNearest={includeNearest} />
              {searchPlace && nearestReadings.length > 0 && (
                <NearestReadingsTray
                  readings={nearestReadings}
                  radiusKm={radiusKm}
                  onOpen={({ sample, distanceKm: sampleDistance }) => {
                    if (sampleDistance > radiusKm) setRadiusKm(radiusForDistance(sampleDistance));
                    setSelected(sample);
                  }}
                />
              )}
            </div>
          ) : view === "snapshot" ? (
            <WaterSnapshot
              samples={filtered}
              candidates={candidateSamples}
              place={searchPlace}
              radiusKm={radiusKm}
              nearestReadings={nearestReadings}
              onViewChange={(nextView) => { setView(nextView); setTablePage(0); }}
            />
          ) : view === "live" ? (
            <LiveWaterView key={searchPlace ? `${searchPlace.lat}:${searchPlace.lng}` : "no-place"} place={searchPlace} />
          ) : view === "pathways" ? (
            <ExposurePathwaysView onViewChange={(nextView) => { setView(nextView); setTablePage(0); }} />
          ) : view === "timeline" ? (
            <SamplingHistory samples={filtered} place={searchPlace} radiusKm={radiusKm} />
          ) : view === "samples" ? (
            <SampleTable samples={filtered} page={tablePage} setPage={setTablePage} onSelect={(sample) => { setSelected(sample); setView("map"); }} />
          ) : view === "ucmr" ? (
            <UcmrView snapshot={snapshot} systems={ucmrFiltered} state={state} page={tablePage} setPage={setTablePage} searchPlace={searchPlace} radiusKm={radiusKm} />
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

function WaterSnapshot({ samples, candidates, place, radiusKm, nearestReadings, onViewChange }: { samples: WqpPfasSample[]; candidates: WqpPfasSample[]; place: PickedPlace | null; radiusKm: number; nearestReadings: NearbyReading[]; onViewChange: (view: View) => void }) {
  const displaySamples = samples.length > 0 ? samples : nearestReadings.map((reading) => reading.sample);
  const usingNearestFallback = Boolean(place && samples.length === 0 && displaySamples.length > 0);
  const uniqueSites = new Set(samples.map((sample) => sample.monitoringLocationId)).size;
  const latestDate = [...samples].map((sample) => sample.date).filter(Boolean).sort().at(-1) ?? "No date in scope";

  const distanceBands = place
    ? [10, 25, 50, 100].map((limit) => ({
        label: `Within ${limit} km`,
        count: candidates.filter((sample) => distanceKm(place.lat, place.lng, sample.lat, sample.lng) <= limit).length,
      }))
    : STATES.slice(1).map(({ value, label }) => ({
        label,
        count: candidates.filter((sample) => sample.state === value).length,
      }));
  const distanceMaximum = Math.max(1, ...distanceBands.map((band) => band.count));

  const compounds = (["PFOA", "PFOS", "PFHxS", "PFNA"] as PfasCompound[])
    .map((name) => {
      const rows = displaySamples.filter((sample) => sample.compound === name);
      return { name, total: rows.length, detected: rows.filter((sample) => sample.detected).length };
    })
    .filter((row) => row.total > 0);
  const compoundMaximum = Math.max(1, ...compounds.map((row) => row.total));

  const activityByYear = new Map<number, number>();
  for (const sample of displaySamples) {
    if (sample.year) activityByYear.set(sample.year, (activityByYear.get(sample.year) ?? 0) + 1);
  }
  const years = [...activityByYear.entries()].sort(([left], [right]) => left - right).slice(-10);
  const yearMaximum = Math.max(1, ...years.map(([, count]) => count));

  const providerCounts = new Map<string, number>();
  for (const sample of displaySamples) providerCounts.set(sample.provider, (providerCounts.get(sample.provider) ?? 0) + 1);
  const providers = [...providerCounts.entries()].sort((left, right) => right[1] - left[1]).slice(0, 5);
  const providerMaximum = Math.max(1, ...providers.map(([, count]) => count));

  return (
    <div className="h-full overflow-auto bg-paper p-4 md:p-6">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
          <div>
            <div className="flex items-center gap-2"><ChartPie size={18} className="text-[#007f86]" /><h2 className="text-lg font-semibold text-ink">Water data snapshot</h2></div>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-ink-3">A visual summary of sampling coverage, result status, timing, and provenance. It describes records in the selected filters, not household exposure or water safety.</p>
          </div>
          <SourceBadge>WQP validated snapshot</SourceBadge>
        </div>

        {usingNearestFallback && (
          <div className="mt-4 rounded-md border border-[#d8d5c6] bg-[#fffdf3] p-3 text-xs leading-relaxed text-[#5d5638]">
            <strong>No records are inside {formatDistance(radiusKm)}.</strong> The composition visuals below use the eight nearest matching records for context; distance-band counts still show the full filtered dataset. This does not change the map radius.
          </div>
        )}

        <div className="mt-4 grid grid-cols-2 border border-hairline bg-surface sm:grid-cols-4">
          <SnapshotMetric label="Records in radius" value={samples.length.toLocaleString()} detail={place ? formatDistance(radiusKm) : "current filters"} />
          <SnapshotMetric label="Monitoring sites" value={uniqueSites.toLocaleString()} detail="reported identifiers" />
          <SnapshotMetric label="Nearest record" value={nearestReadings[0] ? formatDistance(nearestReadings[0].distanceKm) : "—"} detail={place ? "straight-line distance" : "search an address"} />
          <SnapshotMetric label="Latest in radius" value={latestDate} detail="sample date, not live" />
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <SnapshotPanel title={place ? "Sampling coverage by distance" : "Sampling records by state"} subtitle={place ? `Cumulative counts around ${place.label}` : "Current filter distribution across the five-state pilot"}>
            <div className="space-y-3">
              {distanceBands.map((band) => <HorizontalCountBar key={band.label} label={band.label} count={band.count} maximum={distanceMaximum} />)}
            </div>
            <p className="mt-4 text-[10px] leading-relaxed text-ink-3">A low count indicates sparse records in this downloaded dataset. It is not evidence of low contamination.</p>
          </SnapshotPanel>

          <SnapshotPanel title="Compound and result mix" subtitle={usingNearestFallback ? "Eight nearest matching records" : "Records inside the current scope"}>
            {compounds.length ? <div className="space-y-3">{compounds.map((row) => (
              <div key={row.name}>
                <div className="mb-1 flex items-center justify-between text-[11px]"><span className="font-semibold text-ink">{row.name}</span><span className="tabular text-ink-3">{row.detected} detected · {row.total - row.detected} non-detect</span></div>
                <div className="flex h-3 overflow-hidden rounded-sm bg-surface-2" style={{ width: `${Math.max(12, (row.total / compoundMaximum) * 100)}%` }}><span className="bg-[#007f86]" style={{ width: `${(row.detected / row.total) * 100}%` }} /><span className="bg-[#b9c9d6]" style={{ width: `${((row.total - row.detected) / row.total) * 100}%` }} /></div>
              </div>
            ))}</div> : <EmptyVisual text="No compound records match these filters." />}
            <div className="mt-4 flex gap-4 text-[10px] text-ink-3"><span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 bg-[#007f86]" />Reported detection</span><span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 bg-[#b9c9d6]" />Non-detect</span></div>
          </SnapshotPanel>

          <SnapshotPanel title="Sampling activity" subtitle="Reported records by sample year; not a concentration trend">
            {years.length ? <div className="flex h-40 items-end gap-2 border-b border-hairline pt-3">{years.map(([sampleYear, count]) => (
              <div key={sampleYear} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1"><span className="tabular text-[9px] text-ink-3">{count}</span><div className="w-full max-w-8 rounded-t-sm bg-[#5c8db7]" style={{ height: `${Math.max(6, (count / yearMaximum) * 108)}px` }} /><span className="tabular text-[9px] text-ink-3">{String(sampleYear).slice(-2)}</span></div>
            ))}</div> : <EmptyVisual text="No dated records match these filters." />}
          </SnapshotPanel>

          <SnapshotPanel title="Who reported these records?" subtitle="Top providers in the displayed visual scope">
            {providers.length ? <div className="space-y-3">{providers.map(([provider, count]) => <HorizontalCountBar key={provider} label={provider} count={count} maximum={providerMaximum} />)}</div> : <EmptyVisual text="No provider information is available for this scope." />}
            <p className="mt-4 text-[10px] leading-relaxed text-ink-3">Provider mix matters because programs can use different sampling designs, laboratory methods, and reporting limits.</p>
          </SnapshotPanel>
        </div>

        <section className="mt-4 border border-hairline bg-surface p-4">
          <h3 className="text-sm font-semibold text-ink">Useful next steps</h3>
          <p className="mt-1 text-xs leading-relaxed text-ink-3">Use WQP for nearby environmental samples and UCMR for public drinking-water-system records. Neither source identifies an individual household&apos;s current tap-water result.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={() => onViewChange("map")} className="inline-flex h-9 items-center gap-2 rounded-sm bg-[#006a70] px-3 text-xs font-semibold text-white"><MapIcon size={14} /> Open measurement map</button>
            <button type="button" onClick={() => onViewChange("ucmr")} className="inline-flex h-9 items-center gap-2 rounded-sm border border-hairline bg-surface px-3 text-xs font-semibold text-ink"><FlaskConical size={14} /> Check UCMR systems</button>
            <a href="https://mywaterway.epa.gov/" target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-2 rounded-sm border border-hairline bg-surface px-3 text-xs font-semibold text-ink">EPA How&apos;s My Waterway <ExternalLink size={13} /></a>
            <a href="https://www.usgs.gov/programs/environmental-health-program/science/pfas-us-tapwater-interactive-dashboard" target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-2 rounded-sm border border-hairline bg-surface px-3 text-xs font-semibold text-ink">USGS tap-water dashboard <ExternalLink size={13} /></a>
          </div>
        </section>
      </div>
    </div>
  );
}

function SnapshotMetric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div className="min-w-0 border-b border-r border-hairline p-3 last:border-r-0 sm:border-b-0"><p className="text-[9px] font-semibold uppercase text-ink-3">{label}</p><p className="mt-1 truncate text-lg font-semibold tabular text-ink" title={value}>{value}</p><p className="mt-0.5 truncate text-[10px] text-ink-3">{detail}</p></div>;
}

function SnapshotPanel({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return <section className="border border-hairline bg-surface p-4"><h3 className="text-sm font-semibold text-ink">{title}</h3><p className="mt-0.5 text-[10px] leading-relaxed text-ink-3">{subtitle}</p><div className="mt-4">{children}</div></section>;
}

function HorizontalCountBar({ label, count, maximum }: { label: string; count: number; maximum: number }) {
  return <div><div className="mb-1 flex items-center justify-between gap-3 text-[10px]"><span className="truncate text-ink-2" title={label}>{label}</span><span className="tabular font-semibold text-ink">{count.toLocaleString()}</span></div><div className="h-2 overflow-hidden rounded-sm bg-surface-2"><div className="h-full rounded-sm bg-[#5c8db7]" style={{ width: `${count === 0 ? 0 : Math.max(2, (count / maximum) * 100)}%` }} /></div></div>;
}

function EmptyVisual({ text }: { text: string }) {
  return <div className="grid min-h-28 place-items-center rounded-sm border border-dashed border-baseline px-4 text-center text-xs text-ink-3">{text}</div>;
}

function LiveWaterView({ place }: { place: PickedPlace | null }) {
  const [snapshot, setSnapshot] = useState<UsgsWaterSnapshot | null>(null);
  const [selectedSite, setSelectedSite] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!place) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/water/live?lat=${place.lat}&lng=${place.lng}&radiusKm=50`);
      const body = await response.json();
      if (!response.ok || !body.ok) throw new Error(body.error ?? "USGS water data could not be loaded");
      const next = body.data as UsgsWaterSnapshot;
      setSnapshot(next);
      setSelectedSite((current) => next.stations.some((station) => station.siteCode === current) ? current : next.stations[0]?.siteCode ?? "");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "USGS water data could not be loaded");
    } finally {
      setLoading(false);
    }
  }, [place]);

  useEffect(() => {
    if (!place) return;
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [place, load]);

  if (!place) {
    return <div className="grid min-h-[620px] place-items-center bg-paper p-6"><div className="max-w-md text-center"><Activity size={38} className="mx-auto text-[#007f86]" /><h2 className="mt-4 text-lg font-semibold text-ink">Search a location to open Water Now</h2><p className="mt-2 text-sm leading-relaxed text-ink-3">The app will find nearby USGS continuous sensors and show available streamflow, gage height, temperature, conductance, pH, dissolved oxygen, and turbidity readings.</p><p className="mt-3 text-xs leading-relaxed text-ink-3">These are current waterway conditions, not live PFAS or household tap-water measurements.</p></div></div>;
  }

  if (loading && !snapshot) return <div className="grid min-h-[620px] place-items-center bg-paper"><div className="flex items-center gap-2 text-sm text-ink-2"><RefreshCw size={16} className="animate-spin" /> Finding nearby USGS sensors</div></div>;
  if (error && !snapshot) return <div className="grid min-h-[620px] place-items-center bg-paper p-6"><div className="max-w-sm text-center"><p className="font-semibold text-ink">Live water context is temporarily unavailable</p><p className="mt-2 text-xs text-ink-3">{error}</p><button type="button" onClick={() => void load()} className="mt-4 inline-flex h-9 items-center gap-2 rounded-sm bg-[#006a70] px-3 text-xs font-semibold text-white"><RefreshCw size={14} /> Try again</button></div></div>;

  const station = snapshot?.stations.find((item) => item.siteCode === selectedSite) ?? snapshot?.stations[0] ?? null;
  if (snapshot && snapshot.stations.length === 0) return <div className="grid min-h-[620px] place-items-center bg-paper p-6"><div className="max-w-md text-center"><Activity size={36} className="mx-auto text-baseline" /><h2 className="mt-3 text-lg font-semibold text-ink">No continuous USGS readings found within 50 km</h2><p className="mt-2 text-xs leading-relaxed text-ink-3">This is a sensor-coverage gap, not a statement about local water quality. Discrete WQP and UCMR records remain available in their separate views.</p></div></div>;

  return (
    <div className="h-full overflow-auto bg-paper p-4 md:p-6">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
          <div><div className="flex items-center gap-2"><Activity size={19} className="text-[#007f86]" /><h2 className="text-lg font-semibold text-ink">Water Now</h2><SourceBadge>USGS provisional</SourceBadge></div><p className="mt-1 max-w-2xl text-xs leading-relaxed text-ink-3">Continuous hydrologic readings near {place.label}. Parameters vary by station and are shown only when reported.</p></div>
          <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex h-9 w-fit items-center gap-2 rounded-sm border border-hairline bg-surface px-3 text-xs font-semibold text-ink disabled:opacity-50"><RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Refresh</button>
        </div>

        <div className="mt-4 rounded-md border border-[#cadfdc] bg-[#edf7f5] p-3 text-xs leading-relaxed text-[#315a57]"><strong>Different evidence type:</strong> these sensors describe current river or stream conditions. They do not measure PFAS in real time, estimate tap-water exposure, or replace laboratory sampling.</div>

        <div className="mt-4 flex snap-x gap-2 overflow-x-auto pb-2" aria-label="Nearby USGS stations">
          {snapshot?.stations.map((item) => <button key={item.siteCode} type="button" onClick={() => setSelectedSite(item.siteCode)} className={`w-64 shrink-0 snap-start rounded-md border p-3 text-left ${station?.siteCode === item.siteCode ? "border-[#007f86] bg-[#edf7f5]" : "border-hairline bg-surface"}`}><div className="flex items-center justify-between gap-2"><span className="text-[10px] font-semibold uppercase text-ink-3">USGS {item.siteCode}</span><FreshnessBadge freshness={item.freshness} /></div><p className="mt-2 line-clamp-2 text-xs font-semibold text-ink">{item.name}</p><p className="mt-1 text-[10px] text-ink-3">{formatDistance(item.distanceKm)} away · {item.readings.length} parameter{item.readings.length === 1 ? "" : "s"}</p></button>)}
        </div>

        {station && <div className="mt-3">
          <section className="border border-hairline bg-surface p-4"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start"><div><div className="flex flex-wrap items-center gap-2"><h3 className="text-base font-semibold text-ink">{station.name}</h3><FreshnessBadge freshness={station.freshness} /></div><p className="mt-1 text-xs text-ink-3">USGS {station.siteCode} · {formatDistance(station.distanceKm)} from search · latest available {formatObservationTime(station.latestObservedAt)}</p></div><a href={station.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#006a70]">Open USGS station <ExternalLink size={13} /></a></div></section>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{station.readings.map((reading) => <LiveReadingCard key={reading.code} reading={reading} />)}</div>
        </div>}

        <div className="mt-4 grid gap-3 border-t border-hairline pt-4 sm:grid-cols-3">{snapshot?.caveats.map((caveat) => <p key={caveat} className="text-[10px] leading-relaxed text-ink-3">{caveat}</p>)}</div>
      </div>
    </div>
  );
}

function FreshnessBadge({ freshness }: { freshness: UsgsWaterStation["freshness"] }) {
  const classes = freshness === "fresh" ? "bg-[#dcefdc] text-[#28622e]" : freshness === "recent" ? "bg-[#fff0c9] text-[#755300]" : "bg-surface-2 text-ink-3";
  return <span className={`rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase ${classes}`}>{freshness}</span>;
}

function formatObservationTime(value: string) {
  if (!value) return "unknown";
  return new Date(value).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function LiveReadingCard({ reading }: { reading: UsgsWaterStation["readings"][number] }) {
  const values = reading.history.map((point) => point.value);
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const spread = Math.max(0.0001, maximum - minimum);
  return <article className="border border-hairline bg-surface p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-semibold uppercase text-ink-3">{reading.label}</p><p className="mt-1 text-2xl font-semibold tabular text-ink">{reading.value.toLocaleString(undefined, { maximumFractionDigits: 2 })}</p><p className="text-xs text-ink-3">{reading.unit}</p></div>{reading.provisional && <span className="rounded-full border border-hairline px-2 py-0.5 text-[9px] font-semibold text-ink-3">Provisional</span>}</div><div className="mt-4 flex h-14 items-end gap-0.5" aria-label={`Last 24 hours of ${reading.label}`}>{reading.history.map((point, index) => <span key={`${point.time}-${index}`} className="min-w-0 flex-1 rounded-t-[1px] bg-[#5c8db7]" style={{ height: `${12 + ((point.value - minimum) / spread) * 44}px` }} title={`${formatObservationTime(point.time)}: ${point.value} ${reading.unit}`} />)}</div><div className="mt-2 flex items-center justify-between text-[9px] text-ink-3"><span>Previous 24 hours</span><span>{formatObservationTime(reading.observedAt)}</span></div></article>;
}

function ExposurePathwaysView({ onViewChange }: { onViewChange: (view: View) => void }) {
  const rows = [
    { pollutant: "PFAS", note: "Persistent compounds; drinking water is often an important route.", water: ["Measured here", "WQP + UCMR"], air: ["Not measured here", "Do not infer from AQI"], dust: ["Evidence context", "No local dust results"] },
    { pollutant: "Lead", note: "Can occur across drinking water, air emissions, soil, paint, and household dust.", water: ["Not yet loaded", "Needs lead-specific data"], air: ["Separate air pathway", "No cross-media estimate"], dust: ["Important pathway", "No local dust results"] },
    { pollutant: "Volatile chemicals", note: "Some chemicals in household water can transfer to indoor air during water use.", water: ["Not yet loaded", "Needs VOC measurements"], air: ["Possible transfer", "Requires a formal model"], dust: ["Not primary here", "Chemical-specific"] },
  ];
  return <div className="h-full overflow-auto bg-paper p-4 md:p-6"><div className="mx-auto max-w-6xl"><div className="flex items-center gap-2"><Footprints size={19} className="text-[#007f86]" /><h2 className="text-lg font-semibold text-ink">Cross-media exposure pathways</h2></div><p className="mt-1 max-w-3xl text-xs leading-relaxed text-ink-3">A research-oriented map of what is measured, what is scientifically plausible, and what the app cannot currently establish. Pathway presence does not prove that exposure occurred.</p>

    <p className="mt-4 inline-flex items-center gap-1.5 text-[10px] font-medium text-ink-3 md:hidden"><MoveHorizontal size={13} /> Swipe to compare environmental media</p>
    <div className="mt-2 grid grid-cols-[minmax(130px,1fr)_repeat(3,minmax(180px,1.1fr))] overflow-x-auto border border-hairline bg-surface md:mt-5">
      <div className="border-b border-r border-hairline p-3 text-[10px] font-semibold uppercase text-ink-3">Pollutant</div><PathwayHeader icon={Waves} label="Water" /><PathwayHeader icon={Cloud} label="Air" /><PathwayHeader icon={Mountain} label="Dust & soil" />
      {rows.map((row) => <div key={row.pollutant} className="contents"><div className="border-b border-r border-hairline p-3"><p className="text-sm font-semibold text-ink">{row.pollutant}</p><p className="mt-1 text-[10px] leading-relaxed text-ink-3">{row.note}</p></div><PathwayCell title={row.water[0]} detail={row.water[1]} active={row.water[0] === "Measured here"} /><PathwayCell title={row.air[0]} detail={row.air[1]} /><PathwayCell title={row.dust[0]} detail={row.dust[1]} /></div>)}
    </div>

    <section className="mt-5 border border-hairline bg-surface p-4"><h3 className="text-sm font-semibold text-ink">Evidence ladder for a searched location</h3><div className="mt-4 grid gap-2 md:grid-cols-4"><EvidenceStep number="1" title="Current conditions" detail="USGS hydrology sensors" status="Live context" /><EvidenceStep number="2" title="Environmental samples" detail="WQP laboratory records" status="Measured" /><EvidenceStep number="3" title="Public water system" detail="EPA UCMR records" status="System-level" /><EvidenceStep number="4" title="Personal exposure" detail="Requires household or biomonitoring evidence" status="Not inferred" /></div><div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={() => onViewChange("live")} className="inline-flex h-9 items-center gap-2 rounded-sm bg-[#006a70] px-3 text-xs font-semibold text-white"><Activity size={14} /> Open Water Now</button><button type="button" onClick={() => onViewChange("map")} className="inline-flex h-9 items-center gap-2 rounded-sm border border-hairline px-3 text-xs font-semibold text-ink"><MapIcon size={14} /> Open measurements</button><a href="https://www.atsdr.cdc.gov/pha-guidance/conducting_scientific_evaluations/exposure_pathways/exposure_routes.html" target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-2 rounded-sm border border-hairline px-3 text-xs font-semibold text-ink">ATSDR pathway guidance <ExternalLink size={13} /></a></div></section>

    <div className="mt-4 grid gap-3 sm:grid-cols-3"><MethodCard title="No media conversion" text="An air measurement is never converted into a water concentration, and a water result is never converted into an air exposure." /><MethodCard title="No causal attribution" text="Proximity to a facility, sample, or sensor does not establish the source of a contaminant or a person's exposure." /><MethodCard title="EJScreen replacement discipline" text="Current equity context uses CDC/ATSDR SVI. Archived EJScreen resources are clearly labeled and are not treated as live EPA data." /></div>
  </div></div>;
}

function PathwayHeader({ icon: Icon, label }: { icon: typeof Waves; label: string }) { return <div className="flex items-center gap-2 border-b border-r border-hairline p-3 text-xs font-semibold text-ink last:border-r-0"><Icon size={15} className="text-[#007f86]" />{label}</div>; }
function PathwayCell({ title, detail, active = false }: { title: string; detail: string; active?: boolean }) { return <div className={`border-b border-r border-hairline p-3 last:border-r-0 ${active ? "bg-[#edf7f5]" : ""}`}><span className={`inline-flex rounded-full px-2 py-0.5 text-[9px] font-semibold ${active ? "bg-[#d9eeec] text-[#006a70]" : "bg-surface-2 text-ink-3"}`}>{title}</span><p className="mt-2 text-[10px] leading-relaxed text-ink-3">{detail}</p></div>; }
function EvidenceStep({ number, title, detail, status }: { number: string; title: string; detail: string; status: string }) { return <div className="relative border border-hairline p-3"><span className="grid h-6 w-6 place-items-center rounded-full bg-[#e6eef5] text-[10px] font-semibold text-[#335d7e]">{number}</span><p className="mt-3 text-xs font-semibold text-ink">{title}</p><p className="mt-1 text-[10px] text-ink-3">{detail}</p><p className="mt-3 text-[9px] font-semibold uppercase text-[#006a70]">{status}</p></div>; }

function WaterMap({ samples, state, selected, onSelect, loading, searchPlace, radiusKm, nearestSampleKm, onExpandToNearest }: { samples: WqpPfasSample[]; state: "all" | PfasState; selected: WqpPfasSample | null; onSelect: (sample: WqpPfasSample) => void; loading: boolean; searchPlace: PickedPlace | null; radiusKm: number; nearestSampleKm: number | null; onExpandToNearest: () => void }) {
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
        map.addSource("search-radius", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        map.addSource("search-center", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        map.addLayer({ id: "search-radius-fill", type: "fill", source: "search-radius", paint: { "fill-color": "#3157b7", "fill-opacity": 0.09 } });
        map.addLayer({ id: "search-radius-line", type: "line", source: "search-radius", paint: { "line-color": "#3157b7", "line-width": 2, "line-dasharray": [3, 2] } });
        map.addLayer({ id: "pfas-nondetect", type: "circle", source: "pfas-samples", filter: ["==", ["get", "detected"], false], paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 5, 3, 10, 6], "circle-color": "#ffffff", "circle-stroke-color": "#335d7e", "circle-stroke-width": 1.5, "circle-opacity": 0.92 } });
        map.addLayer({ id: "pfas-detected", type: "circle", source: "pfas-samples", filter: ["==", ["get", "detected"], true], paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 5, 4, 10, 7], "circle-color": "#007f86", "circle-stroke-color": "#ffffff", "circle-stroke-width": 1.5, "circle-opacity": 0.88 } });
        map.addLayer({ id: "pfas-selected", type: "circle", source: "pfas-samples", filter: ["==", ["get", "id"], ""], paint: { "circle-radius": 11, "circle-color": "rgba(0,0,0,0)", "circle-stroke-color": "#111827", "circle-stroke-width": 2.5 } });
        map.addLayer({ id: "search-center-point", type: "circle", source: "search-center", paint: { "circle-radius": 7, "circle-color": "#3157b7", "circle-stroke-color": "#ffffff", "circle-stroke-width": 3 } });
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
    const radiusSource = map.getSource("search-radius") as maplibregl.GeoJSONSource;
    const centerSource = map.getSource("search-center") as maplibregl.GeoJSONSource;
    if (!searchPlace) {
      radiusSource.setData({ type: "FeatureCollection", features: [] });
      centerSource.setData({ type: "FeatureCollection", features: [] });
      return;
    }
    const polygon = radiusPolygon(searchPlace, radiusKm);
    radiusSource.setData({ type: "FeatureCollection", features: [polygon] });
    centerSource.setData({
      type: "FeatureCollection",
      features: [{
        type: "Feature",
        properties: { label: searchPlace.label },
        geometry: { type: "Point", coordinates: [searchPlace.lng, searchPlace.lat] },
      }],
    });
    const lngDelta = radiusKm / (111.32 * Math.cos((searchPlace.lat * Math.PI) / 180));
    const latDelta = radiusKm / 110.574;
    map.fitBounds(
      [[searchPlace.lng - lngDelta, searchPlace.lat - latDelta], [searchPlace.lng + lngDelta, searchPlace.lat + latDelta]],
      { padding: 64, duration: 600, maxZoom: 15 }
    );
  }, [searchPlace, radiusKm, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    map.setFilter("pfas-selected", ["==", ["get", "id"], selected?.id ?? ""]);
    if (selected) map.easeTo({ center: [selected.lng, selected.lat], zoom: Math.max(map.getZoom(), 9), duration: 700 });
  }, [selected, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    if (searchPlace) return;
    if (state === "all") map.fitBounds([[-80.8, 37.7], [-71.5, 45.2]], { padding: 32, duration: 700 });
    else map.fitBounds(STATE_BOUNDS[state], { padding: 32, duration: 700 });
  }, [state, ready, searchPlace]);

  return <div className="relative h-[560px] lg:h-full lg:min-h-[680px]"><div className="absolute inset-0"><div ref={container} className="h-full w-full" /></div>{(loading || !ready) && <div className="absolute inset-0 grid place-items-center bg-surface/75 backdrop-blur-sm"><div className="flex items-center gap-2 text-xs font-medium text-ink-2"><RefreshCw size={15} className="animate-spin" /> Loading official sample records</div></div>}{searchPlace && samples.length === 0 && !loading && ready && <div className="absolute left-1/2 top-3 z-10 w-[min(92%,440px)] -translate-x-1/2 rounded-md border border-hairline bg-surface/95 p-3 shadow-lg backdrop-blur"><p className="text-xs font-semibold text-ink">No WQP sample records in this radius</p><p className="mt-1 text-[11px] leading-relaxed text-ink-3">This indicates missing nearby records in this dataset, not zero PFAS or safe water.{nearestSampleKm != null && ` The nearest matching WQP record is about ${formatDistance(nearestSampleKm)} away.`}</p>{nearestSampleKm != null && nearestSampleKm <= MAX_RADIUS_KM && <button type="button" onClick={onExpandToNearest} className="mt-2 inline-flex h-8 items-center gap-2 rounded-sm bg-[#006a70] px-3 text-[11px] font-semibold text-white"><Navigation size={13} /> Expand radius to nearest</button>}</div>}<div className="pointer-events-none absolute bottom-8 left-3 rounded-sm border border-hairline bg-surface/95 px-2.5 py-2 text-[10px] text-ink-2 shadow-md"><strong className="block text-ink">WQP reported coordinates</strong>Point is a monitoring location, not a home.</div></div>;
}

function NearestReadingsTray({ readings, radiusKm, onOpen }: { readings: NearbyReading[]; radiusKm: number; onOpen: (reading: NearbyReading) => void }) {
  return (
    <section className="border-t border-hairline bg-surface px-4 py-3" aria-labelledby="nearest-readings-title">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 id="nearest-readings-title" className="text-xs font-semibold text-ink">Nearest matching WQP readings</h2>
          <p className="mt-0.5 text-[10px] leading-relaxed text-ink-3">Distance is from the searched point to a reported monitoring location. These readings do not represent a home tap.</p>
        </div>
        <span className="hidden shrink-0 items-center gap-1.5 text-[10px] font-medium text-ink-3 sm:inline-flex"><MoveHorizontal size={13} /> Swipe to compare</span>
      </div>
      <div className="mt-3 flex snap-x snap-mandatory gap-2.5 overflow-x-auto pb-2" tabIndex={0} aria-label="Nearest readings carousel">
        {readings.map((reading, index) => {
          const outsideRadius = reading.distanceKm > radiusKm;
          return (
            <button key={reading.sample.id} type="button" onClick={() => onOpen(reading)} className="w-[250px] shrink-0 snap-start rounded-md border border-hairline bg-surface p-3 text-left shadow-sm transition hover:border-baseline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#007f86]">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-semibold uppercase text-ink-3">#{index + 1} · {formatDistance(reading.distanceKm)}</span>
                <span className={`rounded-full px-2 py-0.5 text-[9px] font-semibold ${reading.sample.detected ? "bg-[#d9eeec] text-[#006a70]" : "border border-[#b9c9d6] bg-white text-[#335d7e]"}`}>{reading.sample.detected ? "Reported detection" : "Non-detect"}</span>
              </div>
              <p className="mt-2 text-base font-semibold tabular text-ink">{formatResult(reading.sample)}</p>
              <p className="mt-1 truncate text-xs font-medium text-ink-2" title={reading.sample.locationName}>{reading.sample.locationName}</p>
              <div className="mt-2 flex items-center justify-between gap-2 text-[10px] text-ink-3">
                <span>{reading.sample.compound} · {reading.sample.date || "Date unavailable"}</span>
                <span className="inline-flex items-center gap-1 font-medium text-[#006a70]">{outsideRadius ? "Expand & view" : "View"}<ChevronRight size={12} /></span>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function SamplingHistory({ samples, place, radiusKm }: { samples: WqpPfasSample[]; place: PickedPlace | null; radiusKm: number }) {
  const rows = useMemo(() => {
    const byYear = new Map<number, { year: number; records: number; detected: number; locations: Set<string> }>();
    for (const sample of samples) {
      if (!sample.year) continue;
      const row = byYear.get(sample.year) ?? { year: sample.year, records: 0, detected: 0, locations: new Set<string>() };
      row.records += 1;
      if (sample.detected) row.detected += 1;
      row.locations.add(sample.monitoringLocationId || `${sample.lat},${sample.lng}`);
      byYear.set(sample.year, row);
    }
    return [...byYear.values()].sort((a, b) => a.year - b.year);
  }, [samples]);
  const maximum = Math.max(1, ...rows.map((row) => row.records));

  return (
    <div className="h-full overflow-auto bg-surface p-5">
      <div className="mx-auto max-w-4xl">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-ink">Sampling history</h2>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-ink-3">
              Annual counts of the currently filtered Water Quality Portal records. This shows when sampling was reported, not a continuous concentration trend: sites, methods, reporting limits, and programs change over time.
            </p>
          </div>
          <SourceBadge>Water Quality Portal</SourceBadge>
        </div>
        {place && (
          <p className="mt-4 rounded-md border border-hairline bg-accent-soft px-3 py-2 text-xs text-ink-2">
            Showing records within {formatDistance(radiusKm)} of <strong>{place.label}</strong>.
          </p>
        )}
        {rows.length === 0 ? (
          <div className="mt-12 rounded-md border border-dashed border-baseline p-8 text-center text-sm text-ink-3">
            No dated WQP samples match these filters. This is a data-coverage gap, not evidence of zero PFAS. Clear the address or reset a filter to inspect the broader dataset.
          </div>
        ) : (
          <div className="mt-5 overflow-hidden rounded-md border border-hairline">
            <div className="grid grid-cols-[64px_1fr_100px] border-b border-hairline bg-surface-2 px-3 py-2 text-[10px] font-semibold uppercase text-ink-3">
              <span>Year</span><span>Reported sample records</span><span className="text-right">Locations</span>
            </div>
            {rows.map((row) => (
              <div key={row.year} className="grid grid-cols-[64px_1fr_100px] items-center border-b border-hairline px-3 py-2.5 last:border-b-0">
                <span className="tabular text-xs font-semibold">{row.year}</span>
                <div>
                  <div className="flex h-3 overflow-hidden rounded-sm bg-surface-2" aria-label={`${row.records} records, ${row.detected} reported detections`}>
                    <span className="bg-[#007f86]" style={{ width: `${(row.detected / maximum) * 100}%` }} />
                    <span className="bg-[#b9c9d6]" style={{ width: `${((row.records - row.detected) / maximum) * 100}%` }} />
                  </div>
                  <p className="tabular mt-1 text-[10px] text-ink-3">
                    {row.records.toLocaleString()} records · {row.detected.toLocaleString()} reported detections · {(row.records - row.detected).toLocaleString()} non-detects
                  </p>
                </div>
                <span className="tabular text-right text-xs text-ink-2">{row.locations.size.toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}
        <div className="mt-4 flex flex-wrap gap-4 text-[11px] text-ink-3">
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-[#007f86]" /> Reported detections</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-[#b9c9d6]" /> Reported non-detects</span>
          <span>Bar length represents record count, not concentration.</span>
        </div>
      </div>
    </div>
  );
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

function UcmrView({ snapshot, systems, state, page, setPage, searchPlace, radiusKm }: { snapshot: PfasPilotSnapshot | null; systems: UcmrPfasSystem[]; state: "all" | PfasState; page: number; setPage: (page: number) => void; searchPlace: PickedPlace | null; radiusKm: number }) {
  const pageSize = 30;
  const rows = systems.slice(page * pageSize, (page + 1) * pageSize);
  const pages = Math.max(1, Math.ceil(systems.length / pageSize));
  return <div className="h-full overflow-auto p-4">{searchPlace && <div className="mb-4 rounded-md border border-accent/25 bg-accent-soft p-3 text-xs leading-relaxed text-ink-2"><strong className="text-ink">Address radius not applied to UCMR.</strong>{" "}UCMR records do not include defensible exact sampling coordinates, so the {radiusKm < 1 ? `${radiusKm * 1000} m` : `${radiusKm} km`} search around {searchPlace.label} filters WQP samples only. Search this table by water-system name, PWSID, or ZIP instead.</div>}<div className="grid gap-3 sm:grid-cols-5">{snapshot?.ucmrStateSummary.filter((summary) => state === "all" || summary.state === state).map((summary) => <div key={summary.state} className="panel rounded-sm p-3"><div className="flex items-center justify-between"><span className="text-sm font-semibold">{summary.state}</span><CheckCircle2 size={14} className="text-[#007f86]" /></div><p className="mt-3 text-xl font-semibold tabular">{summary.systems.toLocaleString()}</p><p className="text-[10px] text-ink-3">public water systems</p><p className="mt-2 text-xs tabular text-ink-2">{summary.detections.toLocaleString()} detections / {summary.samples.toLocaleString()} results</p></div>)}</div><div className="mt-4 rounded-sm border border-[#d8d5c6] bg-[#fffdf3] p-3 text-xs leading-relaxed text-[#5d5638]"><strong>Location discipline:</strong> UCMR 5 records identify public water systems and sampling points but the public occurrence file does not supply defensible exact map coordinates. These results stay in a system table instead of being pinned to homes or arbitrary centroids.</div><div className="mt-4"><DataTableShell title={`EPA UCMR 5 drinking-water system records${searchPlace ? " (not radius-filtered)" : ""}`} detail={`${systems.length.toLocaleString()} system / compound summaries`} page={page} pages={pages} setPage={setPage}><table className="w-full min-w-[840px] text-left text-xs"><thead className="bg-surface-2 text-[10px] uppercase text-ink-3"><tr>{["System", "State", "ZIP context", "PFAS", "Reported detections", "Highest reported", "Latest sample", "Source"].map((header) => <th key={header} className="px-3 py-2.5 font-semibold">{header}</th>)}</tr></thead><tbody>{rows.map((system) => <tr key={system.id} className="border-t border-hairline bg-surface"><td className="px-3 py-2.5"><p className="font-medium">{system.pwsName}</p><p className="text-[10px] text-ink-3">PWSID {system.pwsid}</p></td><td className="px-3 py-2.5">{system.state}</td><td className="px-3 py-2.5">{system.zip || "—"}</td><td className="px-3 py-2.5 font-medium">{system.compound}</td><td className="px-3 py-2.5 tabular">{system.detectionCount} / {system.sampleCount}</td><td className="px-3 py-2.5 tabular">{system.maxNgL == null ? `None ≥ ${system.mrlNgL ?? "reported"} ng/L` : `${system.maxNgL.toLocaleString()} ng/L`}</td><td className="px-3 py-2.5 tabular">{system.latestDate}</td><td className="px-3 py-2.5"><a href={system.sourceUrl} target="_blank" rel="noreferrer" className="text-[#006a70]">EPA <ExternalLink size={11} className="inline" /></a></td></tr>)}</tbody></table></DataTableShell></div></div>;
}

function DataTableShell({ title, detail, page, pages, setPage, children }: { title: string; detail: string; page: number; pages: number; setPage: (page: number) => void; children: React.ReactNode }) {
  return <div className="flex h-full min-h-[620px] flex-col bg-surface"><div className="flex items-center justify-between border-b border-hairline px-4 py-3"><div><h2 className="text-sm font-semibold">{title}</h2><p className="text-[11px] text-ink-3">{detail}</p></div><div className="flex items-center gap-2 text-xs"><button disabled={page === 0} onClick={() => setPage(page - 1)} className="rounded-sm border border-hairline px-2 py-1 disabled:opacity-30">Previous</button><span className="tabular text-ink-3">{page + 1} / {pages}</span><button disabled={page + 1 >= pages} onClick={() => setPage(page + 1)} className="rounded-sm border border-hairline px-2 py-1 disabled:opacity-30">Next</button></div></div><div className="min-h-0 flex-1 overflow-auto">{children}</div></div>;
}

function MethodsView({ generatedAt }: { generatedAt?: string }) {
  return <div className="mx-auto max-w-4xl space-y-4 p-5"><section className="panel rounded-sm p-5"><h2 className="text-base font-semibold">What this pilot can and cannot say</h2><div className="mt-4 grid gap-4 sm:grid-cols-2"><MethodCard title="Measured occurrence" text="WQP points represent reported water samples at submitted monitoring coordinates. UCMR records represent standardized public-water-system monitoring." /><MethodCard title="Not personal exposure" text="Neither source establishes what is currently in an individual household tap or whether a person was exposed." /><MethodCard title="Non-detects remain visible" text="A non-detect means the analyte was not reported above that test's detection or quantitation threshold. It is never converted to zero." /><MethodCard title="No safety score" text="The interface does not rank counties, calculate exposure, infer causation, or combine potential-source records with measurements." /></div></section><section className="panel rounded-sm p-5"><h2 className="text-base font-semibold">Source trail</h2><div className="mt-4 space-y-3 text-xs text-ink-2"><SourceLine name="EPA UCMR 5" detail="January 2026 occurrence-data release; PFOA and PFOS summaries for DE, MD, NJ, NY, PA." url="https://www.epa.gov/dwucmr/occurrence-data-unregulated-contaminant-monitoring-rule" /><SourceLine name="Water Quality Portal" detail="Water-media exports for PFOA, PFOS, PFHxS, and PFNA. Quality-control and blank records are excluded from public display." url="https://www.waterqualitydata.us/" /><p className="border-t border-hairline pt-3 text-ink-3">App snapshot generated {generatedAt ? new Date(generatedAt).toLocaleString() : "—"}. Raw files remain unchanged in the repository.</p></div></section></div>;
}

function MethodCard({ title, text }: { title: string; text: string }) { return <div className="rounded-sm border border-hairline p-4"><p className="text-xs font-semibold text-ink">{title}</p><p className="mt-2 text-xs leading-relaxed text-ink-2">{text}</p></div>; }
function SourceLine({ name, detail, url }: { name: string; detail: string; url: string }) { return <a href={url} target="_blank" rel="noreferrer" className="flex items-center justify-between gap-4 rounded-sm border border-hairline p-3 hover:border-baseline"><span><strong className="block text-ink">{name}</strong><span className="mt-0.5 block leading-relaxed">{detail}</span></span><ExternalLink size={15} className="shrink-0" /></a>; }
