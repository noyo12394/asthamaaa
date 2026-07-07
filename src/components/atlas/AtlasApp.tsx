"use client";

/**
 * Command-center orchestrator: left sidebar, map, right inspector, bottom
 * timeline, agent dock, legend, map-mode controls, community-report form.
 */
import { useCallback, useState } from "react";
import { Bot, Crosshair, Flame, Layers3, Radar, ShieldCheck } from "lucide-react";
import MapCanvas, { type MapViewRequest } from "./MapCanvas";
import Sidebar from "./Sidebar";
import Inspector from "./Inspector";
import Timeline from "./Timeline";
import AgentDock from "./AgentDock";
import Legend from "./Legend";
import { api } from "@/lib/client/api";
import { formatDistance, type DistanceUnit } from "@/lib/distance";
import type { LayerId, SelectedFeature, SelectedLocation } from "./state";

const DEFAULT_LAYERS: LayerId[] = ["aqi", "monitors", "coverage"];
const COMMAND_STATS = [
  { label: "views", value: "9", tone: "text-ink" },
  { label: "source trail", value: "on", tone: "text-good" },
];

const INTELLIGENCE_OUTPUTS = [
  {
    label: "Exposure overlay",
    detail: "Real-world context for what residents are breathing now",
    icon: Layers3,
  },
  {
    label: "Confidence heatmap",
    detail: "Where monitor coverage is strong, partial, sparse, or remote",
    icon: Radar,
  },
  {
    label: "Priority mask",
    detail: "Cells that need attention first for alerts, sensors, or outreach",
    icon: Flame,
  },
];

