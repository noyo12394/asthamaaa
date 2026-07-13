import type { Metadata } from "next";
import SiteHeader from "@/components/SiteHeader";

export const metadata: Metadata = {
  title: "PFAS Water",
  description:
    "PFAS drinking-water awareness pilot for DE, MD, NJ, NY, PA — what PFAS monitoring data exists, how precise it is, and how to read it. No measurements or safety judgments shown yet.",
};

const GROUPS = [
  { g: "A — Measured occurrence", meaning: "A sample was taken; a concentration or non-detect was reported", ex: "UCMR 5, state drinking-water monitoring, Water Quality Portal, USGS tapwater" },
  { g: "B — Documented releases", meaning: "A facility reported a PFAS discharge / release amount", ex: "NPDES/DMR discharge monitoring, TRI toxic releases, GHGRP" },
  { g: "C — Potential sources", meaning: "A place may handle PFAS; release or exposure is not confirmed", ex: "Industry sectors, manufacturers, airports, fire-training sites" },
  { g: "D — Community context", meaning: "Helps interpret environmental burden; not a measurement", ex: "Population served, EJ indicators, watershed/HUC, water-system info" },
];

const INVENTORY = [
  { name: "UCMR 5 (drinking water)", agency: "EPA OGWDW", group: "A", conc: "Yes", medium: "Finished / source drinking water", range: "2023–2025 (rolling to fall 2026)", scale: "PWS / sampling point — often approximate", cov: "All 5", decision: "INCLUDE (primary)" },
  { name: "Water Quality Portal (water)", agency: "EPA / USGS / NWQMC", group: "A", conc: "Yes", medium: "Groundwater, surface, source/finished/tap", range: "Varies by submitter", scale: "Point-level (best precision)", cov: "All 5 (uneven)", decision: "INCLUDE (secondary)" },
  { name: "State drinking-water layer", agency: "State programs via EPA", group: "A", conc: "Yes (heterogeneous)", medium: "State DW samples", range: "Varies; some stale", scale: "County → point (state-dependent)", cov: "NJ auto; MD/PA static; DE/NY absent", decision: "NEEDS VALIDATION" },
  { name: "USGS tapwater PFAS", agency: "USGS", group: "A", conc: "Yes (strong QA)", medium: "Tap water", range: "2021–22; 2023–24 (v2, 2025)", scale: "Point (sparse, generalized)", cov: "Sparse reconnaissance", decision: "CONTEXT ONLY" },
  { name: "Discharge monitoring (NPDES/DMR)", agency: "EPA / ECHO", group: "B", conc: "Effluent conc. — not DW", medium: "Effluent", range: "Facility-reported", scale: "Facility / outfall", cov: "Limited facilities", decision: "CONTEXT / EXCLUDE" },
  { name: "Toxic releases (TRI)", agency: "EPA TRI", group: "B", conc: "Release qty (lbs) — not conc.", medium: "Air/water/land releases", range: "Annual (PFAS RY2020+)", scale: "Facility", cov: "Facility-dependent", decision: "CONTEXT / EXCLUDE" },
  { name: "Superfund / Federal sites", agency: "EPA / DoD", group: "C", conc: "Detection flag / suspected", medium: "Site media", range: "Site-dependent", scale: "Site", cov: "Site-dependent", decision: "CONTEXT / EXCLUDE" },
  { name: "Industry sectors (potential handlers)", agency: "EPA (NAICS)", group: "C", conc: "No — classification only", medium: "n/a", range: "n/a", scale: "Facility", cov: "Many facilities", decision: "CONTEXT / EXCLUDE" },
  { name: "Integrated map (composite)", agency: "EPA", group: "mixed", conc: "Mixed", medium: "Mixed", range: "Mixed", scale: "Mixed", cov: "n/a", decision: "EXCLUDE (as one layer)" },
];

const COVERAGE: { ds: string; cells: string[] }[] = [
  { ds: "UCMR 5 (drinking water)", cells: ["✅", "✅", "✅", "✅", "✅"] },
  { ds: "Water Quality Portal (water)", cells: ["🟡", "🟡", "🟡", "🟡", "🟡"] },
  { ds: "State drinking-water layer", cells: ["⬜", "🟡", "✅", "⬜", "🟡"] },
  { ds: "USGS tapwater", cells: ["🟡", "🟡", "🟡", "🟡", "🟡"] },
  { ds: "Source / release layers (B/C)", cells: ["🟡", "🟡", "🟡", "🟡", "🟡"] },
];

