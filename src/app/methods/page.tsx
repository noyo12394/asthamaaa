/** Methods page: scoring formula, data sources, limitations — written for review. */
import SiteHeader from "@/components/SiteHeader";
import { WEIGHTS } from "@/lib/scoring";
import { MONITOR_SOURCE } from "@/lib/monitors";
import { HEALTH_SOURCE, VULNERABILITY_SOURCE } from "@/lib/health";
import { COUNTY_SOURCE } from "@/lib/counties";
import { StatusBadge } from "@/components/ui/bits";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Methods" };

const SOURCES = [
  {
    name: "Open-Meteo Air Quality API",
    role: "Current & hourly PM2.5, PM10, ozone, NO2, SO2, CO, US AQI",
    status: "live/modeled at runtime",
    notes:
      "CAMS model output, fetched server-side and cached 10 minutes. Model estimates, not physical monitor readings. When unreachable, a deterministic synthetic field labeled FALLBACK is used.",
  },
  {
    name: COUNTY_SOURCE.name,
    role: "County identification, boundaries, centroids",
    status: COUNTY_SOURCE.status,
    notes: COUNTY_SOURCE.notes ?? "",
  },
  {
    name: MONITOR_SOURCE.name,
    role: "Monitor locations, pollutants, distances",
    status: MONITOR_SOURCE.status,
    notes: MONITOR_SOURCE.notes ?? "",
  },
  {
    name: HEALTH_SOURCE.name,
    role: "County chronic-condition prevalence (asthma, COPD, diabetes, hypertension, CHD, obesity, cancer)",
    status: HEALTH_SOURCE.status,
    notes: HEALTH_SOURCE.notes ?? "",
  },
  {
    name: VULNERABILITY_SOURCE.name,
    role: "County social vulnerability (SVI-style composite + components)",
    status: VULNERABILITY_SOURCE.status,
    notes: VULNERABILITY_SOURCE.notes ?? "",
  },
  {
    name: "AirNow API (US EPA)",
    role: "Official AQI observations (optional)",
    status: "off unless AIRNOW_API_KEY configured",
    notes: "Architecture supports official observations alongside the model layer.",
  },
];

