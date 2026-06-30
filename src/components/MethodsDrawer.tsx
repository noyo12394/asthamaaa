"use client";

import { useState } from "react";
import { BookOpen, X } from "lucide-react";

export default function MethodsDrawer() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 border border-slate-200 rounded-md px-2.5 py-1.5 bg-white hover:bg-slate-50 transition"
      >
        <BookOpen className="w-3.5 h-3.5" /> Data basis &amp; methods
      </button>

      {open && (
        <div className="fixed inset-0 z-[2000] flex justify-end">
          <div className="absolute inset-0 bg-black/30" onClick={() => setOpen(false)} />
          <div className="relative w-full max-w-md h-full bg-white shadow-2xl overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-slate-200 px-5 py-4 flex items-center justify-between">
              <h3 className="font-bold text-slate-900">Data Basis &amp; Methods</h3>
              <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-5 py-4 space-y-5 text-sm text-slate-600 leading-relaxed">
              <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-amber-800 text-xs">
                <strong>Prototype notice:</strong> All county values shown are realistic, plausibly-scaled{" "}
                <strong>demo data</strong> for interface development. Replace with official APIs/datasets before
                any real-world deployment.
              </div>

              <section>
                <h4 className="font-semibold text-slate-800 mb-1">EPA AQS monitors</h4>
                <p>
                  Monitor locations and the &ldquo;gold standard&rdquo; air quality measurements come from the EPA
                  Air Quality System (AQS). Coverage circles use a 15.5-mile (≈25 km) radius. These are distinct
                  from low-cost consumer <em>sensors</em>, which are not used here.
                </p>
              </section>

              <section>
                <h4 className="font-semibold text-slate-800 mb-1">County health indicators</h4>
                <p>
                  Asthma, diabetes, heart disease, COPD and obesity prevalence are modeled on CDC PLACES
                  county-level estimates. Population vulnerability mirrors the CDC/ATSDR Social Vulnerability Index.
                </p>
              </section>

              <section>
                <h4 className="font-semibold text-slate-800 mb-1">PM2.5 / NO₂ / ozone estimates</h4>
                <p>
                  Pollutant indices represent annual-average context. In production these would draw from EPA
                  monitors blended with satellite/reanalysis surfaces (e.g. NASA, Van Donkelaar PM2.5).
                </p>
              </section>

              <section>
                <h4 className="font-semibold text-slate-800 mb-1">Monitor gap &amp; virtual monitor confidence</h4>
                <p>
                  Where EPA monitors are sparse, local risk is inferred from the nearest monitors, county context
                  and vulnerability. Confidence decreases with monitor distance: <strong>High</strong> (≤10 mi with
                  ≥2 nearby), <strong>Medium</strong> (≤20 mi), <strong>Low</strong> (&gt;20 mi). Low confidence
                  flags uncertainty — it never hides risk.
                </p>
              </section>

              <section>
                <h4 className="font-semibold text-slate-800 mb-1">Risk scoring</h4>
                <p>
                  Overall risk = exposure + personal susceptibility + monitor-gap penalty + county health burden,
                  weighted 30/30/10/30. The contribution chart shows how each factor adds into the final score.
                </p>
              </section>

              <p className="text-xs text-slate-400 pt-2 border-t border-slate-100">
                This tool is informational and is not medical advice. Consult a qualified healthcare provider for
                clinical decisions.
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
