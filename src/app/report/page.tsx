"use client";

/**
 * Patient-facing report: enter location + age + conditions, get a clear
 * "safe to go out?" verdict with prevention measures, and print / download it.
 * Uses the same transparent /api/risk-score engine and honest data labels.
 */
import { useState } from "react";
import SiteHeader from "@/components/SiteHeader";
import SearchBox, { type PickedPlace } from "@/components/ui/SearchBox";
import { Section, SourceLine, ScoreBar, Spinner, LevelChip } from "@/components/ui/bits";
import { api } from "@/lib/client/api";
import { outdoorAdvice, isSensitive, type OutdoorAdvice } from "@/lib/advice";
import type { RiskScoreResult } from "@/lib/types";

const CONDITIONS = [
  { value: "asthma", label: "Asthma" },
  { value: "copd", label: "COPD" },
  { value: "heart-disease", label: "Heart disease" },
  { value: "diabetes", label: "Diabetes" },
  { value: "hypertension", label: "Hypertension" },
  { value: "pregnancy", label: "Pregnancy" },
];

const VERDICT_STYLE: Record<OutdoorAdvice["verdict"], { bg: string; ring: string; text: string; icon: string }> = {
  safe: { bg: "#e8f6ea", ring: "#0ca30c", text: "#14671a", icon: "✓" },
  "ok-sensitive-care": { bg: "#fbf3d9", ring: "#b97b00", text: "#7a5600", icon: "◑" },
  reduce: { bg: "#fbe9db", ring: "#c05621", text: "#8a3d16", icon: "!" },
  avoid: { bg: "#fbdede", ring: "#d03b3b", text: "#8f2222", icon: "✕" },
  "stay-in": { bg: "#f7dce0", ring: "#a3123a", text: "#7a0f2c", icon: "⛔" },
};

interface ReportData {
  place: PickedPlace;
  age: number | null;
  conditions: string[];
  risk: RiskScoreResult;
  advice: OutdoorAdvice;
  aqi: number | null;
}