const SOURCES = [
  { label: "EPA — Fifth Unregulated Contaminant Monitoring Rule (UCMR 5)", url: "https://www.epa.gov/dwucmr/fifth-unregulated-contaminant-monitoring-rule" },
  { label: "EPA — PFAS and the Safe Drinking Water Act", url: "https://www.epa.gov/sdwa/and-polyfluoroalkyl-substances-pfas" },
  { label: "EPA — Proposed PFAS Rescission Rule (May 2026)", url: "https://www.epa.gov/sdwa/proposed-pfas-rescission-rule" },
  { label: "EPA ECHO — PFAS Analytic Tools", url: "https://echo.epa.gov/trends/pfas-tools" },
  { label: "Water Quality Portal (waterqualitydata.us)", url: "https://www.waterqualitydata.us/" },
  { label: "USGS — PFAS in US Tapwater dashboard", url: "https://www.usgs.gov/tools/pfas-us-tapwater-interactive-dashboard" },
];

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="panel rounded-sm p-4">
      <h2 className="panel-title mb-3">{title}</h2>
      {children}
    </section>
  );
}

export default function WaterPilotPage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-5xl flex-1 space-y-4 px-4 py-6">
        {/* Awareness banner */}
        <div className="rounded-sm border border-accent/30 bg-accent-soft px-4 py-3">
          <p className="text-sm font-semibold text-accent">
            PFAS awareness pilot · in development
          </p>
          <p className="mt-1 text-xs text-ink-2">
            This section explains <strong>what PFAS water-monitoring data exists</strong> for these five states
            and how to read it. It currently shows <strong>no PFAS measurements</strong> and makes <strong>no
            safe/unsafe judgment</strong> — a labeled, precision-aware map will be added after the source
            datasets are validated. For your own water, contact your water provider or read its Consumer
            Confidence Report.
          </p>
        </div>

        <header>
          <h1 className="text-2xl font-semibold tracking-tight">PFAS Water-Quality Pilot</h1>
          <p className="mt-1 text-sm text-ink-2">
            Feasibility investigation for Delaware, Maryland, New Jersey, New York, and Pennsylvania.
          </p>
        </header>

        <Panel title="Research question">
          <p className="text-sm leading-relaxed text-ink">
            <em>What publicly available PFAS concentration measurements exist for drinking water, groundwater,
            surface water, and related water media in DE, MD, NJ, NY, and PA; how geographically and temporally
            precise are they; and what could responsibly be shown to the public in a pilot map?</em>
          </p>
          <p className="mt-2 text-sm text-ink-2">
            Public framing: <strong>&ldquo;What PFAS has been measured and reported near me — what was tested,
            when and where, how precise is the location, and where do I get current results?&rdquo;</strong> The
            pilot does <strong>not</strong> attempt to answer &ldquo;Is my household tap water safe?&rdquo;
          </p>
        </Panel>

        <Panel title="Verified status (checked 2026-07-13)">
          <ul className="space-y-2 text-sm text-ink-2">
            <li>
              <strong className="text-ink">UCMR 5:</strong> 11th release (Feb 2026) reflects results through
              Jan 15 2026 (~95%; ~1.9M results; 10,299 systems). Final release expected early fall 2026. Covers
              29 PFAS + lithium, monitored 2023–2025. Snapshots must record an extraction date.
            </li>
            <li>
              <strong className="text-ink">Federal rule (state precisely):</strong> PFOA &amp; PFOS 4 ppt MCLs
              are <strong>final</strong> (2024). In May 2026 EPA <strong>proposed</strong> to extend PFOA/PFOS
              compliance to 2031 and to <strong>rescind</strong> the PFHxS, PFNA, GenX (HFPO-DA) and Hazard-Index
              regulations (comment period through Jul 20 2026). Re-check the live EPA page before showing any
              regulatory value.
            </li>
          </ul>
        </Panel>

        <Panel title="Four-group classification (measurement vs. source vs. context)">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-ink-3">
                  <th className="py-1.5 pr-3 font-medium">Group</th>
                  <th className="py-1.5 pr-3 font-medium">Meaning</th>
                  <th className="py-1.5 font-medium">Examples</th>
                </tr>
              </thead>
              <tbody>
                {GROUPS.map((r) => (
                  <tr key={r.g} className="border-t border-hairline align-top">
                    <td className="py-1.5 pr-3 font-medium text-ink">{r.g}</td>
                    <td className="py-1.5 pr-3 text-ink-2">{r.meaning}</td>
                    <td className="py-1.5 text-ink-2">{r.ex}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-ink-3">
            A nearby factory, Superfund site, airport, or spill does not by itself prove that a neighborhood&rsquo;s
            drinking water is contaminated. Groups B/C/D are never merged into a numeric &ldquo;risk score.&rdquo;
          </p>
        </Panel>

        <Panel title="Dataset inventory">
          <div className="overflow-x-auto">
            <table className="w-full whitespace-nowrap text-xs">
              <thead>
                <tr className="text-left text-ink-3">
                  {["Dataset", "Agency", "Group", "Measured conc.?", "Medium", "Range", "Finest scale", "5-state", "Decision"].map((h) => (
                    <th key={h} className="px-2 py-1.5 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {INVENTORY.map((r) => (
                  <tr key={r.name} className="border-t border-hairline">
                    <td className="px-2 py-1.5 font-medium text-ink">{r.name}</td>
                    <td className="px-2 py-1.5 text-ink-2">{r.agency}</td>
                    <td className="px-2 py-1.5 text-ink-2">{r.group}</td>
                    <td className="px-2 py-1.5 text-ink-2">{r.conc}</td>
                    <td className="px-2 py-1.5 text-ink-2">{r.medium}</td>
                    <td className="px-2 py-1.5 text-ink-2">{r.range}</td>
                    <td className="px-2 py-1.5 text-ink-2">{r.scale}</td>
                    <td className="px-2 py-1.5 text-ink-2">{r.cov}</td>
                    <td className="px-2 py-1.5 font-medium text-ink">{r.decision}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel title="Five-state coverage matrix">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-ink-3">
                  <th className="px-2 py-1.5 font-medium">Dataset</th>
                  {["DE", "MD", "NJ", "NY", "PA"].map((s) => (
                    <th key={s} className="px-2 py-1.5 text-center font-medium">{s}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {COVERAGE.map((r) => (
                  <tr key={r.ds} className="border-t border-hairline">
                    <td className="px-2 py-1.5 text-ink">{r.ds}</td>
                    {r.cells.map((c, i) => (
                      <td key={i} className="px-2 py-1.5 text-center">{c}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-ink-3">
            ✅ present / national · 🟡 partial or heterogeneous (verify) · ⬜ not in this layer (may exist in UCMR
            or WQP). Only UCMR 5 gives clean, comparable, all-five-state drinking-water coverage.
          </p>
        </Panel>

        <Panel title="Recommended first prototype (once data is approved)">
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-ink-2">
            <li><strong className="text-ink">UCMR 5</strong> — primary public drinking-water layer (comparable across all five states).</li>
            <li><strong className="text-ink">Water Quality Portal</strong> — secondary, point-level ambient surface/ground water (filtered to water media, deduped by sample).</li>
            <li><strong className="text-ink">USGS tapwater</strong> and all <strong className="text-ink">source/release layers</strong> — separately labeled context only, with distinct symbols. Never the same symbol or color as a measurement.</li>
          </ul>
          <p className="mt-2 text-xs text-ink-3">
            Planned visualization: a five-state map with filters for state, PFAS chemical, sample year, water
            medium, detection status, source, and <em>geographic-precision category</em>; a location panel showing
            what was sampled, the result and reporting limit, the sample date, raw-vs-finished water, coordinate
            precision, limitations, and a link to the water provider. <strong>No exposure logic, no
            safe/unsafe ranking.</strong> (Not rendered here — pending data validation.)
          </p>
        </Panel>

        <Panel title="Draft public disclaimer & language">
          <p className="text-sm leading-relaxed text-ink-2">
            &ldquo;This map shows <strong>where PFAS has been sampled and reported</strong> — not whether any
            home&rsquo;s water is safe. A mapped point is often the approximate location of a water system or
            sampling site, not a specific home. Results reflect the date they were sampled and may be historical.
            A <strong>non-detection means PFAS was not found above that test&rsquo;s reporting limit — not that
            PFAS is absent.</strong> Potential-source and release markers are not measurements of drinking water
            and do not prove contamination or exposure. This is a research pilot; it is not medical or regulatory
            advice. For your current water quality, contact your water provider or read its Consumer Confidence
            Report.&rdquo;
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="rounded-sm border border-hairline p-2.5">
              <p className="text-xs font-semibold text-good">Use</p>
              <ul className="mt-1 space-y-0.5 text-xs text-ink-2">
                <li>&ldquo;PFAS monitoring result&rdquo;</li>
                <li>&ldquo;PFAS was detected in this sample&rdquo;</li>
                <li>&ldquo;No PFAS reported above this test&rsquo;s threshold&rdquo;</li>
                <li>&ldquo;Historical sample&rdquo; · &ldquo;Potential PFAS-handling facility&rdquo;</li>
                <li>&ldquo;Contact your water provider for current results&rdquo;</li>
              </ul>
            </div>
            <div className="rounded-sm border border-hairline p-2.5">
              <p className="text-xs font-semibold text-critical">Avoid</p>
              <ul className="mt-1 space-y-0.5 text-xs text-ink-2">
                <li>&ldquo;Your water is safe&rdquo; / &ldquo;poisoned&rdquo;</li>
                <li>&ldquo;This facility caused the contamination&rdquo;</li>
                <li>&ldquo;No detection means zero PFAS&rdquo;</li>
                <li>&ldquo;People living here were exposed&rdquo;</li>
                <li>&ldquo;This ZIP code has contaminated water&rdquo;</li>
              </ul>
            </div>
          </div>
        </Panel>

        <Panel title="Sources (verified 2026-07-13)">
          <ul className="space-y-1 text-sm">
            {SOURCES.map((s) => (
              <li key={s.url}>
                <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
        </Panel>

        <p className="pb-4 text-center text-xs text-ink-3">
          PASS Equity Atlas · PFAS awareness pilot · framework and data-source review · not medical or
          regulatory advice.
        </p>
      </main>
    </div>
  );
}
