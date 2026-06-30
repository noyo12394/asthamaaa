"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import {
  Search,
  Layers,
  Activity,
  ChevronDown,
  ExternalLink,
  MapPin,
} from "lucide-react";
import { AGE_GROUPS, HEALTH_CONDITIONS } from "@/lib/data";
import { COUNTIES } from "@/lib/counties";
import { assess } from "@/lib/scoring";
import type { MapLayers } from "@/components/Map";
import MethodsDrawer from "@/components/MethodsDrawer";
import AssessmentPanels from "@/components/AssessmentPanels";

const Map = dynamic(() => import("@/components/Map"), {
  ssr: false,
  loading: () => (
    <div className="h-full min-h-[420px] w-full rounded-xl border border-slate-200 bg-slate-100 animate-pulse" />
  ),
});

const PLACE_INDEX = COUNTIES.flatMap((c) =>
  [c.label, ...c.places].map((p) => ({ place: p, county: c.value }))
);

const LAYER_DEFS: { key: keyof MapLayers; label: string; color: string }[] = [
  { key: "monitors", label: "EPA monitors", color: "#1e40af" },
  { key: "coverage", label: "Coverage zones", color: "#3b82f6" },
  { key: "pm25", label: "PM2.5 risk", color: "#f97316" },
  { key: "no2", label: "NO₂ traffic", color: "#f59e0b" },
  { key: "ozone", label: "Ozone", color: "#10b981" },
  { key: "vulnerability", label: "Vulnerability", color: "#9333ea" },
];

