"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  ArrowDownToLine,
  RadioTower,
  MapPin,
  Users,
  Layers,
  ArrowRight,
  BookOpen,
  Search,
  ShieldCheck,
  X,
  ChevronRight,
  Info,
  LocateFixed,
} from "lucide-react";
import SiteHeader from "@/components/SiteHeader";
import { api } from "@/lib/client/api";
import type { AirQualitySnapshot } from "@/lib/types";
import ResearchMap from "./ResearchMap";
import {
  summarize,
  disparityGroups,
  distanceBin,
  DISTANCE_COLORS,
  DISTANCE_LABELS,
  BIVARIATE_COLORS,
  type Tract,
  type TractFeature,
  type Station,
  type ResearchMeta,
} from "./stats";
import "./monitoring-divide.css";
const num = (n: number) => new Intl.NumberFormat("en-US").format(Math.round(n));
const compact = (n: number) =>
  new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(n);
const pct = (n: number) => `${n.toFixed(1)}%`;
const ordinal = (n: number) =>
  `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : n % 10 === 1 ? "st" : n % 10 === 2 ? "nd" : n % 10 === 3 ? "rd" : "th"}`;
const STATES = ["ALL", "PA", "NY", "NJ", "MD", "DE"];
const STATE_CODES: Record<string, string> = {
  PA: "42",
  NY: "36",
  NJ: "34",
  MD: "24",
  DE: "10",
};
const PAPER = "https://pmc.ncbi.nlm.nih.gov/articles/PMC11618472/";
function ExportButton({
  tracts,
  threshold,
  monitors,
}: {
  tracts: Tract[];
  threshold: number;
  monitors: Station[];
}) {
  function download() {
    const fields = [
      "id",
      "state",
      "name",
      "pop",
      "distance",
      "svi",
      "poverty",
      "white",
      "black",
      "hispanic",
      "asian",
      "aian",
      "nhpi",
      "multiracial",
      "other",
    ];
    const quote = (v: unknown) => `"${String(v ?? "").replaceAll('"', '""')}"`;
    const lines = [
      fields
        .concat(
          "nearest_monitor_id",
          "nearest_monitor_name",
          `beyond_${threshold}km`,
        )
        .join(","),
      ...tracts.map((t) =>
        [
          ...fields.map((k) => quote(t[k as keyof Tract])),
          quote(monitors[t.monitor].id),
          quote(monitors[t.monitor].name),
          t.distance > threshold ? "1" : "0",
        ].join(","),
      ),
    ];
    const url = URL.createObjectURL(
      new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `PASS-monitoring-divide-${threshold}km.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <button className="md-export" onClick={download}>
      <ArrowDownToLine size={14} /> Export analysis
    </button>
  );
}
export default function MonitoringDivide() {
  const [features, setFeatures] = useState<TractFeature[]>([]),
    [monitors, setMonitors] = useState<Station[]>([]),
    [meta, setMeta] = useState<ResearchMeta | null>(null),
    [error, setError] = useState("");
  const [state, setState] = useState("ALL"),
    [mode, setMode] = useState("distance"),
    [threshold, setThreshold] = useState(25),
    [highOnly, setHighOnly] = useState(false);
  const [selected, setSelected] = useState<Tract | null>(null),
    [query, setQuery] = useState(""),
    [dimension, setDimension] = useState("race"),
    [metric, setMetric] = useState("share");
  const [air, setAir] = useState<AirQualitySnapshot | null>(null),
    [airState, setAirState] = useState("");
  useEffect(() => {
    let live = true;
    void Promise.all([
      fetch("/research/monitoring-tracts.geojson").then((r) => {
        if (!r.ok) throw Error("Community data unavailable");
        return r.json();
      }),
      fetch("/research/monitoring-meta.json").then((r) => {
        if (!r.ok) throw Error("Monitor metadata unavailable");
        return r.json();
      }),
    ])
      .then(([fc, m]) => {
        if (live) {
          setFeatures(fc.features);
          setMonitors(m.monitors);
          setMeta(m.meta);
        }
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, []);
  const filtered = useMemo(
    () =>
      features.filter(
        (f) =>
          (state === "ALL" || f.properties.state === state) &&
          (!highOnly || (f.properties.svi != null && f.properties.svi >= 0.75)),
      ),
    [features, state, highOnly],
  );
  const tracts = useMemo(() => filtered.map((f) => f.properties), [filtered]);
  const stats = useMemo(
    () => summarize(tracts, threshold),
    [tracts, threshold],
  );
  const groups = useMemo(
    () => disparityGroups(tracts, threshold, dimension),
    [tracts, threshold, dimension],
  );
  const priority = useMemo(
    () =>
      tracts
        .filter((t) => t.svi != null && t.svi >= 0.75 && t.distance > threshold)
        .sort((a, b) => b.pop - a.pop)
        .slice(0, 5),
    [tracts, threshold],
  );
  const select = useCallback(
    (id: string) => {
      const t = features.find((f) => f.properties.id === id)?.properties;
      if (t) {
        setSelected(t);
        setAir(null);
        setAirState("loading");
        setQuery("");
      }
    },
    [features],
  );
  const nearest = selected ? monitors[selected.monitor] : null;
  const regionMonitors = monitors.filter((m) =>
    state === "ALL"
      ? Object.values(STATE_CODES).includes(m.stateCode)
      : m.stateCode === STATE_CODES[state],
  );
  const searchResults =
    query.length >= 2
      ? tracts
          .filter((t) =>
            `${t.name} ${t.id}`.toLowerCase().includes(query.toLowerCase()),
          )
          .slice(0, 5)
      : [];
  const bins = DISTANCE_LABELS.map((label, i) => ({
    label,
    pop: tracts
      .filter((t) => distanceBin(t.distance) === i)
      .reduce((s, t) => s + t.pop, 0),
  }));
  const maxValue = Math.max(
    1,
    ...groups.map((g) => (metric === "share" ? g.share : g.mean)),
  );
  useEffect(() => {
    let current = true;
    if (!selected) return;
    void api<AirQualitySnapshot>(
      `/api/air-quality/current?lat=${selected.lat}&lng=${selected.lng}`,
    )
      .then((a) => {
        if (!current) return;
        if (
          a.pm25.source.status === "fallback" ||
          a.pm25.source.status === "seed" ||
          a.pm25.value == null
        ) {
          setAirState("unavailable");
          return;
        }
        setAir(a);
        setAirState("ready");
      })
      .catch(() => {
        if (current) setAirState("unavailable");
      });
    return () => {
      current = false;
    };
  }, [selected]);
  function changeState(s: string) {
    setState(s);
    setSelected(null);
    setQuery("");
  }
  return (
    <div className="md-page">
      <SiteHeader />
      <main id="main-content" className="md-shell">
        <div className="md-intro">
          <div>
            <div className="md-eyebrow">
              <span /> PASS RESEARCH OBSERVATORY <i>01 / MONITORING EQUITY</i>
            </div>
            <h1>
              The Monitoring <em>Divide.</em>
            </h1>
            <p>
              Air pollution doesn’t stop at a neighborhood boundary.
              <br className="md-desktop" /> Neither should our understanding of
              who gets measured.
            </p>
          </div>
          <div className="md-intro-right">
            <a
              href={PAPER}
              target="_blank"
              rel="noreferrer"
              className="md-paper-link"
            >
              <BookOpen size={16} />
              <span>
                Inspired by Kelly et al.<small>JAMA Network Open · 2024</small>
              </span>
              <ArrowUpRight size={16} />
            </a>
            <div className="md-data-pill">
              <ShieldCheck size={12} /> EPA AQS · Census ACS · CDC SVI
            </div>
          </div>
        </div>
        <div className="md-region-strip">
          <div className="md-region-buttons" aria-label="Study region">
            {STATES.map((s) => (
              <button
                key={s}
                onClick={() => changeState(s)}
                className={state === s ? "active" : ""}
              >
                {s === "ALL" ? "Five-state region" : s}
              </button>
            ))}
          </div>
          <span className="md-resolution">
            <span /> Population-weighted tract centers · 2018–2022 ACS
          </span>
        </div>
        {error ? (
          <div className="md-error">
            {error}.{" "}
            <button onClick={() => window.location.reload()}>
              Retry loading the official research snapshot
            </button>
          </div>
        ) : !meta ? (
          <div className="md-loading">
            <RadioTower size={24} />
            <span>Assembling the five-state monitoring study…</span>
          </div>
        ) : (
          <>
            <section
              className="md-stats"
              aria-label="Calculated research findings"
            >
              <Stat
                icon={<Users size={16} />}
                label="PEOPLE IN THIS ANALYSIS"
                value={compact(stats.population)}
                detail={`${num(tracts.length)} inhabited census tracts`}
              />
              <Stat
                icon={<RadioTower size={16} />}
                label="RECENTLY REPORTING PM₂.₅ SITES"
                value={num(regionMonitors.length)}
                detail={`${num(meta.referenceMonitorSites)} U.S. sites considered for distance`}
              />
              <Stat
                icon={<LocateFixed size={16} />}
                label="MEDIAN DISTANCE, WEIGHTED BY PEOPLE"
                value={stats.median == null ? "—" : stats.median.toFixed(1)}
                unit="km"
                detail="From tract population center to nearest site"
              />
              <Stat
                icon={<MapPin size={16} />}
                label="POTENTIAL DOUBLE DISADVANTAGE"
                value={compact(stats.underserved)}
                detail={`People >${threshold} km away & SVI ≥75th percentile`}
                accent
              />
            </section>
            <section className="md-map-section" aria-labelledby="map-title">
              <div className="md-section-top">
                <div>
                  <div className="md-eyebrow">
                    01 — THE GEOGRAPHY OF COVERAGE
                  </div>
                  <h2 id="map-title">
                    How far is a community from being measured?
                  </h2>
                </div>
                <ExportButton
                  tracts={tracts}
                  threshold={threshold}
                  monitors={monitors}
                />
              </div>
              <div className="md-map-controls">
                <div className="md-segments" aria-label="Map view">
                  {[
                    ["distance", "Monitor distance"],
                    ["double", "Double disadvantage"],
                    ["support", "PASS spatial support"],
                  ].map(([v, l]) => (
                    <button
                      key={v}
                      onClick={() => setMode(v)}
                      className={mode === v ? "active" : ""}
                    >
                      <Layers size={13} />
                      {l}
                    </button>
                  ))}
                </div>
                <label className="md-check">
                  <input
                    type="checkbox"
                    checked={highOnly}
                    onChange={(e) => {
                      setHighOnly(e.target.checked);
                      setSelected(null);
                    }}
                  />{" "}
                  High vulnerability only <span>SVI ≥ 0.75</span>
                </label>
              </div>
              <div className="md-map-frame">
                <ResearchMap
                  features={filtered}
                  monitors={monitors}
                  selected={selected}
                  mode={mode}
                  state={state}
                  onSelect={select}
                />
                <div className="md-search">
                  <Search size={15} />
                  <input
                    aria-label="Find a community by county or tract ID"
                    placeholder="Find a county or census tract…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                  {query && (
                    <button
                      aria-label="Clear search"
                      onClick={() => setQuery("")}
                    >
                      <X size={14} />
                    </button>
                  )}
                  {query.length >= 2 && (
                    <div className="md-search-results">
                      {searchResults.length ? (
                        searchResults.map((t) => (
                          <button key={t.id} onClick={() => select(t.id)}>
                            {t.name}
                            <span>{t.distance.toFixed(1)} km</span>
                          </button>
                        ))
                      ) : (
                        <p>No matching tracts in the current filters.</p>
                      )}
                    </div>
                  )}
                </div>
                <aside
                  className="md-inspector"
                  aria-label="Community inspector"
                >
                  {selected && nearest ? (
                    <>
                      <div className="md-inspector-head">
                        <span>
                          <MapPin size={12} /> COMMUNITY PROFILE
                        </span>
                        <button
                          onClick={() => setSelected(null)}
                          aria-label="Close community profile"
                        >
                          <X size={15} />
                        </button>
                      </div>
                      <h3>{selected.name.split(/[;,]/)[0]}</h3>
                      <p className="md-muted">
                        {selected.name.split(/[;,]/).slice(1).join(",")}
                      </p>
                      <div className="md-inspector-distance">
                        {selected.distance.toFixed(1)}
                        <span>km to nearest PM₂.₅ site</span>
                      </div>
                      <div className="md-connection-card">
                        <RadioTower size={17} />
                        <div>
                          <strong>{nearest.name}</strong>
                          <small>
                            {nearest.id} · {nearest.state}
                          </small>
                          <small>
                            Last reported sample: {nearest.lastSample}
                          </small>
                        </div>
                      </div>
                      <dl className="md-profile-grid">
                        <div>
                          <dt>Residents</dt>
                          <dd>{num(selected.pop)}</dd>
                        </div>
                        <div>
                          <dt>SVI percentile</dt>
                          <dd>
                            {selected.svi == null
                              ? "Unavailable"
                              : ordinal(Math.round(selected.svi * 100))}
                          </dd>
                        </div>
                        <div>
                          <dt>Below 150% FPL</dt>
                          <dd>
                            {selected.poverty == null
                              ? "—"
                              : pct(selected.poverty)}
                          </dd>
                        </div>
                        <div>
                          <dt>Spatial support</dt>
                          <dd>
                            {selected.distance <= 10
                              ? "Nearby"
                              : selected.distance <= 25
                                ? "Partial"
                                : "Sparse / remote"}
                          </dd>
                        </div>
                      </dl>
                      <div className="md-demographics">
                        <span>ACS POPULATION COMPOSITION</span>
                        {[
                          ["Black, non-Hispanic", selected.black],
                          ["Hispanic / Latino", selected.hispanic],
                          ["Asian, non-Hispanic", selected.asian],
                          ["White, non-Hispanic", selected.white],
                        ].map(([l, n]) => (
                          <div key={String(l)}>
                            <span>{l}</span>
                            <strong>
                              {n == null
                                ? "—"
                                : pct((100 * Number(n)) / selected.pop)}
                            </strong>
                          </div>
                        ))}
                      </div>
                      <a className="md-inspector-cta" href="#pass-support">
                        Explore PASS estimated information{" "}
                        <ArrowRight size={14} />
                      </a>
                    </>
                  ) : (
                    <>
                      <div className="md-inspector-head">
                        <span>
                          <MapPin size={12} /> EXPLORE A COMMUNITY
                        </span>
                      </div>
                      <h3>
                        Every community
                        <br />
                        deserves to be seen.
                      </h3>
                      <p>
                        Click a census tract to trace its connection to the
                        nearest PM₂.₅ monitor, including sites across state
                        lines.
                      </p>
                      <div className="md-priority-label">
                        START WITH A COVERAGE GAP
                      </div>
                      {priority.slice(0, 3).map((t) => (
                        <button
                          className="md-priority-link"
                          key={t.id}
                          onClick={() => select(t.id)}
                        >
                          <div>
                            <strong>
                              {t.name.split(/[;,]/).slice(0, 2).join(",")}
                            </strong>
                            <small>
                              {num(t.pop)} people · SVI{" "}
                              {ordinal(Math.round((t.svi ?? 0) * 100))}{" "}
                              percentile
                            </small>
                          </div>
                          <span>
                            {t.distance.toFixed(0)}
                            <small>km</small>
                          </span>
                          <ChevronRight size={13} />
                        </button>
                      ))}
                      {!priority.length && (
                        <p>
                          No tracts meet both priority criteria in these
                          filters.
                        </p>
                      )}
                      <div className="md-inspector-note">
                        <Info size={13} /> Distance describes proximity, not the
                        accuracy of a nearby reading.
                      </div>
                    </>
                  )}
                </aside>
                <div
                  className={`md-map-legend ${mode === "double" ? "bivariate" : ""}`}
                >
                  {mode === "double" ? (
                    <>
                      <div className="md-legend-heading">
                        VULNERABILITY × DISTANCE
                      </div>
                      <div className="md-bivariate">
                        <span className="md-y-axis">SVI ↑</span>
                        <div>
                          {[2, 1, 0].flatMap((y) =>
                            [0, 1, 2].map((x) => (
                              <i
                                key={`${x}-${y}`}
                                style={{
                                  background: BIVARIATE_COLORS[y * 3 + x],
                                }}
                                title={`SVI ${y === 2 ? "≥75th" : y === 1 ? "50th–75th" : "<50th"} percentile, distance ${x === 0 ? "≤10" : x === 1 ? "10–25" : ">25"} km`}
                              />
                            )),
                          )}
                        </div>
                        <span className="md-biv-text">
                          Darker purple:
                          <br />
                          farther + more vulnerable
                          <small>
                            SVI: &lt;50 / 50–75 / ≥75th percentile
                            <br />
                            Distance: ≤10 / 10–25 / &gt;25 km
                          </small>
                        </span>
                        <span className="md-x-axis">Distance →</span>
                      </div>
                      <small>Gray = SVI unavailable</small>
                    </>
                  ) : mode === "support" ? (
                    <>
                      <div className="md-legend-heading">
                        PROXIMITY SUPPORT HEURISTIC
                      </div>
                      {[
                        ["#89c7c4", "Nearby · ≤10 km"],
                        ["#c9b87c", "Partial · 10–25 km"],
                        ["#a187c1", "Sparse / remote · >25 km"],
                      ].map(([c, l]) => (
                        <span className="md-legend-row" key={l}>
                          <i style={{ background: c }} />
                          {l}
                        </span>
                      ))}
                      <small>Not a calibrated uncertainty estimate</small>
                    </>
                  ) : (
                    <>
                      <div className="md-legend-heading">
                        DISTANCE TO NEAREST SITE
                      </div>
                      <div className="md-distance-legend">
                        {DISTANCE_LABELS.map((l, i) => (
                          <span key={l}>
                            <i style={{ background: DISTANCE_COLORS[i] }} />
                            {l}
                          </span>
                        ))}
                      </div>
                    </>
                  )}
                  <div className="md-station-key">
                    <i /> EPA AQS PM₂.₅ station · recent-reporting proxy
                  </div>
                </div>
              </div>
              <div className="md-map-footer">
                <span>
                  <ShieldCheck size={12} /> Physical station locations ·
                  precomputed great-circle distance
                </span>
                <span>
                  EPA metadata: {meta.monitorExtractionDate} · ACS/SVI: 2022 ·
                  Population centers: 2020
                </span>
              </div>
            </section>
            <section className="md-analysis" aria-labelledby="disparity-title">
              <div className="md-section-top">
                <div>
                  <div className="md-eyebrow">02 — WHO IS BEING LEFT OUT?</div>
                  <h2 id="disparity-title">
                    The same network. Different distances.
                  </h2>
                </div>
                <span className="md-caption">
                  Descriptive comparisons · weighted by residents
                </span>
              </div>
              <div className="md-threshold-panel">
                <div>
                  <span className="md-threshold-label">
                    DEFINE A MONITORING GAP
                  </span>
                  <p>
                    Living farther than <strong>{threshold} km</strong> from a
                    recently reporting site
                  </p>
                </div>
                <div className="md-slider">
                  <input
                    type="range"
                    aria-label="Monitoring distance threshold in kilometers"
                    min={5}
                    max={75}
                    step={1}
                    value={threshold}
                    onChange={(e) => setThreshold(Number(e.target.value))}
                  />
                  <div>
                    <span>5 km</span>
                    <span>25 km</span>
                    <span>50 km</span>
                    <span>75 km</span>
                  </div>
                </div>
                <div className="md-threshold-result">
                  <strong>{pct(stats.share)}</strong>
                  <span>
                    {num(stats.beyond)} residents beyond {threshold} km
                  </span>
                </div>
              </div>
              <div className="md-chart-grid">
                <div className="md-chart-card">
                  <div className="md-chart-controls">
                    <div className="md-small-tabs">
                      {[
                        ["race", "Race / ethnicity"],
                        ["poverty", "Poverty context"],
                        ["state", "State"],
                      ].map(([v, l]) => (
                        <button
                          key={v}
                          className={dimension === v ? "active" : ""}
                          onClick={() => setDimension(v)}
                        >
                          {l}
                        </button>
                      ))}
                    </div>
                    <select
                      aria-label="Disparity chart metric"
                      value={metric}
                      onChange={(e) => setMetric(e.target.value)}
                    >
                      <option value="share">% beyond {threshold} km</option>
                      <option value="mean">Mean distance (km)</option>
                    </select>
                  </div>
                  <h3>
                    {metric === "share"
                      ? `Who lives beyond ${threshold} km?`
                      : "How far away is the nearest site?"}
                  </h3>
                  <p>
                    {dimension === "poverty"
                      ? "Residents grouped by the share of their tract below 150% of the federal poverty level."
                      : dimension === "race"
                        ? "Each group’s residents weight the distance of their census tract."
                        : "Each state’s residents weight the distance of their census tract."}
                  </p>
                  <div className="md-bars">
                    {groups.map((g) => (
                      <div
                        className="md-bar-row"
                        key={g.label}
                        title={`${num(g.population)} residents; mean distance ${g.mean.toFixed(2)} km; ${g.share.toFixed(2)}% beyond ${threshold} km`}
                      >
                        <div className="md-bar-title">
                          <span>{g.label}</span>
                          <strong>
                            {metric === "share"
                              ? pct(g.share)
                              : `${g.mean.toFixed(1)} km`}
                          </strong>
                        </div>
                        <div className="md-bar-track">
                          <div
                            style={{
                              width: `${((metric === "share" ? g.share : g.mean) / maxValue) * 100}%`,
                            }}
                          />
                        </div>
                        <small>{compact(g.population)} residents</small>
                      </div>
                    ))}
                  </div>
                  <div className="md-chart-note">
                    Race categories are mutually exclusive; all race groups
                    except Hispanic / Latino are non-Hispanic. ACS sampling
                    uncertainty is not propagated. These unadjusted distances do
                    not account for rural/urban population distribution or
                    monitor representativeness.
                  </div>
                </div>
                <div className="md-chart-card md-distribution">
                  <div className="md-eyebrow">THE DISTANCE DISTRIBUTION</div>
                  <h3>People, not square kilometers.</h3>
                  <p>
                    A large remote tract can dominate a map. This chart shows
                    where the population actually lives.
                  </p>
                  <div className="md-stacked-bar">
                    {bins.map((b, i) => (
                      <div
                        key={b.label}
                        style={{
                          width: `${stats.population ? (100 * b.pop) / stats.population : 0}%`,
                          background: DISTANCE_COLORS[i],
                        }}
                        title={`${b.label}: ${num(b.pop)} residents`}
                      />
                    ))}
                  </div>
                  <div className="md-distribution-list">
                    {bins.map((b, i) => (
                      <div key={b.label}>
                        <span>
                          <i style={{ background: DISTANCE_COLORS[i] }} />
                          {b.label}
                        </span>
                        <strong>
                          {stats.population
                            ? pct((100 * b.pop) / stats.population)
                            : "0%"}
                        </strong>
                        <small>{num(b.pop)}</small>
                      </div>
                    ))}
                  </div>
                  <div className="md-finding">
                    <span>IN THIS SELECTION</span>
                    <strong>{compact(stats.underserved)} residents</strong>
                    <p>
                      live in high-vulnerability tracts (SVI ≥0.75) more than{" "}
                      {threshold} km from the nearest site. These are candidates
                      for closer investigation, not a validated ranking of
                      monitoring need.
                    </p>
                  </div>
                  <p className="md-source-note">
                    Changing state, vulnerability filter, or threshold updates
                    these findings and the comparison charts.
                  </p>
                </div>
              </div>
            </section>
            <section id="pass-support" className="md-pass-section">
              <div>
                <div className="md-eyebrow">03 — CLOSING THE GAP WITH PASS</div>
                <h2>
                  A gap in monitors shouldn’t
                  <br />
                  be a gap in information.
                </h2>
                <p>
                  PASS can supply modeled PM₂.₅ context where physical stations
                  are sparse. Model estimates complement observations; they do
                  not create a local measurement.
                </p>
                <p className="md-source-note">
                  This study uses AQS PM₂.₅ parameter 88101. Other Atlas views
                  may include additional AirNow sites, so their monitoring
                  distances can differ.
                </p>
                <Link
                  href={
                    selected
                      ? `/?lat=${selected.lat}&lng=${selected.lng}&label=${encodeURIComponent(selected.name)}`
                      : "/"
                  }
                  className="md-link-button"
                >
                  Open the PASS air map <ArrowUpRight size={16} />
                </Link>
              </div>
              <div className="md-pass-card">
                <div className="md-pass-card-top">
                  <RadioTower size={17} />
                  <span>PHYSICAL MONITORING</span>
                  <strong>
                    {selected
                      ? `${selected.distance.toFixed(1)} km`
                      : "Select a tract"}
                  </strong>
                </div>
                <div className="md-pass-card-top">
                  <Layers size={17} />
                  <span>PASS MODEL ESTIMATE</span>
                  <strong>
                    {!selected
                      ? "Select a tract"
                      : airState === "loading"
                        ? "Loading…"
                        : air && air.pm25.value != null
                          ? `${air.pm25.value.toFixed(1)} µg/m³`
                          : "Unavailable"}
                  </strong>
                </div>
                {air && selected ? (
                  <p className="md-source-note">
                    {air.pm25.source.name} · {air.pm25.source.status}
                    <br />
                    Source vintage: {air.pm25.source.vintage || "Unavailable"}
                    <br />
                    Retrieved: {air.pm25.source.fetchedAt || "Unavailable"}
                    <br />
                    Separate PM₂.₅ estimate valid time: unavailable.
                  </p>
                ) : (
                  <p className="md-source-note">
                    Select a community on the map to request its existing PASS
                    PM₂.₅ estimate. Synthetic fallbacks are suppressed in this
                    research view.
                  </p>
                )}
                <div className="md-pass-boundary">
                  <Info size={15} />
                  <p>
                    <strong>Uncertainty remains visible.</strong> Proximity
                    classes use PASS’s 10/25 km heuristic. Calibrated prediction
                    intervals and local validation errors are unavailable;
                    distance is not converted into an accuracy score.
                  </p>
                </div>
              </div>
            </section>
            <section id="research-methods" className="md-methods">
              <div className="md-section-top">
                <div>
                  <div className="md-eyebrow">04 — RESEARCH & METHODOLOGY</div>
                  <h2>Evidence you can inspect.</h2>
                </div>
                <a href={PAPER} target="_blank" rel="noreferrer">
                  Read the inspiration <ArrowUpRight size={14} />
                </a>
              </div>
              <div className="md-method-grid">
                <article>
                  <span>01</span>
                  <h3>Inspired by a national study.</h3>
                  <p>
                    Kelly et al. examined racial and ethnic disparities in
                    regulatory monitoring using AQS sites, 2022 ACS block
                    groups, monitor-specific coverage buffers, and
                    population-adjusted spatial models. This PASS extension is a
                    descriptive PM₂.₅ proximity analysis, not a replication of
                    their adjusted estimates.
                  </p>
                  <a href={PAPER} target="_blank" rel="noreferrer">
                    JAMA Network Open · 2024;7(12):e2449005 ↗
                  </a>
                </article>
                <article>
                  <span>02</span>
                  <h3>Official data. Explicit vintages.</h3>
                  <p>
                    CDC’s nationally ranked 2022 tract SVI includes 2018–2022
                    ACS population and mutually exclusive demographic counts.
                    Locations use 2020 Census population-weighted tract centers.
                    Zero-population tracts and unmatched centers are excluded;
                    missing SVI stays missing.
                  </p>
                  <a
                    href="https://www.atsdr.cdc.gov/place-health/php/svi/svi-data-documentation-download.html"
                    target="_blank"
                    rel="noreferrer"
                  >
                    CDC SVI & ACS documentation ↗
                  </a>
                  <a
                    href="https://www.census.gov/geographies/reference-files/2020/geo/2020-centers-population.html"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Census population centers ↗
                  </a>
                </article>
                <article>
                  <span>03</span>
                  <h3>Across borders, without shortcuts.</h3>
                  <p>
                    For every tract center, compute great-circle distance (Earth
                    radius 6,371.0088 km) to every eligible U.S. AQS PM₂.₅ site.
                    Parameter 88101; collocated instruments count once per site;
                    known-closed sites are excluded. “Active” is a proxy: at
                    least one reported sample since {meta.monitorCutoff}, using
                    the {meta.monitorExtractionDate} archive.
                  </p>
                  <a
                    href="https://aqs.epa.gov/aqsweb/airdata/download_files.html"
                    target="_blank"
                    rel="noreferrer"
                  >
                    EPA AQS monitor metadata ↗
                  </a>
                </article>
                <article>
                  <span>04</span>
                  <h3>Weight by people. Interpret with care.</h3>
                  <p>
                    Group mean = Σ(group population × tract distance) / Σ(group
                    population). Beyond-threshold share uses group residents in
                    tracts farther than the chosen distance. The median is
                    population-weighted. All residents within a tract share its
                    center’s distance; mixed source vintages and ACS error limit
                    precision.
                  </p>
                  <a href="/research/monitoring-methodology.md" target="_blank">
                    Download full methods & provenance ↗
                  </a>
                </article>
              </div>
              <div className="md-limitations">
                <Info size={18} />
                <p>
                  <strong>Proximity is an indicator, not a verdict.</strong>{" "}
                  Distance does not establish exposure accuracy, air-mass
                  representativeness, inequitable siting intent, or a causal
                  health effect. Terrain, monitor scale, network purpose,
                  sampling schedule, and wind matter. This descriptive analysis
                  has no population-adjusted regression, significance tests, or
                  model training. “Double disadvantage” means high SVI and
                  distance only.
                </p>
              </div>
              <div className="md-audit-line">
                <span>
                  {num(meta.excluded.zeroPopulation || 0)} zero-population
                  tracts excluded · {num(meta.excluded.noPopulationCenter || 0)}{" "}
                  unmatched centers excluded ·{" "}
                  {num(meta.excluded.sviUnavailable || 0)} analyzed tracts have
                  no SVI
                </span>
                <a href="/research/monitoring-meta.json" target="_blank">
                  Inspect snapshot metadata ↗
                </a>
              </div>
            </section>
            <footer className="md-footer">
              <span>
                PASS <b>Equity Atlas</b> / The Monitoring Divide
              </span>
              <span>
                Measured locations. Transparent estimates. Better questions.
              </span>
            </footer>
          </>
        )}
      </main>
    </div>
  );
}
function Stat({
  icon,
  label,
  value,
  unit,
  detail,
  accent = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  unit?: string;
  detail: string;
  accent?: boolean;
}) {
  return (
    <div className={`md-stat ${accent ? "md-stat-accent" : ""}`}>
      <div className="md-stat-label">
        {icon}
        <span>{label}</span>
      </div>
      <strong>
        {value}
        <span>{unit}</span>
      </strong>
      <p>{detail}</p>
    </div>
  );
}