export default function AtlasApp() {
  const [activeLayers, setActiveLayers] = useState<LayerId[]>(DEFAULT_LAYERS);
  const [viewMode, setViewMode] = useState<"2d" | "2.5d" | "3d">("2.5d");
  const [selected, setSelected] = useState<SelectedLocation | null>(null);
  const [flyTo, setFlyTo] = useState<MapViewRequest | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const [timelineOpen, setTimelineOpen] = useState(true);
  const [agentOpen, setAgentOpen] = useState(false);
  const [layerMeta, setLayerMeta] = useState<Partial<Record<LayerId, unknown>>>({});
  const [profile, setProfile] = useState<{ age: string; conditions: string[] }>({
    age: "",
    conditions: [],
  });
  const [distanceUnit, setDistanceUnit] = useState<DistanceUnit>("km");
  const [reportOpen, setReportOpen] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<"map" | "inspect" | "layers">("map");

  const toggleLayer = (id: LayerId) =>
    setActiveLayers((cur) => (cur.includes(id) ? cur.filter((l) => l !== id) : [...cur, id]));

  const activateLayers = useCallback((ids: LayerId[]) => {
    setActiveLayers(ids);
    setMobilePanel("map");
  }, []);

  const pickPlace = useCallback((lat: number, lng: number, label: string) => {
    setSelected({ lat, lng, label, feature: null });
    setFlyTo({ center: [lng, lat], zoom: 10.5, key: Date.now() });
    setMobilePanel("inspect");
  }, []);

  const onMapSelect = useCallback((lat: number, lng: number, feature: SelectedFeature | null) => {
    const label =
      feature?.kind === "monitor"
        ? String(feature.properties.name ?? "Monitor")
        : feature?.kind === "county"
          ? `${feature.properties.name}, ${feature.properties.state}`
          : null;
    setSelected({ lat, lng, label, feature });
  }, []);

  const onLayerMeta = useCallback((layer: LayerId, meta: unknown) => {
    setLayerMeta((cur) => ({ ...cur, [layer]: meta }));
  }, []);

  async function submitReport(form: FormData) {
    if (!selected) return;
    await api("/api/community-reports", {
      method: "POST",
      body: JSON.stringify({
        lat: selected.lat,
        lng: selected.lng,
        reportType: String(form.get("reportType")),
        intensity: Number(form.get("intensity")),
        note: String(form.get("note") ?? "").slice(0, 500) || null,
      }),
    }).catch(() => {});
    setReportOpen(false);
    if (!activeLayers.includes("reports")) toggleLayer("reports");
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* mobile panel switcher */}
      <div className="flex border-b border-hairline bg-surface text-xs md:hidden">
        {(["map", "inspect", "layers"] as const).map((p) => (
          <button
            key={p}
            onClick={() => setMobilePanel(p)}
            className={`flex-1 py-2 capitalize ${mobilePanel === p ? "border-b-2 border-accent font-medium text-accent" : "text-ink-3"}`}
          >
            {p === "inspect" ? "Inspector" : p}
          </button>
        ))}
      </div>

      <div className="flex min-h-0 flex-1">
        <aside
          className={`w-full shrink-0 border-r border-hairline bg-surface md:block md:w-[280px] ${
            mobilePanel === "layers" ? "block" : "hidden"
          }`}
        >
          <Sidebar
            activeLayers={activeLayers}
            onToggleLayer={toggleLayer}
            onActivateLayers={activateLayers}
            onPickPlace={pickPlace}
            selected={selected}
            distanceUnit={distanceUnit}
            onDistanceUnitChange={setDistanceUnit}
          />
        </aside>

        <main
          className={`relative min-w-0 flex-1 md:block ${mobilePanel === "map" ? "block" : "hidden"}`}
        >
          <MapCanvas
            activeLayers={activeLayers}
            viewMode={viewMode}
            flyTo={flyTo}
            selected={selected}
            onSelect={onMapSelect}
            onLayerMeta={onLayerMeta}
            resetKey={resetKey}
          />

          {/* view mode + reset controls */}
          <div className="absolute top-2 left-2 flex gap-px overflow-hidden rounded-sm border border-hairline bg-surface/95 shadow-sm backdrop-blur">
            {(["2d", "2.5d", "3d"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setViewMode(m)}
                className={`px-2.5 py-1.5 text-xs font-medium uppercase ${
                  viewMode === m ? "bg-accent text-white" : "bg-surface text-ink-2 hover:text-ink"
                }`}
              >
                {m}
              </button>
            ))}
            <button
              onClick={() => setResetKey((k) => k + 1)}
              className="bg-surface px-2.5 py-1.5 text-xs text-ink-2 hover:text-ink"
              title="Reset view to the Lehigh Valley"
            >
              Reset
            </button>
          </div>

          <div className="pointer-events-none absolute top-2 right-2 z-10 hidden w-[320px] rounded-sm border border-hairline bg-surface/90 p-3 shadow-lg backdrop-blur md:block">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="panel-title">Operational intelligence</p>
                <h2 className="mt-1 text-base font-semibold leading-tight">
                  {selected?.label ?? "Select a place to activate the atlas"}
                </h2>
              </div>
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-sm bg-accent-soft text-accent">
                <Radar size={18} />
              </span>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-1.5">
              <div className="border border-hairline bg-surface px-2 py-1.5">
                <span className="tabular block text-sm font-semibold text-accent">
                  {formatDistance(10, distanceUnit, 0)} / {formatDistance(25, distanceUnit, 0)}
                </span>
                <span className="block truncate text-[9px] uppercase tracking-wide text-ink-3">
                  monitor bands
                </span>
              </div>
              {COMMAND_STATS.map((stat) => (
                <div key={stat.label} className="border border-hairline bg-surface px-2 py-1.5">
                  <span className={`tabular block text-sm font-semibold ${stat.tone}`}>{stat.value}</span>
                  <span className="block truncate text-[9px] uppercase tracking-wide text-ink-3">
                    {stat.label}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] text-ink-2">
              <span className="inline-flex items-center gap-1 rounded-full border border-hairline bg-surface px-2 py-0.5">
                <Layers3 size={11} /> {activeLayers.length} active layers
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-hairline bg-surface px-2 py-0.5">
                <ShieldCheck size={11} /> no diagnosis
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-hairline bg-surface px-2 py-0.5">
                <Bot size={11} /> grounded agent
              </span>
            </div>
            <div className="mt-3 border-t border-hairline pt-2">
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-ink-3">
                Instant outputs
              </p>
              <div className="space-y-1.5">
                {INTELLIGENCE_OUTPUTS.map((output) => {
                  const Icon = output.icon;
                  return (
                    <div key={output.label} className="flex gap-2 text-[10px] leading-snug text-ink-3">
                      <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-sm border border-hairline bg-surface text-accent">
                        <Icon size={12} />
                      </span>
                      <span>
                        <span className="block font-semibold text-ink-2">{output.label}</span>
                        {output.detail}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* report button */}
          <div className="absolute top-2 left-1/2 -translate-x-1/2">
            {selected && (
              <button
                onClick={() => setReportOpen(true)}
                className="panel rounded-sm px-2.5 py-1.5 text-xs text-ink-2 shadow-sm hover:border-accent hover:text-accent"
              >
                + Community report here
              </button>
            )}
          </div>

          {/* legend */}
          <div className="absolute bottom-8 left-2">
            <Legend activeLayers={activeLayers} layerMeta={layerMeta} distanceUnit={distanceUnit} />
          </div>

          {/* agent dock */}
          <div className="fixed right-2 bottom-20 z-30 md:absolute md:bottom-8">
            <AgentDock
              location={selected}
              open={agentOpen}
              onToggle={() => setAgentOpen((o) => !o)}
              distanceUnit={distanceUnit}
            />
          </div>

          {!selected && (
            <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-[340px] items-center justify-center border-l border-hairline bg-gradient-to-b from-surface/80 to-surface/55 px-8 text-center backdrop-blur-sm lg:flex">
              <div>
                <div className="mx-auto grid h-12 w-12 place-items-center rounded-sm border border-hairline bg-surface text-accent shadow-sm">
                  <Crosshair size={22} />
                </div>
                <h2 className="mt-4 text-lg font-semibold">Start with a place</h2>
                <p className="mt-2 text-sm leading-relaxed text-ink-3">
                  Search, click the map, or use a launch pad. The atlas will assemble current AQI,
                  monitor confidence, county burden, equity context, and an audit trail.
                </p>
              </div>
            </div>
          )}

          {/* community report modal */}
          {reportOpen && selected && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-ink/20">
              <form
                action={submitReport}
                className="panel w-80 space-y-3 rounded-sm p-4 shadow-lg"
              >
                <h3 className="text-sm font-semibold">Submit community report</h3>
                <p className="tabular text-[11px] text-ink-3">
                  at {selected.lat.toFixed(4)}, {selected.lng.toFixed(4)}
                </p>
                <label className="block text-xs">
                  Type
                  <select name="reportType" className="mt-1 w-full border border-hairline bg-surface px-2 py-1.5">
                    {["smoke", "odor", "dust", "burning", "visibility", "health-symptom", "other"].map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-xs">
                  Intensity
                  <select name="intensity" className="mt-1 w-full border border-hairline bg-surface px-2 py-1.5">
                    <option value="1">1 — noticeable</option>
                    <option value="2">2 — significant</option>
                    <option value="3">3 — severe</option>
                  </select>
                </label>
                <label className="block text-xs">
                  Note (optional)
                  <textarea
                    name="note"
                    rows={2}
                    className="mt-1 w-full border border-hairline bg-surface px-2 py-1.5"
                    placeholder="What are you observing?"
                  />
                </label>
                <p className="text-[10px] leading-snug text-ink-3">
                  Reports are shown as unverified resident observations, clearly separated from
                  official data, and never feed the scoring engine.
                </p>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setReportOpen(false)}
                    className="px-3 py-1.5 text-xs text-ink-2 hover:text-ink"
                  >
                    Cancel
                  </button>
                  <button type="submit" className="bg-accent px-3 py-1.5 text-xs font-medium text-white">
                    Submit
                  </button>
                </div>
              </form>
            </div>
          )}
        </main>

        <aside
          className={`w-full shrink-0 border-l border-hairline bg-surface md:block md:w-[340px] ${
            mobilePanel === "inspect" ? "block" : "hidden"
          }`}
        >
          <Inspector
            selected={selected}
            profile={profile}
            onProfileChange={setProfile}
            distanceUnit={distanceUnit}
          />
        </aside>
      </div>

      <div className="no-print hidden md:block">
        <Timeline selected={selected} open={timelineOpen} onToggle={() => setTimelineOpen((o) => !o)} />
      </div>
    </div>
  );
}
