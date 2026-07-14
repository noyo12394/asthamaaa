"use client";

/**
 * Clinic Mode — flagship. A visually distinct, plain-language mode for
 * community health workers and clinicians: warm paper, serif headings,
 * large type. Generates a printable handout (EN/ES full generation, same
 * numbers), condition actions, and doctor conversation prompts.
 */
import { useState } from "react";
import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";
import SearchBox, { type PickedPlace } from "@/components/ui/SearchBox";
import { api } from "@/lib/client/api";
import { Spinner, StatusBadge } from "@/components/ui/bits";

interface ClinicCard {
  language: "en" | "es";
  condition: string;
  numbers: {
    usAqi: number | null;
    category: string | null;
    pm25: number | null;
    riskScore: number;
    riskLevel: string;
    sparsityClass: string;
    nearestMonitorMiles: number | null;
    dataStatus: string;
    observedAt: string;
  };
  headline: string;
  meaning: string[];
  actions: string[];
  doctorPrompts: string[];
  numbersNote: string;
  generation: "llm" | "template";
  generationNote: string;
  generatedAt: string;
}

const CONDITIONS = [
  { id: "asthma", en: "Asthma", es: "Asma" },
  { id: "copd", en: "COPD", es: "EPOC" },
  { id: "heart-disease", en: "Heart disease", es: "Enf. cardíaca" },
  { id: "diabetes", en: "Diabetes", es: "Diabetes" },
  { id: "general", en: "General", es: "General" },
] as const;