export default function ReportPage() {
  const [place, setPlace] = useState<PickedPlace | null>(null);
  const [age, setAge] = useState("");
  const [conditions, setConditions] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<ReportData | null>(null);

  function toggle(v: string) {
    setConditions((c) => (c.includes(v) ? c.filter((x) => x !== v) : [...c, v]));
  }

  async function generate() {
    if (!place) return;
    setBusy(true);
    setError(null);
    try {
      const ageNum = age.trim() ? Math.max(0, Math.min(120, parseInt(age, 10))) : null;
      const qs = new URLSearchParams({
        lat: String(place.lat),
        lng: String(place.lng),
        conditions: conditions.join(","),
      });
      if (ageNum != null && !Number.isNaN(ageNum)) qs.set("age", String(ageNum));
      const risk = await api<RiskScoreResult>(`/api/risk-score?${qs.toString()}`);
      const aqi = (risk.exposure.inputs.usAqi as number | null) ?? null;
      const provisional = risk.exposure.sources.some((s) => s.status === "fallback");
      const advice = outdoorAdvice(aqi, isSensitive(ageNum, conditions), conditions, provisional);
      setReport({ place, age: ageNum, conditions, risk, advice, aqi });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate the report.");
    } finally {
      setBusy(false);
    }
  }

  function downloadHtml() {
    if (!report) return;
    const html = buildReportHtml(report);
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const slug = report.place.label.replace(/[^a-z0-9]+/gi, "-").slice(0, 40).toLowerCase();
    a.href = url;
    a.download = `air-health-report-${slug}.html`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex h-dvh flex-col">
      <SiteHeader />
      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto grid max-w-5xl gap-6 px-4 py-6 md:grid-cols-[320px_1fr]">
          {/* Form */}
          <div className="no-print">
            <div className="panel overflow-hidden">
              <div className="accent-gradient px-4 py-3 text-white">
                <h1 className="text-base font-semibold leading-tight">Personal Air-Health Report</h1>
                <p className="mt-0.5 text-[11px] text-white/80">
                  Enter your details to see if it&rsquo;s safe to go outside today, with steps to take.
                </p>
              </div>
              <div className="space-y-4 p-4">
                <div>
                  <label className="panel-title mb-1 block">Location</label>
                  <SearchBox placeholder="Your city, county, or address…" onPick={setPlace} />
                  {place && (
                    <p className="mt-1 text-xs text-ink-2">
                      📍 {place.label}
                    </p>
                  )}
                </div>

                <div>
                  <label className="panel-title mb-1 block">Age (optional)</label>
                  <input
                    value={age}
                    onChange={(e) => setAge(e.target.value.replace(/[^0-9]/g, ""))}
                    inputMode="numeric"
                    placeholder="e.g. 58"
                    className="w-full rounded-lg border border-hairline bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-accent"
                  />
                </div>

                <div>
                  <label className="panel-title mb-1.5 block">Health conditions</label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {CONDITIONS.map((c) => (
                      <label
                        key={c.value}
                        className={`flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs transition ${
                          conditions.includes(c.value)
                            ? "border-accent bg-accent-soft text-accent"
                            : "border-hairline text-ink-2 hover:bg-surface-2"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={conditions.includes(c.value)}
                          onChange={() => toggle(c.value)}
                          className="h-3.5 w-3.5 accent-[var(--color-accent)]"
                        />
                        {c.label}
                      </label>
                    ))}
                  </div>
                </div>

                <button
                  onClick={generate}
                  disabled={!place || busy}
                  className="btn-accent w-full py-2 text-sm font-semibold disabled:opacity-40"
                >
                  {busy ? "Generating…" : "Generate my report"}
                </button>
                {!place && <p className="text-[11px] text-ink-3">Pick a location to begin.</p>}
                {busy && <Spinner label="Checking current air quality…" />}
                {error && <p className="text-xs text-critical">{error}</p>}
              </div>
            </div>
            <p className="mt-3 px-1 text-[11px] leading-snug text-ink-3">
              This is prevention-focused decision support, not medical advice or a diagnosis. For symptoms or
              care decisions, follow your care plan or contact a healthcare provider.
            </p>
          </div>

          {/* Report */}
          <div>
            {!report ? (
              <div className="panel flex h-full min-h-[300px] flex-col items-center justify-center p-8 text-center">
                <div className="accent-gradient mb-3 flex h-12 w-12 items-center justify-center rounded-xl text-white">
                  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 12h3l2.5-6 5 15 2.5-9H21" />
                  </svg>
                </div>
                <h2 className="text-sm font-semibold text-ink">Your report will appear here</h2>
                <p className="mt-1 max-w-xs text-xs text-ink-3">
                  Enter your location and details, then generate a personalized &ldquo;safe to go out?&rdquo;
                  report you can print or download.
                </p>
              </div>
            ) : (
              <ReportCard report={report} onPrint={() => window.print()} onDownload={downloadHtml} />
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

function ReportCard({
  report,
  onPrint,
  onDownload,
}: {
  report: ReportData;
  onPrint: () => void;
  onDownload: () => void;
}) {
  const { place, age, conditions, risk, advice, aqi } = report;
  const v = VERDICT_STYLE[advice.verdict];
  const generated = new Date(risk.calculatedAt).toLocaleString();

  return (
    <div>
      {/* actions */}
      <div className="no-print mb-3 flex items-center justify-end gap-2">
        <button onClick={onDownload} className="chip px-3 py-1.5 text-xs font-medium">
          ⬇ Download (.html)
        </button>
        <button onClick={onPrint} className="btn-accent px-3.5 py-1.5 text-xs font-semibold">
          🖨 Print / Save as PDF
        </button>
      </div>

      <article id="report-card" className="panel overflow-hidden">
        {/* header */}
        <div className="flex items-start justify-between border-b border-hairline px-5 py-4">
          <div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-sm font-bold tracking-tight">PASS</span>
              <span className="text-sm text-ink-2">Equity Atlas</span>
            </div>
            <h1 className="mt-1 text-lg font-semibold leading-tight">Personal Air-Health Report</h1>
            <p className="text-xs text-ink-3">
              {place.label} · generated {generated}
            </p>
          </div>
          <LevelChip level={risk.level} />
        </div>

        {/* verdict banner */}
        <div className="px-5 py-4">
          <div
            className="flex items-start gap-3 rounded-xl p-4"
            style={{ background: v.bg, boxShadow: `inset 0 0 0 1px ${v.ring}33` }}
          >
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-lg font-bold text-white"
              style={{ background: v.ring }}
            >
              {v.icon}
            </span>
            <div>
              <h2 className="text-base font-semibold" style={{ color: v.text }}>
                {advice.headline}
              </h2>
              <p className="mt-0.5 text-sm text-ink-2">{advice.summary}</p>
              <p className="mt-1 text-xs text-ink-3">
                Snapshot US AQI {aqi ?? "n/a"} ({advice.aqiCategory})
                {advice.provisional && " — provisional: based on a labeled fallback field, not live conditions"}
                .
              </p>
            </div>
          </div>
        </div>

        {/* measures */}
        <div className="border-t border-hairline px-5 py-4">
          <h3 className="panel-title mb-2">Measures to take</h3>
          <ul className="space-y-1.5">
            {advice.measures.map((mm, i) => (
              <li key={i} className="flex gap-2 text-sm text-ink-2">
                <span className="mt-[3px] h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                {mm}
              </li>
            ))}
          </ul>
        </div>

        {/* profile + score breakdown */}
        <div className="grid gap-0 border-t border-hairline md:grid-cols-2">
          <div className="border-hairline px-5 py-4 md:border-r">
            <h3 className="panel-title mb-2">Who this is for</h3>
            <dl className="space-y-1 text-sm">
              <div className="flex justify-between gap-2">
                <dt className="text-ink-3">Age</dt>
                <dd className="text-ink-2">{age ?? "not provided"}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-ink-3">Conditions</dt>
                <dd className="text-right text-ink-2">
                  {conditions.length
                    ? conditions.map((c) => CONDITIONS.find((x) => x.value === c)?.label ?? c).join(", ")
                    : "none reported"}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-ink-3">Alert priority</dt>
                <dd className="tabular font-semibold text-ink">{risk.finalScore}/100</dd>
              </div>
            </dl>
          </div>
          <div className="px-5 py-4">
            <h3 className="panel-title mb-2">How this was scored</h3>
            <div className="space-y-2">
              <ScoreBar label="Current exposure" score={risk.exposure.score} hue="#d0492f" />
              <ScoreBar label="Personal susceptibility" score={risk.susceptibility.score} hue="#256abf" />
              <ScoreBar label="Community health burden" score={risk.healthVulnerability.score} hue="#6f5cc3" />
              <ScoreBar label="Monitor confidence" score={risk.monitorConfidence.score} hue="#2d8888" />
            </div>
          </div>
        </div>

        {/* caveats + sources */}
        <div className="border-t border-hairline px-5 py-4">
          <h3 className="panel-title mb-2">Data notes &amp; sources</h3>
          {risk.caveats.length > 0 && (
            <ul className="mb-2 space-y-1">
              {risk.caveats.map((c, i) => (
                <li key={i} className="text-[11px] leading-snug text-ink-3">
                  • {c}
                </li>
              ))}
            </ul>
          )}
          <div className="space-y-1.5">
            <SourceLine source={risk.exposure.sources[0]} />
            {risk.healthVulnerability.sources[0] && <SourceLine source={risk.healthVulnerability.sources[0]} />}
          </div>
        </div>

        {/* disclaimer */}
        <div className="border-t border-hairline bg-surface-2 px-5 py-3">
          <p className="text-[11px] leading-snug text-ink-3">
            <strong>Not medical advice.</strong> This report is prevention-focused decision support based on
            current modeled air quality and population-level context — it is not a diagnosis or a substitute for
            professional care. If you have symptoms or concerns, follow your care plan or contact a healthcare
            provider.
          </p>
        </div>
      </article>
    </div>
  );
}

function esc(s: string): string {
  return s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] ?? c));
}

function buildReportHtml(report: ReportData): string {
  const { place, age, conditions, risk, advice, aqi } = report;
  const generated = new Date(risk.calculatedAt).toLocaleString();
  const condLabel = conditions.length
    ? conditions.map((c) => CONDITIONS.find((x) => x.value === c)?.label ?? c).join(", ")
    : "none reported";
  const measures = advice.measures.map((mm) => `<li>${esc(mm)}</li>`).join("");
  const caveats = risk.caveats.map((c) => `<li>${esc(c)}</li>`).join("");
  const v = VERDICT_STYLE[advice.verdict];
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Personal Air-Health Report — ${esc(place.label)}</title>
<style>
  body{font:14px/1.5 system-ui,-apple-system,Segoe UI,Arial,sans-serif;color:#14161a;max-width:720px;margin:24px auto;padding:0 16px}
  .head{border-bottom:1px solid #e1e0d9;padding-bottom:12px;margin-bottom:16px}
  .brand{font-weight:700}.brand span{color:#52514e;font-weight:400}
  h1{font-size:20px;margin:6px 0 2px}.muted{color:#898781;font-size:12px}
  .banner{background:${v.bg};border:1px solid ${v.ring}55;border-radius:12px;padding:14px 16px;margin:14px 0}
  .banner h2{margin:0 0 4px;color:${v.text};font-size:17px}
  h3{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#898781;margin:18px 0 6px}
  ul{margin:0;padding-left:18px}li{margin:3px 0}
  table{width:100%;border-collapse:collapse;font-size:13px}td{padding:3px 0}td:last-child{text-align:right;color:#52514e}
  .foot{margin-top:18px;border-top:1px solid #e1e0d9;padding-top:10px;color:#898781;font-size:11px}
  @media print{body{margin:0}}
</style></head><body>
<div class="head">
  <div class="brand">PASS <span>Equity Atlas</span></div>
  <h1>Personal Air-Health Report</h1>
  <div class="muted">${esc(place.label)} · generated ${esc(generated)} · alert priority ${risk.finalScore}/100 (${esc(risk.level)})</div>
</div>
<div class="banner">
  <h2>${esc(advice.headline)}</h2>
  <div>${esc(advice.summary)}</div>
  <div class="muted" style="margin-top:6px">Snapshot US AQI ${aqi ?? "n/a"} (${esc(advice.aqiCategory)})${advice.provisional ? " — provisional: labeled fallback field, not live conditions" : ""}.</div>
</div>
<h3>Measures to take</h3>
<ul>${measures}</ul>
<h3>Who this is for</h3>
<table>
  <tr><td>Age</td><td>${age ?? "not provided"}</td></tr>
  <tr><td>Conditions</td><td>${esc(condLabel)}</td></tr>
</table>
<h3>How this was scored</h3>
<table>
  <tr><td>Current exposure</td><td>${risk.exposure.score}/100</td></tr>
  <tr><td>Personal susceptibility</td><td>${risk.susceptibility.score}/100</td></tr>
  <tr><td>Community health burden</td><td>${risk.healthVulnerability.score}/100</td></tr>
  <tr><td>Monitor confidence</td><td>${risk.monitorConfidence.score}/100</td></tr>
</table>
${caveats ? `<h3>Data notes</h3><ul>${caveats}</ul>` : ""}
<div class="foot"><strong>Not medical advice.</strong> Prevention-focused decision support based on current modeled air quality and population-level context — not a diagnosis or a substitute for professional care. If you have symptoms or concerns, follow your care plan or contact a healthcare provider.</div>
</body></html>`;
}
