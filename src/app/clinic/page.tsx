"use client";

/** Clinic Mode: printable, safe-language resident handout (EN/ES). */
import { useState } from "react";
import SiteHeader from "@/components/SiteHeader";
import SearchBox, { type PickedPlace } from "@/components/ui/SearchBox";
import { api } from "@/lib/client/api";
import { Spinner, StatusBadge } from "@/components/ui/bits";

interface ClinicResult {
  language: string;
  aqi: number | null;
  category: string | null;
  dataStatus: string;
  message: string;
}

export default function ClinicPage() {
  const [place, setPlace] = useState<PickedPlace | null>(null);
  const [language, setLanguage] = useState<"en" | "es">("en");
  const [condition, setCondition] = useState("asthma");
  const [result, setResult] = useState<ClinicResult | null>(null);
  const [loading, setLoading] = useState(false);

  async function generate(p: PickedPlace, lang: "en" | "es", cond: string) {
    setLoading(true);
    try {
      const d = await api<ClinicResult>(
        `/api/clinic-message?lat=${p.lat}&lng=${p.lng}&language=${lang}&conditions=${encodeURIComponent(cond)}`
      );
      setResult(d);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
        <div className="no-print">
          <h1 className="text-lg font-semibold">Clinic mode</h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-2">
            Generates a printable resident handout for today’s conditions. Language is
            prevention-focused and condition-aware but never diagnostic; the data status is always
            printed on the handout itself.
          </p>

          <div className="mt-4 flex flex-wrap items-end gap-3">
            <div>
              <label className="mb-1 block text-xs text-ink-2">Location</label>
              <SearchBox
                placeholder="Clinic or patient area…"
                onPick={(p) => {
                  setPlace(p);
                  void generate(p, language, condition);
                }}
              />
            </div>
            <label className="block text-xs text-ink-2">
              Condition focus
              <select
                value={condition}
                onChange={(e) => {
                  setCondition(e.target.value);
                  if (place) void generate(place, language, e.target.value);
                }}
                className="mt-1 block border border-hairline bg-surface px-2 py-1.5 text-sm"
              >
                {["asthma", "copd", "heart disease", "general sensitivity"].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <label className="block text-xs text-ink-2">
              Language
              <select
                value={language}
                onChange={(e) => {
                  const l = e.target.value as "en" | "es";
                  setLanguage(l);
                  if (place) void generate(place, l, condition);
                }}
                className="mt-1 block border border-hairline bg-surface px-2 py-1.5 text-sm"
              >
                <option value="en">English</option>
                <option value="es">Español</option>
              </select>
            </label>
            {result && (
              <button
                onClick={() => window.print()}
                className="bg-accent px-4 py-2 text-xs font-medium text-white"
              >
                Print handout
              </button>
            )}
          </div>
        </div>

        {loading && (
          <div className="mt-8 text-center">
            <Spinner label="Generating from current data…" />
          </div>
        )}

        {result && !loading && place && (
          <div className="panel mt-6 p-6">
            <div className="mb-4 flex items-start justify-between gap-4 border-b border-hairline pb-3">
              <div>
                <h2 className="text-base font-semibold">
                  {language === "es" ? "Aviso de calidad del aire" : "Air quality notice"}
                </h2>
                <p className="text-xs text-ink-2">{place.label}</p>
              </div>
              <div className="text-right">
                <StatusBadge status={result.dataStatus} />
                <p className="tabular mt-1 text-[10px] text-ink-3">
                  {new Date().toLocaleString()}
                </p>
              </div>
            </div>
            <div className="whitespace-pre-wrap text-sm leading-relaxed">{result.message}</div>
            <p className="mt-5 border-t border-hairline pt-3 text-[10px] leading-snug text-ink-3">
              PASS Equity Atlas · informational only, not medical advice · data sources and
              methodology: pass-equity-atlas / Methods page
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