export default function ClinicPage() {
  const [place, setPlace] = useState<PickedPlace | null>(null);
  const [language, setLanguage] = useState<"en" | "es">("en");
  const [condition, setCondition] = useState<string>("asthma");
  const [card, setCard] = useState<ClinicCard | null>(null);
  const [loading, setLoading] = useState(false);
  const es = language === "es";

  async function generate(p: PickedPlace, lang: string, cond: string) {
    setLoading(true);
    try {
      const d = await api<ClinicCard>(
        `/api/clinic-card?lat=${p.lat}&lng=${p.lng}&language=${lang}&condition=${cond}`
      );
      setCard(d);
    } finally {
      setLoading(false);
    }
  }

  const refresh = (p = place, lang = language, cond = condition) => {
    if (p) void generate(p, lang, cond);
  };

  return (
    <div className="flex min-h-dvh flex-col bg-[#faf6ec]">
      <SiteHeader />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8 text-[16px] leading-relaxed text-[#2b2416]">
        <div className="no-print">
          <p className="text-xs font-semibold tracking-[0.14em] text-[#8a7a55] uppercase">
            Clinic Mode · {es ? "modo comunitario" : "community mode"}
          </p>
          <h1 className="mt-1 font-serif text-2xl font-bold" style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}>
            {es ? "Tarjeta de aire para pacientes" : "Air quality patient card"}
          </h1>
          <p className="mt-2 text-[15px] text-[#5a4f38]">
            {es
              ? "Lenguaje sencillo para trabajadores de salud comunitaria. Los números son los mismos que en la vista de investigación — solo cambia el lenguaje."
              : "Plain language for community health workers. The numbers are the same ones the research view uses — only the language changes."}
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <SearchBox
              placeholder={es ? "Código postal o ciudad…" : "Zip code or city…"}
              onPick={(p) => {
                setPlace(p);
                void generate(p, language, condition);
              }}
            />
            <div className="flex overflow-hidden rounded-md border border-[#d8cdb2]">
              {(["en", "es"] as const).map((l) => (
                <button
                  key={l}
                  onClick={() => {
                    setLanguage(l);
                    refresh(place, l, condition);
                  }}
                  className={`px-4 py-2 text-sm font-semibold ${
                    language === l ? "bg-[#4a5d23] text-white" : "bg-white text-[#5a4f38]"
                  }`}
                >
                  {l === "en" ? "English" : "Español"}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {CONDITIONS.map((c) => (
              <button
                key={c.id}
                onClick={() => {
                  setCondition(c.id);
                  refresh(place, language, c.id);
                }}
                className={`rounded-full border px-4 py-1.5 text-sm font-medium ${
                  condition === c.id
                    ? "border-[#4a5d23] bg-[#eef2e2] text-[#37451a]"
                    : "border-[#d8cdb2] bg-white text-[#5a4f38]"
                }`}
              >
                {es ? c.es : c.en}
              </button>
            ))}
          </div>
        </div>

        {loading && (
          <div className="mt-8 text-center">
            <Spinner label={es ? "Generando con datos actuales…" : "Generating from current data…"} />
          </div>
        )}

        {card && !loading && place && (
          <>
            <article className="mt-6 rounded-md border border-[#d8cdb2] bg-white p-6 shadow-sm">
              <header className="border-b border-[#eee5cf] pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="font-serif text-xl font-bold" style={{ fontFamily: "Georgia, serif" }}>
                      {place.label}
                    </h2>
                    <p className="text-sm text-[#8a7a55]">
                      {new Date(card.generatedAt).toLocaleString(es ? "es-US" : "en-US")}
                    </p>
                  </div>
                  <StatusBadge status={card.numbers.dataStatus} />
                </div>
              </header>

              <p className="mt-4 text-lg font-semibold">{card.headline}</p>

              <div className="mt-3 space-y-2">
                {card.meaning.map((m, i) => (
                  <p key={i} className="text-[15px]">
                    {m}
                  </p>
                ))}
              </div>

              <h3 className="mt-5 font-serif text-base font-bold" style={{ fontFamily: "Georgia, serif" }}>
                {es ? "Qué puede hacer" : "What you can do"}
              </h3>
              <ul className="mt-2 space-y-2">
                {card.actions.map((a, i) => (
                  <li key={i} className="flex gap-2 text-[15px]">
                    <span className="mt-0.5 text-[#4a5d23]">✓</span>
                    {a}
                  </li>
                ))}
              </ul>

              <h3 className="mt-5 font-serif text-base font-bold" style={{ fontFamily: "Georgia, serif" }}>
                {es ? "Preguntas para su próxima cita" : "Questions for your next appointment"}
              </h3>
              <ul className="mt-2 space-y-2">
                {card.doctorPrompts.map((p, i) => (
                  <li key={i} className="flex gap-2 text-[15px] italic">
                    <span className="mt-0.5 not-italic text-[#8a7a55]">?</span>
                    “{p}”
                  </li>
                ))}
              </ul>

              <footer className="mt-6 border-t border-[#eee5cf] pt-3 text-[12px] leading-snug text-[#8a7a55]">
                <p className="tabular">
                  AQI {card.numbers.usAqi ?? "n/a"} ({card.numbers.category ?? "?"}) · PM2.5{" "}
                  {card.numbers.pm25 ?? "n/a"} µg/m³ · {es ? "prioridad" : "priority"}{" "}
                  {card.numbers.riskScore}/100 ({card.numbers.riskLevel}) ·{" "}
                  {es ? "monitor más cercano" : "nearest monitor"}{" "}
                  {card.numbers.nearestMonitorMiles ?? "?"} mi ({card.numbers.sparsityClass})
                </p>
                <p className="mt-1">{card.numbersNote}</p>
                <p className="mt-1">
                  {es
                    ? "Informativo — no sustituye el consejo médico."
                    : "Informational — not a substitute for medical advice."}{" "}
                  PASS Equity Atlas · asthamaaa.vercel.app/methods
                </p>
              </footer>
            </article>

            <div className="no-print mt-4 flex flex-wrap items-center gap-3">
              <button
                onClick={() => window.print()}
                className="rounded-md bg-[#4a5d23] px-5 py-2.5 text-sm font-semibold text-white"
              >
                {es ? "Imprimir tarjeta" : "Print handout"}
              </button>
              <p className="text-xs text-[#8a7a55]">{card.generationNote}</p>
            </div>

            <div className="no-print mt-6 rounded-md border border-dashed border-[#d8cdb2] p-4 text-sm text-[#5a4f38]">
              <p className="font-semibold">
                {es ? "Acceso por texto (bajo ancho de banda)" : "Text access (low bandwidth)"}
              </p>
              <p className="mt-1 text-[13px]">
                {es
                  ? "La misma tarjeta está disponible como texto plano — utilizable desde un gateway SMS o curl en el campo:"
                  : "This same card is available as plain text — usable from an SMS gateway or curl in the field:"}
              </p>
              <code className="tabular mt-2 block overflow-x-auto rounded bg-[#f4eeda] px-2 py-1.5 text-[12px]">
                /api/text-card?q={encodeURIComponent(place.label)}&condition={condition}&language={language}
              </code>
            </div>
          </>
        )}

        {!card && !loading && (
          <p className="mt-10 text-center text-[15px] text-[#8a7a55]">
            {es
              ? "Busque un lugar para generar la tarjeta."
              : "Search a location to generate the card."}{" "}
            <Link href="/" className="underline">
              {es ? "Volver al mapa" : "Back to the map"}
            </Link>
          </p>
        )}
      </main>
    </div>
  );
}
