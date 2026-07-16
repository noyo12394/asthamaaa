"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity, AlertTriangle, ArrowRight, BookOpen, Building2, ChevronDown,
  CircleHelp, Crosshair, Database, GitBranch, GraduationCap, HeartPulse,
  Hospital, Info, LocateFixed, MapPin, Menu, Microscope, Navigation, Play,
  Radio, RotateCcw, Search, ShieldCheck, Sparkles, X, Zap,
} from "lucide-react";
import EarthPulseMap, { type PulseLocation, type PulseMode } from "./EarthPulseMap";

type GeocodeResult = { displayName: string; lat: number; lng: number; source?: { status?: string } };
type Gauge = {
  id: string; name: string; lat: number; lng: number; distanceKm: number;
  dischargeCfs: number | null; gageHeightFt: number | null;
  observedAt: string | null; qualifiers: string[];
};
type LiveContext = {
  fetchedAt: string;
  alerts: { id: string; event: string; headline: string; severity: string; certainty: string; expires: string | null; url: string }[];
  gauges: Gauge[];
  earthquakes: { id: string; magnitude: number | null; place: string; distanceKm: number; observedAt: string | null; url: string | null }[];
  air: { aqi: number | null; category: string; pollutant: string | null; observedAt: string; source: { name: string; url: string | null; status: string } } | null;
  availability: Record<"alerts" | "gauges" | "earthquakes" | "air", boolean>;
  sources: { id: string; name: string; url: string; status: string }[];
};
type ApiEnvelope<T> = { ok: boolean; data?: T; error?: string };

const DEFAULT_LOCATION: PulseLocation = {
  label: "Lehigh University · Bethlehem, Pennsylvania",
  lat: 40.6068,
  lng: -75.3783,
};
const MODES: { id: PulseMode; label: string; detail: string }[] = [
  { id: "explore", label: "Explore", detail: "See what is happening now" },
  { id: "understand", label: "Understand", detail: "Trace cause and consequence" },
  { id: "simulate", label: "Simulate", detail: "Test a counterfactual" },
];
const TIMELINE_LABELS = ["Onset", "Road stress", "Access loss", "Crest", "Recovery"];

