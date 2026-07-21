"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  ChevronRight,
  CloudSun,
  Database,
  Droplets,
  ExternalLink,
  Flame,
  HeartHandshake,
  Info,
  Map,
  MapPin,
  RefreshCw,
  ShieldCheck,
  ThermometerSun,
  Users,
  Waves,
  Wind,
} from "lucide-react";
import SearchBox, { type PickedPlace } from "@/components/ui/SearchBox";
import type { LocalRiskTier, NwsAlertSummary } from "@/lib/local-risk";

type Reading = {
  code: string;
  label: string;
  value: number;
  unit: string;
  observedAt: string;
  provisional: boolean;
};
type Gauge = {
  siteCode: string;
  name: string;
  distanceKm: number;
  freshness: "fresh" | "recent" | "stale";
  latestObservedAt: string;
  readings: Reading[];
  sourceUrl: string;
};
type HazardStatus = { tier: LocalRiskTier; activeCount: number; summary: string; basis: string };
type LocalRiskData = {
  fetchedAt: string;
  air: {
    tier: LocalRiskTier;
    aqi: number | null;
    category: string | null;
    dominantPollutant: string | null;
    observedAt: string;
    source: { name: string; url?: string | null; status: string; notes?: string | null };
  } | null;
  hazards: {
    flood: HazardStatus;
    heat: HazardStatus;
    severeWeather: HazardStatus;
    fireWeather: HazardStatus;
  };
  alerts: NwsAlertSummary[];
  gauges: {
    status: "live" | "unavailable";
    fetchedAt: string;
    stations: Gauge[];
    sourceUrl: string;
    caveats: string[];
  } | null;
  availability: { air: boolean; alerts: boolean; gauges: boolean };
};
type WaterEvidence = {
  status: string;
  fetchedAt: string;
  surfaceWater: {
    nearbyStations: { id: string; name: string; type: string }[];
    recentSamples: { characteristic: string; date?: string | null }[];
  };
  caveats: string[];
};
type ApiEnvelope<T> = { ok: boolean; data?: T; error?: string };

const DEFAULT_PLACE: PickedPlace = {
  label: "Lehigh University, Bethlehem, PA",
  lat: 40.6068,
  lng: -75.3783,
};

const TIER_STYLE: Record<LocalRiskTier, { border: string; bg: string; text: string; dot: string }> = {
  Low: { border: "border-good/35", bg: "bg-good/5", text: "text-good", dot: "bg-good" },
  Moderate: { border: "border-warning/40", bg: "bg-warning/5", text: "text-warning", dot: "bg-warning" },
  High: { border: "border-serious/45", bg: "bg-serious/5", text: "text-serious", dot: "bg-serious" },
  "Very high": { border: "border-critical/45", bg: "bg-critical/5", text: "text-critical", dot: "bg-critical" },
  "Data unavailable": { border: "border-baseline", bg: "bg-surface-2", text: "text-ink-3", dot: "bg-baseline" },
};

function relativeTime(value: string | null | undefined) {
  if (!value) return "time unavailable";
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return "time unavailable";
  const minutes = Math.round((Date.now() - time) / 60_000);
  if (Math.abs(minutes) < 2) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 2_880) return `${Math.round(minutes / 60)} hr ago`;
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

async function fetchEnvelope<T>(url: string, timeoutMs = 20_000): Promise<T> {
  const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  const body = (await response.json()) as ApiEnvelope<T>;
  if (!response.ok || !body.ok || !body.data) throw new Error(body.error ?? "Data unavailable");
  return body.data;
}

