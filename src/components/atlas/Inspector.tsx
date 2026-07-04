"use client";

/**
 * Right panel: everything known about the selected location — current air
 * quality, nearest monitor, county context, alert priority, and the full
 * source trail. Tabs keep it dense but navigable.
 */
import { useEffect, useState } from "react";
import { api } from "@/lib/client/api";
import { aqiChip } from "@/lib/client/colors";
import {
  ConfidenceDots,
  LevelChip,
  ScoreBar,
  Section,
  SourceLine,
  Spinner,
  StatusBadge,
} from "@/components/ui/bits";
import type { AirQualitySnapshot, RiskScoreResult, SourceRef } from "@/lib/types";
import type { SelectedLocation } from "./state";

interface ResolveData {
  county: {
    fips: string;
    name: string;
    state: string;
    resolutionMethod: string;
    source: SourceRef;
  } | null;
  nearestMonitor: {
    monitor: { name: string; monitorCode: string; pollutants: string[]; status: string };
    distanceKm: number;
    monitorsWithin25Km: number;
    coverage: string;
    source: SourceRef;
  } | null;
  sparsity: {
    class: "dense" | "moderate" | "sparse" | "remote";
    nearestMonitorKm: number | null;
    dataBasis: string;
    plainLanguage: string;
    confidenceForecast: string;
    metadataStatus: string;
  } | null;
}

const SPARSITY_STYLE: Record<string, string> = {
  dense: "bg-[#d2ecec] text-[#125858]",
  moderate: "bg-[#e0eeee] text-[#1d6363]",
  sparse: "bg-[#faf0cd] text-[#8a6d00]",
  remote: "bg-[#fbe3dc] text-[#a03416]",
};

interface CountyProfile {
  county: { fips: string; name: string; state: string };
  health: Record<string, number | string | null | SourceRef> & { source: SourceRef };
  vulnerability: (Record<string, number | null | SourceRef> & { source: SourceRef }) | null;
  derived: {
    healthBurdenScore: number | null;
    dominantBurden: string | null;
    vulnerabilityScore: number | null;
  };
  disclaimer: string;
}

interface TrailData {
  trail: { field: string; value: string; source: SourceRef }[];
  recentFetches: { sourceName: string; ok: boolean; fetchedAt: string; httpStatus: number | null }[];
  note: string;
}

type Tab = "overview" | "county" | "sources";

const HEALTH_LABELS: Record<string, string> = {
  asthma: "Adult asthma",
  copd: "COPD",
  diabetes: "Diabetes",
  hypertension: "Hypertension",
  heartDisease: "Coronary heart disease",
  obesity: "Obesity",
  cancer: "Cancer (non-skin)",
};