function relativeTime(value: string | null | undefined) {
  if (!value) return "time unavailable";
  const minutes = Math.round((Date.now() - new Date(value).getTime()) / 60000);
  if (Math.abs(minutes) < 2) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} hr ago`;
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function phaseFor(timeline: number) {
  if (timeline < 24) return { label: "Rain begins", status: "Routes remain connected" };
  if (timeline < 49) return { label: "Runoff accelerates", status: "Travel friction rising" };
  if (timeline < 73) return { label: "Access under pressure", status: "School LifeLine compromised" };
  if (timeline < 90) return { label: "Water near crest", status: "Hospital route rerouted" };
  return { label: "Recovery begins", status: "Access returning unevenly" };
}

export default function EarthPulseApp() {
  const [entered, setEntered] = useState(false);
  const [mode, setMode] = useState<PulseMode>("explore");
  const [location, setLocation] = useState<PulseLocation>(DEFAULT_LOCATION);
  const [timeline, setTimeline] = useState(58);
  const [replay, setReplay] = useState(true);
  const [bridgeClosed, setBridgeClosed] = useState(false);
  const [showFog, setShowFog] = useState(true);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [live, setLive] = useState<LiveContext | null>(null);
  const [loadingLive, setLoadingLive] = useState(true);
  const [drawer, setDrawer] = useState<"sources" | "ask" | "about" | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const phase = phaseFor(timeline);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/earthpulse/context?lat=${location.lat}&lng=${location.lng}`)
      .then(async (response) => {
        const body = (await response.json()) as ApiEnvelope<LiveContext>;
        if (!response.ok || !body.ok || !body.data) throw new Error(body.error ?? "Context unavailable");
        return body.data;
      })
      .then((data) => { if (!cancelled) setLive(data); })
      .catch(() => { if (!cancelled) setLive(null); })
      .finally(() => { if (!cancelled) setLoadingLive(false); });
    return () => { cancelled = true; };
  }, [location]);

  useEffect(() => {
    if (!query.trim() || query.trim().length < 2) return;
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(async () => {
      try {
        const response = await fetch(`/api/geocode?q=${encodeURIComponent(query.trim())}&count=5`);
        const body = (await response.json()) as ApiEnvelope<{ results: GeocodeResult[] }>;
        setResults(body.data?.results ?? []);
      } catch { setResults([]); }
      finally { setSearching(false); }
    }, 320);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [query]);

  const selectLocation = (result: GeocodeResult) => {
    setLoadingLive(true);
    setLocation({ label: result.displayName, lat: result.lat, lng: result.lng });
    setQuery(""); setResults([]); setEntered(true);
  };
  const locateMe = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((position) => {
      setLoadingLive(true);
      setLocation({ label: "Your current location", lat: position.coords.latitude, lng: position.coords.longitude });
      setEntered(true);
    });
  };
  const onMapPick = useCallback((lat: number, lng: number) => {
    setLoadingLive(true);
    setLocation({ label: `Map point · ${lat.toFixed(4)}, ${lng.toFixed(4)}`, lat, lng });
  }, []);

  const updateQuery = (value: string) => {
    setQuery(value);
    setResults([]);
    setSearching(value.trim().length >= 2);
  };

  const currentGauge = live?.gauges[0] ?? null;
  const timelineIndex = Math.min(4, Math.floor(timeline / 21));
  const pilotActive = Math.abs(location.lat - 40.61) < 0.7 && Math.abs(location.lng + 75.38) < 0.8;
  const evidence = useMemo(() => [
    { label: "NWS", value: live?.alerts.length ? `${live.alerts.length} active` : "no active alert", state: live?.availability.alerts },
    { label: "USGS", value: currentGauge?.gageHeightFt != null ? `${currentGauge.gageHeightFt.toFixed(2)} ft` : "nearest gauge", state: live?.availability.gauges },
    { label: "AirNow", value: live?.air?.aqi != null ? `AQI ${live.air.aqi}` : "unavailable", state: live?.availability.air },
    { label: "Infrastructure", value: "pilot graph", state: pilotActive },
  ], [live, currentGauge, pilotActive]);

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    if (results[0]) selectLocation(results[0]);
  }

  return (
    <main className="ep-shell">
      <EarthPulseMap location={location} mode={mode} timeline={replay ? timeline : 5}
        bridgeClosed={bridgeClosed} showFog={showFog && mode !== "explore"} onMapPick={onMapPick} />
      <div className="ep-vignette" aria-hidden="true" />

      <header className="ep-header">
        <button className="ep-brand" onClick={() => setEntered(false)} aria-label="Return to EarthPulse introduction">
          <span className="ep-brand-mark"><Activity size={18} /></span>
          <span>EARTH<span>PULSE</span></span>
        </button>
        <nav className={`ep-nav ${mobileOpen ? "is-open" : ""}`} aria-label="Primary navigation">
          <button onClick={() => { setDrawer("about"); setMobileOpen(false); }}>Mission</button>
          <button onClick={() => { setMode("explore"); setEntered(true); setMobileOpen(false); }}>Explore</button>
          <button onClick={() => { setDrawer("sources"); setMobileOpen(false); }}>Data</button>
          <button onClick={() => { setDrawer("about"); setMobileOpen(false); }}>Methods</button>
        </nav>
        <div className="ep-header-actions">
          <button className="ep-source-status" onClick={() => setDrawer("sources")}>
            <span className={live ? "live-dot" : "live-dot is-offline"} />
            {live ? "Sources connected" : loadingLive ? "Connecting…" : "Partial data"}
          </button>
          <button className="ep-menu" onClick={() => setMobileOpen((value) => !value)} aria-label="Toggle navigation">
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </header>

      {entered ? (
        <div className="ep-interface">
          <section className="ep-commandbar" aria-label="Map controls">
            <form className="ep-search" onSubmit={submitSearch}>
              <Search size={17} />
              <input value={query} onChange={(event) => updateQuery(event.target.value)}
                placeholder="Search any city or place" aria-label="Search any city or place" />
              {searching && <span className="ep-spinner" aria-label="Searching" />}
              {query && <button type="button" onClick={() => { setQuery(""); setResults([]); }} aria-label="Clear search"><X size={15} /></button>}
              {results.length > 0 && (
                <div className="ep-search-results">
                  {results.map((result) => (
                    <button type="button" key={`${result.lat}-${result.lng}`} onClick={() => selectLocation(result)}>
                      <MapPin size={15} /><span>{result.displayName}</span><ArrowRight size={14} />
                    </button>
                  ))}
                </div>
              )}
            </form>
            <button className="ep-locate" onClick={locateMe} aria-label="Use my location"><LocateFixed size={17} /></button>
            <div className="ep-mode-switch" aria-label="Analysis mode">
              {MODES.map((item) => (
                <button key={item.id} className={mode === item.id ? "active" : ""}
                  onClick={() => setMode(item.id)} title={item.detail}>{item.label}</button>
              ))}
            </div>
          </section>

          <section className="ep-location-strip">
            <div><MapPin size={14} /><strong>{location.label}</strong></div>
            <span>{location.lat.toFixed(3)}, {location.lng.toFixed(3)}</span>
            {!pilotActive && <span className="ep-pilot-note">Live sources follow your search · LifeLines pilot remains in eastern PA</span>}
          </section>

          <aside className="ep-story-panel">
            <div className="ep-panel-eyebrow"><span>Event DNA</span><button onClick={() => setDrawer("sources")}><Info size={14} /></button></div>
            <div className="ep-replay-label">
              {replay ? <><RotateCcw size={13} /> Historical replay · Sep 1, 2021 · not live</> : <><Radio size={13} /> Current source snapshot</>}
            </div>
            <h1>{replay ? "When heavy rain becomes an access crisis" : "What the live sources say here"}</h1>
            <p className="ep-dek">
              {replay ? "Follow an Ida-era flooding pattern through the roads and services people depend on. The sequence is explanatory, not a claim about today."
                : live?.alerts[0]?.headline ?? "No active NWS alert was returned for this point. Infrastructure status is not inferred from silence."}
            </p>
            <div className="ep-impact-sequence">
              <div><span className="ep-sequence-icon rain"><Zap size={15} /></span><p><small>Hazard</small><strong>{replay ? phase.label : `${live?.alerts.length ?? 0} active NWS alerts`}</strong></p></div>
              <div className="ep-sequence-line" />
              <div><span className="ep-sequence-icon road"><Navigation size={15} /></span><p><small>Infrastructure</small><strong>{replay ? "Road access changes" : "Status not inferred"}</strong></p></div>
              <div className="ep-sequence-line" />
              <div><span className="ep-sequence-icon people"><HeartPulse size={15} /></span><p><small>People</small><strong>{replay ? phase.status : "Check local guidance"}</strong></p></div>
            </div>
            <div className="ep-live-facts">
              <div><small>LIVE · EPA AIRNOW</small><strong>{loadingLive ? "…" : live?.air?.aqi != null ? live.air.aqi : "—"}</strong><span>{live?.air?.category ?? "Observation unavailable"}</span></div>
              <div><small>LIVE · NEAREST USGS</small><strong>{loadingLive ? "…" : currentGauge?.gageHeightFt != null ? currentGauge.gageHeightFt.toFixed(2) : "—"}</strong><span>{currentGauge?.gageHeightFt != null ? "gage height · ft" : "No nearby stage value"}</span></div>
              <div><small>LIVE · NWS</small><strong>{loadingLive ? "…" : live?.alerts.length ?? "—"}</strong><span>{live?.alerts.length === 1 ? "active alert" : "active alerts"}</span></div>
            </div>
            <p className="ep-freshness">Live observations refreshed {relativeTime(live?.fetchedAt)}</p>
          </aside>

          <aside className="ep-insight-panel">
            {mode === "explore" && <>
              <div className="ep-panel-eyebrow"><span>Living LifeLines</span><GitBranch size={14} /></div>
              <h2>Access is a network, not a dot</h2>
              <p>Each luminous path connects this place to a critical service. Color reflects the selected replay phase.</p>
              <div className="ep-lifelines">
                <div><Hospital size={16} /><span><strong>Hospital</strong>St. Luke’s University</span><em className={bridgeClosed ? "warn" : "ok"}>{bridgeClosed ? "Rerouted" : "Connected"}</em></div>
                <div><Building2 size={16} /><span><strong>Pharmacy</strong>4th Street</span><em className="ok">Connected</em></div>
                <div><GraduationCap size={16} /><span><strong>School</strong>Broughal Middle</span><em className={timeline > 55 ? "risk" : "ok"}>{timeline > 55 ? "Compromised" : "Connected"}</em></div>
                <div><ShieldCheck size={16} /><span><strong>Fire response</strong>Station 1</span><em className="ok">Connected</em></div>
              </div>
              <button className="ep-text-action" onClick={() => setMode("understand")}>Explain this network <ArrowRight size={15} /></button>
            </>}
            {mode === "understand" && <>
              <div className="ep-panel-eyebrow"><span>Evidence Constellation</span><Microscope size={14} /></div>
              <h2>Why the atlas says this</h2>
              <div className="ep-constellation">
                <div className="ep-core"><Sparkles size={18} /><span>Impact<br />assessment</span></div>
                {evidence.map((node, index) => (
                  <div key={node.label} className={`ep-evidence-node node-${index + 1} ${node.state ? "is-live" : ""}`}>
                    <span>{node.label}</span><small>{node.value}</small>
                  </div>
                ))}
              </div>
              <label className="ep-toggle-row"><span><strong>Uncertainty Fog</strong><small>Reveal where evidence thins out</small></span><input type="checkbox" checked={showFog} onChange={(event) => setShowFog(event.target.checked)} /><i /></label>
              <p className="ep-method-note"><AlertTriangle size={14} /> Fog indicates sparse or unavailable evidence—not safety.</p>
            </>}
            {mode === "simulate" && <>
              <div className="ep-panel-eyebrow"><span>Counterfactual Lab</span><Play size={14} /></div>
              <h2>What if the Fahy Bridge closes?</h2>
              <p>This local network model recalculates the demonstration hospital route. It is not emergency navigation.</p>
              <button className={`ep-scenario-card ${bridgeClosed ? "active" : ""}`} onClick={() => setBridgeClosed((value) => !value)}>
                <span className="ep-scenario-icon"><AlertTriangle size={19} /></span>
                <span><strong>{bridgeClosed ? "Closure applied" : "Close bridge in scenario"}</strong><small>Fahy Bridge · local pilot graph</small></span>
                <span className="ep-scenario-switch"><i /></span>
              </button>
              <div className="ep-delta-grid">
                <div><small>Hospital trip</small><strong>{bridgeClosed ? "+8 min" : "baseline"}</strong><span>{bridgeClosed ? "modeled detour" : "reference route"}</span></div>
                <div><small>LifeLines affected</small><strong>{bridgeClosed ? "1 of 4" : "0 of 4"}</strong><span>pilot network only</span></div>
              </div>
              <div className="ep-sim-disclaimer"><Info size={14} /> Scenario results are deterministic route-graph outputs, not a forecast.</div>
            </>}
          </aside>

          <section className="ep-timeline" aria-label="Event timeline">
            <div className="ep-timeline-top">
              <div className="ep-replay-switch"><button className={!replay ? "active" : ""} onClick={() => setReplay(false)}>Live</button><button className={replay ? "active" : ""} onClick={() => setReplay(true)}>Historical replay</button></div>
              <div className="ep-time-readout"><strong>{replay ? TIMELINE_LABELS[timelineIndex] : "Now"}</strong><span>{replay ? `Sep 1, 2021 · ${String(8 + Math.round(timeline / 7)).padStart(2, "0")}:00` : `Updated ${relativeTime(live?.fetchedAt)}`}</span></div>
              <button className="ep-reset" onClick={() => { setTimeline(10); setBridgeClosed(false); }}><RotateCcw size={14} /> Reset</button>
            </div>
            <div className="ep-track-wrap">
              <div className="ep-phase-labels">{TIMELINE_LABELS.map((label, index) => <span key={label} className={index <= timelineIndex ? "active" : ""}>{label}</span>)}</div>
              <input type="range" min="0" max="100" value={replay ? timeline : 4} disabled={!replay}
                onChange={(event) => setTimeline(Number(event.target.value))}
                style={{ "--progress": `${replay ? timeline : 4}%` } as React.CSSProperties} aria-label="Historical event time" />
            </div>
          </section>
          <button className="ep-ask" onClick={() => setDrawer("ask")}><Sparkles size={17} /><span>Ask Earth</span></button>
          <div className="ep-legend"><span><i className="safe" />Connected</span><span><i className="warn" />Stressed</span><span><i className="risk" />Compromised</span><span><i className="ghost" />Future Ghost</span></div>
        </div>
      ) : (
        <section className="ep-landing">
          <div className="ep-orbit" aria-hidden="true"><div className="ep-orbit-ring ring-one" /><div className="ep-orbit-ring ring-two" /><div className="ep-earth-core"><span /></div></div>
          <div className="ep-hero-copy">
            <div className="ep-kicker"><span /> A living atlas of impact</div>
            <h1>See the chain reaction.<br /><em>Before it reaches you.</em></h1>
            <p>EarthPulse turns hazards into human-scale stories—showing how weather moves through roads, hospitals, schools, and the services a community depends on.</p>
            <div className="ep-hero-actions">
              <button className="ep-primary" onClick={() => setEntered(true)}>Enter the atlas <ArrowRight size={17} /></button>
              <button className="ep-secondary" onClick={() => { setEntered(true); setMode("understand"); }}><BookOpen size={16} /> Replay a real event</button>
            </div>
            <div className="ep-hero-proof"><span><Database size={14} /> Official public sources</span><span><ShieldCheck size={14} /> Evidence before inference</span><span><CircleHelp size={14} /> Uncertainty made visible</span></div>
          </div>
          <button className="ep-location-card" onClick={() => setEntered(true)}>
            <span className="ep-card-pulse"><Crosshair size={17} /></span>
            <span><small>Vertical slice</small><strong>Lehigh Valley, Pennsylvania</strong><em>Flooding · access · critical services</em></span>
            <ArrowRight size={16} />
          </button>
          <div className="ep-scroll-cue"><span /> Scroll the event, not just the map</div>
        </section>
      )}

      {drawer && <div className="ep-drawer-backdrop" onMouseDown={() => setDrawer(null)}>
        <aside className="ep-drawer" onMouseDown={(event) => event.stopPropagation()} aria-label={`${drawer} panel`}>
          <button className="ep-drawer-close" onClick={() => setDrawer(null)}><X size={18} /></button>
          {drawer === "sources" && <>
            <div className="ep-drawer-icon"><Database size={20} /></div><p className="ep-drawer-kicker">Source trail</p>
            <h2>Every live claim keeps its receipt.</h2>
            <p>EarthPulse calls public endpoints from the server, preserves observation time and source status, and shows “unavailable” instead of manufacturing a value.</p>
            <div className="ep-source-list">
              {(live?.sources ?? []).map((source) => <a key={source.id} href={source.url} target="_blank" rel="noreferrer">
                <span className={source.status === "live" ? "source-led" : "source-led offline"} />
                <span><strong>{source.name}</strong><small>{source.status === "live" ? `Connected · checked ${relativeTime(live?.fetchedAt)}` : "Temporarily unavailable"}</small></span><ArrowRight size={15} />
              </a>)}
              {!live && <p>Source status is temporarily unavailable. The atlas will retry when the location changes.</p>}
            </div>
            <div className="ep-source-rule"><ShieldCheck size={16} /><span><strong>Safety rule</strong>Current conditions are never replaced with replay or synthetic values.</span></div>
          </>}
          {drawer === "ask" && <>
            <div className="ep-drawer-icon"><Sparkles size={20} /></div><p className="ep-drawer-kicker">Grounded assistant</p>
            <h2>Ask this place a question.</h2><p>Answers below are assembled only from the sources and pilot network visible in this session.</p>
            <div className="ep-question-list">
              <details open><summary>What is the clearest current signal?<ChevronDown size={15} /></summary><p>{live?.alerts.length ? `The strongest official signal is ${live.alerts[0].event}, issued by the National Weather Service. Open the source trail before acting.` : "The NWS endpoint returned no active alert for this exact point. That does not prove there is no local hazard; check local authorities and the source trail."}</p></details>
              <details><summary>Which access route is most sensitive?<ChevronDown size={15} /></summary><p>In the Lehigh Valley pilot graph, the hospital LifeLine changes when the Fahy Bridge is closed. This is a counterfactual graph result, not verified road status.</p></details>
              <details><summary>Where is uncertainty highest?<ChevronDown size={15} /></summary><p>The gray-violet fog marks the part of the pilot view with thinner evidence coverage. It signals uncertainty, not safety.</p></details>
            </div>
          </>}
          {drawer === "about" && <>
            <div className="ep-drawer-icon"><Activity size={20} /></div><p className="ep-drawer-kicker">Mission & methods</p>
            <h2>From hazard maps to consequence maps.</h2>
            <p>EarthPulse is an explainable geospatial storytelling system. This vertical slice combines live public observations with a clearly labeled historical replay and a small deterministic infrastructure graph.</p>
            <div className="ep-method-steps">
              <div><span>01</span><strong>Observe</strong><p>Fetch official alerts, air observations, gauges, and seismic feeds.</p></div>
              <div><span>02</span><strong>Connect</strong><p>Relate hazards to nearby facilities and access paths without claiming unverified outages.</p></div>
              <div><span>03</span><strong>Explain</strong><p>Keep source provenance, time, and uncertainty visible at decision points.</p></div>
            </div>
            <p className="ep-caution"><AlertTriangle size={15} /> Research prototype. Do not use as emergency navigation or as a substitute for official guidance.</p>
          </>}
        </aside>
      </div>}
    </main>
  );
}