function TierBadge({ tier }: { tier: LocalRiskTier }) {
  const style = TIER_STYLE[tier];
  return (
    <span className={`inline-flex items-center gap-1.5 border px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${style.border} ${style.bg} ${style.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} aria-hidden="true" />
      {tier}
    </span>
  );
}

function RiskCard({
  title,
  tier,
  icon: Icon,
  value,
  summary,
  source,
  updated,
  href,
  limitation,
}: {
  title: string;
  tier: LocalRiskTier;
  icon: React.ComponentType<{ size?: number; className?: string; "aria-hidden"?: boolean }>;
  value: string;
  summary: string;
  source: string;
  updated?: string | null;
  href: string;
  limitation: string;
}) {
  const style = TIER_STYLE[tier];
  return (
    <article className={`panel flex min-h-[230px] flex-col border-t-4 p-4 ${style.border}`} aria-label={`${title}: ${tier}`}>
      <div className="flex items-start justify-between gap-3">
        <span className={`grid h-9 w-9 place-items-center rounded-md ${style.bg} ${style.text}`}>
          <Icon size={18} aria-hidden={true} />
        </span>
        <TierBadge tier={tier} />
      </div>
      <h3 className="mt-3 text-sm font-semibold">{title}</h3>
      <p className="tabular mt-1 text-xl font-semibold leading-tight">{value}</p>
      <p className="mt-2 text-xs leading-relaxed text-ink-2">{summary}</p>
      <div className="mt-auto border-t border-hairline pt-3">
        <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[10px] font-medium text-accent hover:underline">
          {source} <ExternalLink size={10} aria-hidden="true" />
        </a>
        <p className="mt-1 text-[10px] text-ink-3">{updated ? `Updated ${relativeTime(updated)} · ` : ""}{limitation}</p>
      </div>
    </article>
  );
}

function LoadingCards() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-label="Loading environmental conditions">
      {Array.from({ length: 6 }, (_, index) => (
        <div key={index} className="panel h-[230px] animate-pulse bg-surface-2" />
      ))}
    </div>
  );
}

export default function LocalRiskClient() {
  const [place, setPlace] = useState<PickedPlace>(DEFAULT_PLACE);
  const [data, setData] = useState<LocalRiskData | null>(null);
  const [water, setWater] = useState<WaterEvidence | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const coordinates = `lat=${place.lat}&lng=${place.lng}`;
    Promise.allSettled([
      fetchEnvelope<LocalRiskData>(`/api/local-risk/current?${coordinates}`),
      fetchEnvelope<WaterEvidence>(`/api/water/current?${coordinates}`, 25_000),
    ]).then(([riskResult, waterResult]) => {
      if (cancelled) return;
      if (riskResult.status === "fulfilled") {
        setData(riskResult.value);
        setError("");
      } else {
        setData(null);
        setError("Current environmental feeds are temporarily unavailable. Official source links remain available below.");
      }
      setWater(waterResult.status === "fulfilled" ? waterResult.value : null);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [place]);

  const flood = data?.hazards.flood;
  const heat = data?.hazards.heat;
  const weather = data?.hazards.severeWeather;
  const fire = data?.hazards.fireWeather;
  const nearestGauge = data?.gauges?.stations[0] ?? null;
  const stage = nearestGauge?.readings.find((reading) => reading.code === "00065") ?? null;
  const sampleCount = water?.surfaceWater.recentSamples.length ?? 0;
  const stationCount = water?.surfaceWater.nearbyStations.length ?? 0;

  const activeGuidance = useMemo(() => {
    const items: { title: string; body: string; href: string; source: string }[] = [];
    if ((flood?.activeCount ?? 0) > 0) items.push({
      title: "Flood alert is active",
      body: "Follow local evacuation instructions. Move to higher ground when directed, and never walk or drive through floodwater.",
      href: "https://www.ready.gov/floods",
      source: "FEMA",
    });
    if ((heat?.activeCount ?? 0) > 0) items.push({
      title: "Heat alert is active",
      body: "Use air conditioning when possible, drink water regularly, and check children and others who rely on you.",
      href: "https://www.cdc.gov/heat-health/about/",
      source: "CDC",
    });
    if ((data?.air?.aqi ?? 0) > 100) items.push({
      title: "Air quality needs attention",
      body: "Use the official AQI category to adjust outdoor activity. Children, people with asthma, and other sensitive groups may need added precautions.",
      href: "https://www.airnow.gov/aqi-and-health/",
      source: "EPA AirNow",
    });
    if (!items.length) items.push({
      title: "Stay ready for changing conditions",
      body: "No high-priority action is indicated by the feeds currently available here. Keep local alerts enabled and recheck conditions before outdoor plans.",
      href: "https://www.ready.gov/alerts",
      source: "FEMA",
    });
    return items;
  }, [data, flood, heat]);

  function choosePlace(next: PickedPlace) {
    setLoading(true);
    setError("");
    setWater(null);
    setData(null);
    setPlace(next);
  }

  function saveOnDevice() {
    window.localStorage.setItem("pass-local-risk-place", JSON.stringify(place));
    setSaved(true);
  }

  useEffect(() => {
    const raw = window.localStorage.getItem("pass-local-risk-place");
    if (!raw) return;
    try {
      const stored = JSON.parse(raw) as PickedPlace;
      if (typeof stored?.lat === "number" && typeof stored?.lng === "number" && typeof stored?.label === "string") {
        queueMicrotask(() => {
          setPlace(stored);
          setSaved(true);
        });
      }
    } catch {
      window.localStorage.removeItem("pass-local-risk-place");
    }
  }, []);

  return (
    <main className="flex-1 bg-paper">
      <section className="border-b border-hairline bg-surface">
        <div className="mx-auto max-w-7xl px-4 py-7 sm:py-9">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-accent">
                <ShieldCheck size={14} aria-hidden="true" /> Official-source overview
              </div>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">What should I know near me?</h1>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-2">
                A quick view of air quality, flooding, heat, severe weather, fire weather, and nearby water evidence—followed by practical guidance and the source behind every claim.
              </p>
            </div>
            <div className="w-full max-w-xl">
              <label className="mb-1.5 block text-xs font-medium text-ink-2">Search ZIP code, city, address, or place</label>
              <div className="flex gap-2">
                <SearchBox placeholder="Search a location…" onPick={choosePlace} />
                <button type="button" onClick={saveOnDevice} className="shrink-0 rounded-md border border-hairline bg-surface px-3 text-xs font-medium text-ink-2 hover:border-accent hover:text-accent">
                  {saved ? "Saved here" : "Save on device"}
                </button>
              </div>
              <p className="mt-1.5 text-[10px] text-ink-3">Saving is optional and stays in this browser. PASS does not request background location access.</p>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-hairline pt-4 text-xs">
            <span className="inline-flex items-center gap-1.5 font-medium"><MapPin size={14} className="text-accent" aria-hidden="true" />{place.label}</span>
            <span className="text-ink-3">{place.lat.toFixed(3)}, {place.lng.toFixed(3)}</span>
            {data && <span className="inline-flex items-center gap-1 text-ink-3"><RefreshCw size={12} aria-hidden="true" />Checked {relativeTime(data.fetchedAt)}</span>}
            <Link href="/" className="ml-auto inline-flex items-center gap-1 font-medium text-accent hover:underline">Open interactive air map <ChevronRight size={13} /></Link>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 py-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Current or recent conditions</h2>
            <p className="mt-0.5 text-xs text-ink-3">PASS tiers simplify official categories for scanning; each card keeps the original category and limitation.</p>
          </div>
          <Link href="/alerts" className="inline-flex items-center gap-1.5 rounded-md border border-hairline bg-surface px-3 py-2 text-xs font-medium text-ink-2 hover:border-accent hover:text-accent">
            <Bell size={14} aria-hidden="true" /> Manage AQI watch rules
          </Link>
        </div>

        {error && (
          <div role="alert" className="mb-4 flex items-start gap-2 border border-warning/40 bg-warning/5 p-3 text-sm text-ink-2">
            <AlertTriangle size={17} className="mt-0.5 shrink-0 text-warning" aria-hidden="true" />{error}
          </div>
        )}

        {loading ? <LoadingCards /> : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <RiskCard
              title="Air quality"
              tier={data?.air?.tier ?? "Data unavailable"}
              icon={Wind}
              value={data?.air?.aqi != null ? `AQI ${data.air.aqi}` : "No current AQI"}
              summary={data?.air ? `${data.air.category ?? "Category unavailable"}${data.air.dominantPollutant ? ` · Main pollutant: ${data.air.dominantPollutant}` : ""}` : "The official or modeled air-quality feed did not return a usable current value."}
              source={data?.air?.source.name ?? "EPA AirNow"}
              updated={data?.air?.observedAt}
              href={data?.air?.source.url ?? "https://www.airnow.gov/"}
              limitation={data?.air?.source.status === "official" ? "Preliminary public AQI; not a regulatory determination." : "Modeled estimate; not a physical monitor reading."}
            />
            <RiskCard
              title="Flooding"
              tier={flood?.tier ?? "Data unavailable"}
              icon={Waves}
              value={flood ? (flood.activeCount ? `${flood.activeCount} active alert${flood.activeCount === 1 ? "" : "s"}` : "No active alert") : "Feed unavailable"}
              summary={flood?.summary ?? "NWS alerts could not be checked."}
              source="National Weather Service"
              updated={data?.fetchedAt}
              href="https://alerts.weather.gov/"
              limitation="Alert status is point-based; absence of an alert does not rule out street or basement flooding."
            />
            <RiskCard
              title="Heat"
              tier={heat?.tier ?? "Data unavailable"}
              icon={ThermometerSun}
              value={heat ? (heat.activeCount ? `${heat.activeCount} active alert${heat.activeCount === 1 ? "" : "s"}` : "No active alert") : "Feed unavailable"}
              summary={heat?.summary ?? "NWS alerts could not be checked."}
              source="National Weather Service"
              updated={data?.fetchedAt}
              href="https://www.weather.gov/safety/heat"
              limitation="This release uses official heat alerts, not a parcel-level temperature or indoor heat estimate."
            />
            <RiskCard
              title="Severe weather"
              tier={weather?.tier ?? "Data unavailable"}
              icon={CloudSun}
              value={weather ? (weather.activeCount ? `${weather.activeCount} active alert${weather.activeCount === 1 ? "" : "s"}` : "No active alert") : "Feed unavailable"}
              summary={weather?.summary ?? "NWS alerts could not be checked."}
              source="National Weather Service"
              updated={data?.fetchedAt}
              href="https://www.weather.gov/safety/"
              limitation="Warnings can change quickly. Wireless alerts and local emergency management remain primary."
            />
            <RiskCard
              title="Wildfire & smoke"
              tier={fire?.activeCount ? fire.tier : "Data unavailable"}
              icon={Flame}
              value={fire?.activeCount ? `${fire.activeCount} fire-weather alert${fire.activeCount === 1 ? "" : "s"}` : "Attribution unavailable"}
              summary={fire?.activeCount ? fire.summary : "PASS can show AQI and NWS fire-weather alerts, but it does not infer that current pollution is caused by wildfire smoke."}
              source="EPA Fire and Smoke Map"
              updated={data?.fetchedAt}
              href="https://fire.airnow.gov/"
              limitation="Use the linked official smoke map for fire detections, smoke plumes, and sensor context."
            />
            <RiskCard
              title="Water quality evidence"
              tier="Data unavailable"
              icon={Droplets}
              value={water ? `${stationCount} station${stationCount === 1 ? "" : "s"} · ${sampleCount} result${sampleCount === 1 ? "" : "s"}` : "Current risk not determined"}
              summary={water ? "Nearby monitoring evidence was found, but it cannot determine the safety of household tap water or swimming at this exact point." : "The nearby water-quality lookup was unavailable or did not finish in time."}
              source="EPA / USGS Water Quality Portal"
              updated={water?.fetchedAt}
              href="https://www.waterqualitydata.us/"
              limitation="Samples may be historical and are not household tap-water measurements."
            />
          </div>
        )}

        <section className="mt-7 grid gap-5 lg:grid-cols-[1.15fr_.85fr]">
          <div className="panel p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="panel-title">Official alert feed</p>
                <h2 className="mt-1 text-base font-semibold">What agencies are saying now</h2>
              </div>
              <span className="tabular text-2xl font-semibold">{data?.alerts.length ?? "—"}</span>
            </div>
            {!data?.availability.alerts ? (
              <p className="mt-4 border border-warning/40 bg-warning/5 p-3 text-sm text-ink-2">NWS alerts are temporarily unavailable. Check your local emergency-management channels.</p>
            ) : data.alerts.length === 0 ? (
              <div className="mt-4 flex items-start gap-3 border border-good/30 bg-good/5 p-4">
                <CheckCircle2 size={19} className="mt-0.5 shrink-0 text-good" aria-hidden="true" />
                <div><p className="text-sm font-medium">No active NWS alert returned for this point</p><p className="mt-1 text-xs leading-relaxed text-ink-2">This is not an all-clear for every local condition. Continue to monitor weather and local emergency notifications.</p></div>
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                {data.alerts.slice(0, 5).map((alert) => (
                  <article key={alert.id} className="border-l-4 border-warning bg-surface-2 p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div><p className="text-sm font-semibold">{alert.event}</p><p className="mt-0.5 text-xs text-ink-2">{alert.headline}</p></div>
                      <span className="text-[10px] text-ink-3">Severity: {alert.severity} · Certainty: {alert.certainty}</span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-ink-3">
                      {alert.effective && <span>Effective {new Date(alert.effective).toLocaleString()}</span>}
                      {alert.expires && <span>Expires {new Date(alert.expires).toLocaleString()}</span>}
                      <a href={alert.sourceUrl} target="_blank" rel="noreferrer" className="font-medium text-accent hover:underline">Open original alert</a>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>

          <div className="panel p-5">
            <p className="panel-title">Nearby river context</p>
            <h2 className="mt-1 text-base font-semibold">Nearest USGS gauge</h2>
            {nearestGauge ? (
              <div className="mt-4">
                <div className="flex items-start gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-accent-soft text-accent"><Waves size={19} /></span>
                  <div><p className="text-sm font-medium">{nearestGauge.name}</p><p className="mt-0.5 text-[11px] text-ink-3">{nearestGauge.distanceKm} km away · {nearestGauge.freshness} reading</p></div>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <div className="bg-surface-2 p-3"><span className="text-[10px] uppercase tracking-wide text-ink-3">Gage height</span><strong className="tabular mt-1 block text-lg">{stage ? `${stage.value} ${stage.unit}` : "Unavailable"}</strong></div>
                  <div className="bg-surface-2 p-3"><span className="text-[10px] uppercase tracking-wide text-ink-3">Observed</span><strong className="mt-1 block text-sm">{relativeTime(stage?.observedAt ?? nearestGauge.latestObservedAt)}</strong></div>
                </div>
                <p className="mt-3 text-[10px] leading-relaxed text-ink-3">USGS continuous readings are provisional. A gage height alone does not indicate flood stage unless an official threshold is published for that station.</p>
                <a href={nearestGauge.sourceUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline">View station at USGS <ExternalLink size={11} /></a>
              </div>
            ) : (
              <p className="mt-4 text-sm leading-relaxed text-ink-2">No usable real-time USGS station was returned within 50 km. This does not mean waterways are safe.</p>
            )}
          </div>
        </section>

        <section className="mt-7">
          <div className="mb-3"><p className="panel-title">Actionable guidance</p><h2 className="mt-1 text-base font-semibold">What should I do?</h2></div>
          <div className="grid gap-3 md:grid-cols-3">
            {activeGuidance.map((item) => (
              <article key={item.title} className="panel p-4">
                <HeartHandshake size={20} className="text-accent" aria-hidden="true" />
                <h3 className="mt-3 text-sm font-semibold">{item.title}</h3>
                <p className="mt-1.5 text-xs leading-relaxed text-ink-2">{item.body}</p>
                <a href={item.href} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-[10px] font-medium text-accent hover:underline">Guidance from {item.source} <ExternalLink size={10} /></a>
              </article>
            ))}
          </div>
          <p className="mt-3 flex items-start gap-2 text-[11px] leading-relaxed text-ink-3"><Info size={14} className="mt-0.5 shrink-0" />For immediate danger, call 911. PASS supports situational awareness; it does not replace emergency alerts, evacuation orders, clinicians, water utilities, or public-health agencies.</p>
        </section>

        <section className="mt-8 overflow-hidden border border-hairline bg-ink text-surface">
          <div className="grid lg:grid-cols-[.72fr_1.28fr]">
            <div className="bg-[linear-gradient(145deg,#172033,#243c4d)] p-6 sm:p-8">
              <Users size={26} className="text-[#8aa8ff]" aria-hidden="true" />
              <p className="mt-5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#9eb2d3]">Children’s environmental health</p>
              <h2 className="mt-2 text-2xl font-semibold leading-tight">Children are not little adults.</h2>
              <p className="mt-3 text-sm leading-relaxed text-[#c3cddd]">Children breathe more air, drink more water, and eat more food per pound of body weight than adults. Their bodies are still developing, so the same environmental condition can create different concerns.</p>
              <a href="https://www.cdc.gov/environmental-health-tracking/php/data-research/childrens-environmental-health.html" target="_blank" rel="noreferrer" className="mt-5 inline-flex items-center gap-1 text-xs font-medium text-[#a8bfff] hover:underline">CDC children’s environmental health <ExternalLink size={11} /></a>
            </div>
            <div className="grid gap-px bg-[#344056] sm:grid-cols-2">
              {[
                ["Infants and children", "Higher intake relative to body size and developing lungs, brains, and immune systems can increase vulnerability."],
                ["Pregnant people", "Heat, air pollution, and contaminant exposure may require added precautions based on official guidance and clinical advice."],
                ["Asthma and chronic conditions", "Smoke, ozone, particles, heat, and severe weather disruptions may create additional management challenges."],
                ["Caregivers and schools", "Check official alerts before outdoor activity, know medication and emergency plans, and avoid creating fear from uncertain data."],
              ].map(([title, body]) => (
                <div key={title} className="bg-[#172033] p-5"><h3 className="text-sm font-semibold">{title}</h3><p className="mt-2 text-xs leading-relaxed text-[#aebbd0]">{body}</p></div>
              ))}
            </div>
          </div>
        </section>

        <section className="mt-8 mb-4">
          <div className="grid gap-6 lg:grid-cols-[.9fr_1.1fr]">
            <div>
              <p className="panel-title">Trust and verification</p>
              <h2 className="mt-1 text-xl font-semibold">How PASS verifies information</h2>
              <p className="mt-2 text-sm leading-relaxed text-ink-2">PASS is automated and source-grounded. Unlike Watch Duty, we do not operate a trained human reporting desk. We therefore never label an automated result “human verified.”</p>
              <Link href="/methods" className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline">Read full methods and limitations <ChevronRight size={13} /></Link>
            </div>
            <ol className="grid gap-3 sm:grid-cols-2">
              {[
                [Database, "1. Retrieve", "The server requests official public feeds; browsers do not contact agencies directly."],
                [ShieldCheck, "2. Preserve", "Source organization, observation time, status, and original link stay attached to the value."],
                [AlertTriangle, "3. Limit", "Missing data stays unavailable. Modeled estimates and provisional readings are labeled."],
                [Map, "4. Explain", "Plain-language interpretation is separated from the underlying measurement or alert."],
              ].map(([Icon, title, body]) => {
                const StepIcon = Icon as typeof Database;
                return <li key={String(title)} className="panel list-none p-4"><StepIcon size={18} className="text-accent" /><h3 className="mt-2 text-xs font-semibold">{String(title)}</h3><p className="mt-1 text-[11px] leading-relaxed text-ink-2">{String(body)}</p></li>;
              })}
            </ol>
          </div>
        </section>
      </div>
    </main>
  );
}