export default function Home() {
  const [county, setCounty] = useState("");
  const [search, setSearch] = useState("");
  const [ageGroup, setAgeGroup] = useState("30-49");
  const [conditions, setConditions] = useState<string[]>([]);
  const [condOpen, setCondOpen] = useState(false);
  const [layers, setLayers] = useState<MapLayers>({
    monitors: true,
    coverage: true,
    pm25: false,
    no2: false,
    ozone: false,
    vulnerability: false,
  });

  function toggleLayer(key: keyof MapLayers) {
    setLayers((l) => ({ ...l, [key]: !l[key] }));
  }

  function toggleCondition(value: string) {
    if (value === "none") {
      setConditions(["none"]);
      return;
    }
    setConditions((prev) => {
      const filtered = prev.filter((c) => c !== "none");
      return filtered.includes(value) ? filtered.filter((c) => c !== value) : [...filtered, value];
    });
  }

  function handleSearch(value: string) {
    setSearch(value);
    const match = PLACE_INDEX.find((p) => p.place.toLowerCase() === value.toLowerCase());
    if (match) setCounty(match.county);
  }

  const assessment = useMemo(() => {
    if (!county) return null;
    return assess({ ageGroup, conditions, county });
  }, [county, ageGroup, conditions]);

  const reportHref = county
    ? `/dashboard?county=${county}&age=${ageGroup}&conditions=${conditions.join(",") || "none"}`
    : "#";

  const condLabel =
    conditions.length === 0 || (conditions.length === 1 && conditions[0] === "none")
      ? "No conditions"
      : `${conditions.filter((c) => c !== "none").length} selected`;

  return (
    <div className="flex flex-col min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-[#0f2540] text-white">
        <div className="max-w-[1400px] mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-500/20 border border-blue-400/30 flex items-center justify-center">
              <Activity className="w-4 h-4 text-blue-300" />
            </div>
            <div>
              <h1 className="text-base font-bold leading-none tracking-tight">AirHealth PASS</h1>
              <p className="text-[10px] text-blue-300/80 leading-none mt-0.5">
                PA Environmental Health Operations
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden sm:inline text-[10px] px-2 py-1 rounded-full bg-amber-400/15 text-amber-300 border border-amber-400/20 font-medium">
              DEMO DATA
            </span>
            <MethodsDrawer />
          </div>
        </div>
      </header>

      {/* Filter bar */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-[1100]">
        <div className="max-w-[1400px] mx-auto px-4 py-2.5 flex flex-wrap items-center gap-2.5">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              list="place-list"
              placeholder="Search a PA county or city…"
              className="w-full pl-8 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
            <datalist id="place-list">
              {PLACE_INDEX.map((p) => (
                <option key={`${p.county}-${p.place}`} value={p.place} />
              ))}
            </datalist>
          </div>

          <select
            value={county}
            onChange={(e) => {
              setCounty(e.target.value);
              setSearch("");
            }}
            className="py-2 px-3 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white"
          >
            <option value="">Select county…</option>
            {COUNTIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>

          <select
            value={ageGroup}
            onChange={(e) => setAgeGroup(e.target.value)}
            className="py-2 px-3 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white"
          >
            {AGE_GROUPS.map((g) => (
              <option key={g.value} value={g.value}>
                Age: {g.label}
              </option>
            ))}
          </select>

          {/* Conditions popover */}
          <div className="relative">
            <button
              onClick={() => setCondOpen((o) => !o)}
              className="flex items-center gap-1.5 py-2 px-3 text-sm border border-slate-300 rounded-lg bg-white hover:bg-slate-50"
            >
              {condLabel}
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            </button>
            {condOpen && (
              <>
                <div className="fixed inset-0 z-[1200]" onClick={() => setCondOpen(false)} />
                <div className="absolute right-0 mt-1 w-64 bg-white border border-slate-200 rounded-lg shadow-xl z-[1300] p-2 max-h-72 overflow-y-auto">
                  {HEALTH_CONDITIONS.map((c) => (
                    <label
                      key={c.value}
                      className="flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-slate-50 cursor-pointer text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={conditions.includes(c.value)}
                        onChange={() => toggleCondition(c.value)}
                        className="w-4 h-4 text-blue-600 rounded"
                      />
                      <span className="text-slate-700">{c.label}</span>
                    </label>
                  ))}
                </div>
              </>
            )}
          </div>

          <Link
            href={reportHref}
            aria-disabled={!county}
            className={`ml-auto flex items-center gap-1.5 py-2 px-3.5 text-sm font-semibold rounded-lg transition ${
              county
                ? "bg-[#0f2540] text-white hover:bg-[#163050]"
                : "bg-slate-200 text-slate-400 pointer-events-none"
            }`}
          >
            Full report <ExternalLink className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>

      {/* Main grid */}
      <main className="flex-1 max-w-[1400px] mx-auto w-full px-4 py-4">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Map column */}
          <div className="lg:col-span-7 xl:col-span-8 space-y-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="flex items-center gap-1 text-xs font-medium text-slate-500 mr-1">
                <Layers className="w-3.5 h-3.5" /> Layers:
              </span>
              {LAYER_DEFS.map((l) => (
                <button
                  key={l.key}
                  onClick={() => toggleLayer(l.key)}
                  className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border transition ${
                    layers[l.key]
                      ? "bg-slate-800 text-white border-slate-800"
                      : "bg-white text-slate-600 border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  <span className="w-2 h-2 rounded-full" style={{ background: l.color }} />
                  {l.label}
                </button>
              ))}
            </div>
            <div className="h-[460px] lg:h-[600px]">
              <Map selectedCounty={county} onCountySelect={setCounty} layers={layers} />
            </div>
          </div>

          {/* Results column */}
          <div className="lg:col-span-5 xl:col-span-4">
            {!assessment ? (
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8 text-center">
                <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center mx-auto mb-3">
                  <MapPin className="w-6 h-6 text-blue-500" />
                </div>
                <h2 className="font-semibold text-slate-800">Select a location to begin</h2>
                <p className="mt-1 text-sm text-slate-500 leading-relaxed">
                  Search or pick a Pennsylvania county, set your age group and any health conditions, and a live
                  environmental-health risk view will appear here.
                </p>
                <div className="mt-4 grid grid-cols-2 gap-2 text-left">
                  {COUNTIES.slice(0, 4).map((c) => (
                    <button
                      key={c.value}
                      onClick={() => setCounty(c.value)}
                      className="text-xs px-3 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600"
                    >
                      {c.places[0]}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="font-bold text-slate-900">{assessment.county.label}</h2>
                      <p className="text-xs text-slate-400">{assessment.county.region}</p>
                    </div>
                    <Link href={reportHref} className="text-xs font-medium text-blue-600 hover:underline flex items-center gap-1">
                      Expand <ExternalLink className="w-3 h-3" />
                    </Link>
                  </div>
                </div>
                <AssessmentPanels a={assessment} />
              </div>
            )}
          </div>
        </div>
      </main>

      <footer className="border-t border-slate-200 bg-white py-4 px-4 mt-2">
        <div className="max-w-[1400px] mx-auto text-center text-xs text-slate-400">
          AirHealth PASS — Lehigh University · Environmental Health Equity Research · Demo data; replace with
          EPA AQS, CDC PLACES &amp; Census/SVI before deployment.
        </div>
      </footer>
    </div>
  );
}