export default function MethodsPage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        <h1 className="text-xl font-semibold">Methodology</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-2">
          PASS Equity Atlas combines short-lived model estimates of air quality with slow-moving
          population datasets to prioritize <em>attention</em> — which places and residents most
          warrant a closer look right now. It does not measure personal exposure and it does not
          diagnose anyone. Everything below is implemented in{" "}
          <code className="bg-surface-2 px-1">src/lib/scoring.ts</code> and documented in
          SCORING.md in the repository.
        </p>

        <h2 className="mt-8 text-base font-semibold">1. Component scores (each 0–100)</h2>
        <div className="panel mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-hairline text-left text-[11px] uppercase tracking-wide text-ink-3">
                <th className="px-3 py-2 font-medium">Component</th>
                <th className="px-3 py-2 font-medium">Weight</th>
                <th className="px-3 py-2 font-medium">Definition</th>
              </tr>
            </thead>
            <tbody className="align-top">
              <tr className="border-b border-hairline">
                <td className="px-3 py-2.5 font-medium">Exposure</td>
                <td className="tabular px-3 py-2.5">{WEIGHTS.exposure}</td>
                <td className="px-3 py-2.5 text-ink-2">
                  Piecewise mapping of the snapshot US AQI: AQI 50 → 25, AQI 100 → 50, AQI 200 →
                  85, then compressed to 100. The AQI itself follows EPA 2024 breakpoints (PM2.5
                  “Good” ceiling 9.0 µg/m³); gas concentrations from the model (µg/m³) are
                  converted to ppb at 25 °C/1013 hPa before lookup.
                </td>
              </tr>
              <tr className="border-b border-hairline">
                <td className="px-3 py-2.5 font-medium">Community health burden</td>
                <td className="tabular px-3 py-2.5">{WEIGHTS.healthVulnerability}</td>
                <td className="px-3 py-2.5 text-ink-2">
                  Mean of county prevalence values normalized against high-burden reference
                  ceilings (asthma 14%, COPD 12%, diabetes 18%, hypertension 45%, CHD 10%, obesity
                  45% — approximately the high end of US county distributions).
                </td>
              </tr>
              <tr className="border-b border-hairline">
                <td className="px-3 py-2.5 font-medium">Equity burden</td>
                <td className="tabular px-3 py-2.5">{WEIGHTS.equity}</td>
                <td className="px-3 py-2.5 text-ink-2">
                  0.6 × social vulnerability (SVI percentile × 100) + 0.4 × monitoring coverage
                  gap (100 − monitor confidence). High values mean vulnerable communities that are
                  also poorly observed.
                </td>
              </tr>
              <tr className="border-b border-hairline">
                <td className="px-3 py-2.5 font-medium">Personal susceptibility</td>
                <td className="tabular px-3 py-2.5">{WEIGHTS.susceptibility}</td>
                <td className="px-3 py-2.5 text-ink-2">
                  Baseline 20 (general population); +25 age ≥ 65; +20 age ≤ 12; +30 asthma; +30
                  COPD; +25 heart disease; +15 diabetes; +15 pregnancy; +10 hypertension; capped
                  at 100. A prevention-focused weighting, not a clinical instrument.
                </td>
              </tr>
              <tr>
                <td className="px-3 py-2.5 font-medium">Monitor confidence</td>
                <td className="tabular px-3 py-2.5">reported separately</td>
                <td className="px-3 py-2.5 text-ink-2">
                  0.7 × distance term (1 − d/50 km, floored at 0) + 0.3 × density term (sites
                  within 25 km / 4, capped at 1), × 100. Bands: good ≤ 10 km, partial ≤ 25 km,
                  sparse beyond. Heuristic thresholds chosen for urban-scale PM2.5 spatial
                  correlation — not an EPA siting standard.
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <h2 className="mt-8 text-base font-semibold">2. Final score and levels</h2>
        <pre className="panel tabular mt-3 overflow-x-auto p-3 text-xs leading-relaxed">
{`final = ${WEIGHTS.exposure}·exposure + ${WEIGHTS.healthVulnerability}·healthBurden + ${WEIGHTS.equity}·equity + ${WEIGHTS.susceptibility}·susceptibility

level:  < 25  Low        25–49  Moderate
        50–69 High       ≥ 70   Very High`}
        </pre>
        <p className="mt-2 text-sm text-ink-2">
          Monitor confidence deliberately does not scale the final score; instead it (a) raises
          the equity term when coverage is weak and (b) is displayed alongside every result so low
          observational confidence is visible rather than hidden inside a number.
        </p>

        <h2 className="mt-8 text-base font-semibold">3. Data sources &amp; provenance</h2>
        <ul className="mt-3 space-y-3">
          {SOURCES.map((s) => (
            <li key={s.name} className="panel px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-medium">{s.name}</span>
                {typeof s.status === "string" && s.status.length <= 10 ? (
                  <StatusBadge status={s.status} />
                ) : (
                  <span className="text-[11px] text-ink-3">{s.status}</span>
                )}
              </div>
              <p className="mt-0.5 text-xs text-ink-2">{s.role}</p>
              {s.notes && <p className="mt-1 text-[11px] leading-snug text-ink-3">{s.notes}</p>}
            </li>
          ))}
        </ul>

        <h2 className="mt-8 text-base font-semibold">4. Interpretation limits</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-ink-2">
          <li>
            <strong>Snapshot ≠ regulatory.</strong> The displayed AQI is an hourly model snapshot.
            It is not a 24-hour NowCast, not a design value, and cannot be compared against annual
            NAAQS attainment.
          </li>
          <li>
            <strong>Model ≠ monitor.</strong> Concentrations come from a model surface unless an
            official observation source is configured. Monitor distance quantifies how verifiable
            the model is locally — far from monitors, treat values as lower-confidence.
          </li>
          <li>
            <strong>County ≠ individual.</strong> Health and vulnerability indicators describe
            populations. They contextualize community stakes; they say nothing about a specific
            person.
          </li>
          <li>
            <strong>Fallback data is synthetic.</strong> Whenever a source is unreachable or an
            ingestion has not run, values are deterministic placeholders labeled{" "}
            <StatusBadge status="fallback" /> everywhere they appear, including on printed
            handouts.
          </li>
          <li>
            <strong>No invented precision.</strong> Component weights are round, documented
            constants chosen for transparency, not fitted parameters; scores are reported as
            integers.
          </li>
        </ul>

        <h2 className="mt-8 text-base font-semibold">5. Refresh &amp; caching</h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-2">
          Browsers never call external APIs directly — the backend geocodes, fetches, caches
          (10-minute TTL for current air quality, 24 h for geocoding, long-term for county
          datasets), logs every fetch to the source ledger, and recomputes watch rules on a
          scheduled Vercel Cron refresh (daily on Hobby, every 15 minutes on Pro). The Data Freshness panel (header indicator and{" "}
          <code className="bg-surface-2 px-1">/api/freshness</code>) exposes the last attempt and
          last success per source.
        </p>
      </main>
    </div>
  );
}