export default function Inspector({
  selected,
  profile,
  onProfileChange,
}: {
  selected: SelectedLocation | null;
  profile: { age: string; conditions: string[] };
  onProfileChange: (p: { age: string; conditions: string[] }) => void;
}) {
  const [tab, setTab] = useState<Tab>("overview");
  const [main, setMain] = useState<{
    key: string;
    aq: AirQualitySnapshot & { servedFromCache: boolean };
    resolve: ResolveData;
    risk: RiskScoreResult;
  } | null>(null);
  const [countyState, setCountyState] = useState<{ key: string; data: CountyProfile } | null>(null);
  const [trailState, setTrailState] = useState<{ key: string; data: TrailData } | null>(null);

  const key = selected
    ? `${selected.lat.toFixed(5)},${selected.lng.toFixed(5)}|${profile.age}|${profile.conditions.join(",")}`
    : null;
  const loading = Boolean(key) && main?.key !== key;
  const aq = main?.key === key ? main.aq : null;
  const resolve = main?.key === key ? main.resolve : null;
  const risk = main?.key === key ? main.risk : null;
  const county = countyState?.key === key ? countyState.data : null;
  const trail = trailState?.key === key ? trailState.data : null;

  useEffect(() => {
    if (!selected || !key || main?.key === key) return;
    let stale = false;
    const { lat, lng } = selected;
    const cond = profile.conditions.join(",");
    const ageQ = profile.age ? `&age=${profile.age}` : "";
    void (async () => {
      try {
        const [aqD, resD, riskD, trailD] = await Promise.all([
          api<AirQualitySnapshot & { servedFromCache: boolean }>(
            `/api/air-quality/current?lat=${lat}&lng=${lng}`
          ),
          api<ResolveData>(`/api/location/resolve?lat=${lat}&lng=${lng}`),
          api<RiskScoreResult>(
            `/api/risk-score?lat=${lat}&lng=${lng}&conditions=${cond}${ageQ}`
          ),
          api<TrailData>(`/api/source-trail?lat=${lat}&lng=${lng}`).catch(() => null),
        ]);
        const countyD = resD.county
          ? await api<CountyProfile>(`/api/county-profile?fips=${resD.county.fips}`).catch(
              () => null
            )
          : null;
        if (stale) return;
        // commit everything at once so a re-run of this effect (triggered by
        // setMain) can't cancel the follow-up fetches
        setMain({ key, aq: aqD, resolve: resD, risk: riskD });
        if (trailD) setTrailState({ key, data: trailD });
        if (countyD) setCountyState({ key, data: countyD });
      } catch {
        /* keep the panel calm; freshness page shows failures */
      }
    })();
    return () => {
      stale = true;
    };
  }, [selected, profile, key, main]);

  if (!selected) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-sm text-ink-3">
        Search for a place or click the map to inspect current conditions, monitor
        coverage, community context, and the source trail behind each number.
      </div>
    );
  }

  const toggleCondition = (c: string) =>
    onProfileChange({
      ...profile,
      conditions: profile.conditions.includes(c)
        ? profile.conditions.filter((x) => x !== c)
        : [...profile.conditions, c],
    });

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-hairline px-3 py-2.5">
        <h2 className="truncate text-sm font-semibold">
          {selected.label ?? `${selected.lat.toFixed(4)}, ${selected.lng.toFixed(4)}`}
        </h2>
        <p className="tabular text-[11px] text-ink-3">
          {selected.lat.toFixed(4)}, {selected.lng.toFixed(4)}
          {resolve?.county && (
            <>
              {" · "}
              {resolve.county.name}, {resolve.county.state}
            </>
          )}
        </p>
        {selected.feature?.kind === "report" && (
          <p className="mt-1 border border-warning/40 bg-[#faf3d7] px-2 py-1 text-[11px] text-[#8a6d00]">
            Community report ({String(selected.feature.properties.reportType)}):{" "}
            {String(selected.feature.properties.note ?? "no note")} — unverified resident
            observation, not an official measurement.
          </p>
        )}
      </div>

      <div className="flex border-b border-hairline text-xs" role="tablist">
        {(["overview", "county", "sources"] as Tab[]).map((tabId) => (
          <button
            key={tabId}
            role="tab"
            aria-selected={tab === tabId}
            onClick={() => setTab(tabId)}
            className={`flex-1 px-2 py-2 font-medium capitalize ${
              tab === tabId
                ? "border-b-2 border-accent text-accent"
                : "text-ink-3 hover:text-ink-2"
            }`}
          >
            {tabId === "sources" ? "Source trail" : tabId}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading && (
          <div className="p-4">
            <Spinner label="Fetching from backend…" />
          </div>
        )}

        {tab === "overview" && !loading && (
          <>
            {aq && (
              <Section title="Current air quality">
                <div className="flex items-end gap-3">
                  <span
                    className="text-3xl font-semibold"
                    style={{ color: aqiChip(aq.usAqi.value) }}
                  >
                    {aq.usAqi.value ?? "—"}
                  </span>
                  <div className="pb-1">
                    <span className="block text-xs font-medium">{aq.category ?? "Unknown"}</span>
                    <span className="block text-[11px] text-ink-3">
                      US AQI (snapshot) · dominant: {aq.dominantPollutant ?? "n/a"}
                    </span>
                  </div>
                </div>
                <dl className="tabular mt-3 grid grid-cols-3 gap-2 text-xs">
                  {(
                    [
                      ["PM2.5", aq.pm25],
                      ["Ozone", aq.ozone],
                      ["NO₂", aq.no2],
                    ] as const
                  ).map(([label, v]) => (
                    <div key={label} className="border border-hairline px-2 py-1.5">
                      <dt className="text-[10px] text-ink-3">{label}</dt>
                      <dd className="font-medium">
                        {v.value ?? "—"}
                        <span className="ml-1 text-[10px] font-normal text-ink-3">{v.unit}</span>
                      </dd>
                    </div>
                  ))}
                </dl>
                <div className="mt-2">
                  <SourceLine source={aq.usAqi.source} />
                </div>
              </Section>
            )}

            {resolve?.nearestMonitor && (
              <Section title="Nearest monitor">
                <p className="text-sm">{resolve.nearestMonitor.monitor.name}</p>
                <p className="tabular mt-0.5 text-xs text-ink-2">
                  {resolve.nearestMonitor.distanceKm} km away ·{" "}
                  {resolve.nearestMonitor.monitor.pollutants.join(", ")} ·{" "}
                  {resolve.nearestMonitor.monitorsWithin25Km} site(s) within 25 km
                </p>
                <p className="mt-1 text-xs">
                  Coverage:{" "}
                  <span
                    className={`font-semibold ${
                      resolve.nearestMonitor.coverage === "good"
                        ? "text-good"
                        : resolve.nearestMonitor.coverage === "partial"
                          ? "text-warning"
                          : "text-serious"
                    }`}
                  >
                    {resolve.nearestMonitor.coverage}
                  </span>
                </p>
                <div className="mt-2">
                  <SourceLine source={resolve.nearestMonitor.source} />
                </div>
              </Section>
            )}

            <Section title="Susceptibility profile">
              <div className="flex flex-wrap items-center gap-1.5">
                {["asthma", "copd", "heart-disease", "diabetes"].map((c) => (
                  <button
                    key={c}
                    onClick={() => toggleCondition(c)}
                    className={`rounded-sm border px-2 py-0.5 text-[11px] ${
                      profile.conditions.includes(c)
                        ? "border-accent bg-accent-soft text-accent"
                        : "border-hairline text-ink-2 hover:border-baseline"
                    }`}
                  >
                    {c}
                  </button>
                ))}
                <input
                  value={profile.age}
                  onChange={(e) =>
                    onProfileChange({ ...profile, age: e.target.value.replace(/\D/g, "").slice(0, 3) })
                  }
                  placeholder="age"
                  className="tabular w-14 border border-hairline px-1.5 py-0.5 text-[11px] outline-none focus:border-accent"
                  aria-label="Age"
                />
              </div>
              <p className="mt-1.5 text-[11px] leading-snug text-ink-3">
                Adjusts the personal-susceptibility weight only. Prevention-focused; not a
                medical assessment.
              </p>
            </Section>

            {aq && risk && resolve && (
              <Section title="Personal exposure story">
                <p className="text-[13px] leading-relaxed">
                  Today this place matters{" "}
                  {profile.conditions.length > 0
                    ? `for someone managing ${profile.conditions.join(", ")}`
                    : "for air-sensitive residents"}{" "}
                  because:
                </p>
                <ul className="mt-2 space-y-1.5">
                  <li>
                    <details>
                      <summary className="cursor-pointer text-[13px]">
                        ▸ PM2.5 is{" "}
                        <span className="font-semibold">
                          {aq.category?.toLowerCase() ?? "unknown"}
                        </span>
                      </summary>
                      <div className="mt-1 border-l-2 border-hairline pl-2 text-[11px] text-ink-2">
                        <p className="tabular">
                          PM2.5 {aq.pm25.value ?? "—"} µg/m³ · US AQI {aq.usAqi.value ?? "—"} —
                          same value used in the researcher score below.
                        </p>
                        <div className="mt-1">
                          <SourceLine source={aq.usAqi.source} />
                        </div>
                      </div>
                    </details>
                  </li>
                  {resolve.sparsity && (
                    <li>
                      <details>
                        <summary className="cursor-pointer text-[13px]">
                          ▸ monitor confidence is{" "}
                          <span className="font-semibold">{resolve.sparsity.class}</span>
                        </summary>
                        <div className="mt-1 border-l-2 border-hairline pl-2 text-[11px] text-ink-2">
                          <p className="tabular">
                            Nearest monitor {resolve.sparsity.nearestMonitorKm ?? "?"} km —{" "}
                            {resolve.sparsity.dataBasis === "ground-anchored"
                              ? "ground-monitor anchored"
                              : "model/satellite estimate only"}
                            . Metadata: {resolve.sparsity.metadataStatus}.
                          </p>
                          <p className="mt-0.5 text-ink-3">{resolve.sparsity.plainLanguage}</p>
                        </div>
                      </details>
                    </li>
                  )}
                  <li>
                    <details>
                      <summary className="cursor-pointer text-[13px]">
                        ▸ community{" "}
                        {profile.conditions[0] ? `${profile.conditions[0]} ` : "health "}burden is{" "}
                        <span className="font-semibold">
                          {risk.healthVulnerability.score >= 60
                            ? "high"
                            : risk.healthVulnerability.score >= 40
                              ? "moderate"
                              : "low"}
                        </span>{" "}
                        here
                      </summary>
                      <div className="mt-1 border-l-2 border-hairline pl-2 text-[11px] text-ink-2">
                        <p className="tabular">
                          County burden score {risk.healthVulnerability.score}/100 — the exact
                          component the researcher score uses. Population context, not a personal
                          prediction.
                        </p>
                        {risk.healthVulnerability.sources[0] && (
                          <div className="mt-1">
                            <SourceLine source={risk.healthVulnerability.sources[0]} />
                          </div>
                        )}
                      </div>
                    </details>
                  </li>
                </ul>
                <p className="mt-2 text-[10px] leading-snug text-ink-3">
                  Same numbers as the score below — plain-language wrapper, not a separate
                  calculation.
                </p>
              </Section>
            )}

            {resolve?.sparsity && (
              <Section title="Why we’re unsure here">
                <span
                  className={`inline-block rounded-sm px-2 py-0.5 text-xs font-semibold ${SPARSITY_STYLE[resolve.sparsity.class]}`}
                >
                  {resolve.sparsity.class} coverage
                </span>
                <p className="mt-1.5 text-xs leading-snug text-ink-2">
                  {resolve.sparsity.plainLanguage}
                </p>
                <p className="mt-1.5 text-[11px] leading-snug text-ink-3">
                  <span className="font-medium text-ink-2">When does this improve? </span>
                  {resolve.sparsity.confidenceForecast}
                </p>
              </Section>
            )}

            {risk && (
              <Section title="Alert priority">
                <div className="flex items-center gap-3">
                  <span className="tabular text-3xl font-semibold">{risk.finalScore}</span>
                  <div>
                    <LevelChip level={risk.level} />
                    <p className="mt-0.5 text-[10px] text-ink-3">0–100 composite</p>
                  </div>
                </div>
                <div className="mt-3 space-y-2.5">
                  <ScoreBar label={`Exposure (×${risk.exposure.weight})`} score={risk.exposure.score} hue="#d0492f" />
                  <ScoreBar
                    label={`Community health (×${risk.healthVulnerability.weight})`}
                    score={risk.healthVulnerability.score}
                    hue="#256abf"
                  />
                  <ScoreBar label={`Equity (×${risk.equity.weight})`} score={risk.equity.score} hue="#6f5cc3" />
                  <ScoreBar
                    label={`Susceptibility (×${risk.susceptibility.weight})`}
                    score={risk.susceptibility.score}
                    hue="#b97b00"
                  />
                  <ScoreBar
                    label="Monitor confidence (reported separately)"
                    score={risk.monitorConfidence.score}
                    hue="#2d8888"
                    detail={risk.monitorConfidence.explanation}
                  />
                </div>
                <p className="mt-2 text-xs leading-snug text-ink-2">{risk.explanation}</p>
                <ul className="mt-2 space-y-1">
                  {risk.caveats.map((c, i) => (
                    <li key={i} className="text-[11px] leading-snug text-ink-3">
                      ▸ {c}
                    </li>
                  ))}
                </ul>
              </Section>
            )}
          </>
        )}

        {tab === "county" && !loading && (
          <>
            {!county && (
              <div className="p-4 text-xs text-ink-3">
                {resolve?.county ? <Spinner label="Loading county profile…" /> : "Not inside a US county."}
              </div>
            )}
            {county && (
              <>
                <Section title={`${county.county.name}, ${county.county.state} — health indicators`}>
                  <table className="tabular w-full text-xs">
                    <tbody>
                      {Object.entries(HEALTH_LABELS).map(([key, label]) => {
                        const v = county.health?.[key];
                        return (
                          <tr key={key} className="border-b border-hairline last:border-0">
                            <td className="py-1 pr-2 text-ink-2">{label}</td>
                            <td className="py-1 text-right font-medium">
                              {typeof v === "number" ? `${v.toFixed(1)}%` : "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <div className="mt-2">
                    {county.health?.source && <SourceLine source={county.health.source} />}
                  </div>
                </Section>
                {county.vulnerability && (
                  <Section title="Vulnerability indicators">
                    <table className="tabular w-full text-xs">
                      <tbody>
                        {(
                          [
                            ["svi", "SVI percentile", ""],
                            ["poverty", "Poverty (≤150% FPL)", "%"],
                            ["elderly", "Age 65+", "%"],
                            ["children", "Age ≤17", "%"],
                            ["disability", "With disability", "%"],
                            ["limitedEnglish", "Limited English", "%"],
                            ["noVehicle", "No vehicle", "%"],
                          ] as const
                        ).map(([key, label, unit]) => {
                          const v = county.vulnerability?.[key];
                          return (
                            <tr key={key} className="border-b border-hairline last:border-0">
                              <td className="py-1 pr-2 text-ink-2">{label}</td>
                              <td className="py-1 text-right font-medium">
                                {typeof v === "number" ? `${v}${unit}` : "—"}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    <div className="mt-2">
                      <SourceLine source={county.vulnerability.source} />
                    </div>
                  </Section>
                )}
                <div className="px-3 py-3 text-[11px] leading-snug text-ink-3">{county.disclaimer}</div>
              </>
            )}
          </>
        )}

        {tab === "sources" && !loading && (
          <>
            {!trail && (
              <div className="p-4">
                <Spinner label="Assembling source trail…" />
              </div>
            )}
            {trail && (
              <>
                <Section title="Source trail">
                  <ul className="space-y-3">
                    {trail.trail.map((t, i) => (
                      <li key={i}>
                        <p className="text-xs font-medium">{t.field}</p>
                        <p className="tabular text-[11px] text-ink-2">{t.value}</p>
                        <div className="mt-1">
                          <SourceLine source={t.source} />
                        </div>
                        {t.source.notes && (
                          <p className="mt-0.5 text-[11px] leading-snug text-ink-3">{t.source.notes}</p>
                        )}
                      </li>
                    ))}
                  </ul>
                </Section>
                <Section title="Recent backend fetches">
                  <table className="tabular w-full text-[11px]">
                    <tbody>
                      {trail.recentFetches.slice(0, 8).map((f, i) => (
                        <tr key={i} className="border-b border-hairline last:border-0">
                          <td className="max-w-[160px] truncate py-1 pr-2 text-ink-2">{f.sourceName}</td>
                          <td className="py-1 pr-2">
                            {f.ok ? (
                              <span className="text-good">ok</span>
                            ) : (
                              <span className="text-critical">fail{f.httpStatus ? ` ${f.httpStatus}` : ""}</span>
                            )}
                          </td>
                          <td className="py-1 text-right text-ink-3">
                            {new Date(f.fetchedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="mt-2 text-[11px] leading-snug text-ink-3">{trail.note}</p>
                </Section>
              </>
            )}
          </>
        )}
      </div>

      <div className="border-t border-hairline px-3 py-1.5 text-[10px] text-ink-3">
        <span className="mr-2 inline-flex items-center gap-1">
          <StatusBadge status="live" /> real-time
        </span>
        <span className="mr-2 inline-flex items-center gap-1">
          <StatusBadge status="fallback" /> synthetic
        </span>
        <span className="inline-flex items-center gap-1">
          <ConfidenceDots confidence="medium" /> confidence
        </span>
      </div>
    </div>
  );
}
