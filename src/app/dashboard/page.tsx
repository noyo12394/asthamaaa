"use client";

import { Suspense } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { Activity, ArrowLeft, MapPin } from "lucide-react";
import { assess } from "@/lib/scoring";
import { AGE_GROUPS, HEALTH_CONDITIONS } from "@/lib/data";
import AssessmentPanels from "@/components/AssessmentPanels";
import MethodsDrawer from "@/components/MethodsDrawer";

const Map = dynamic(() => import("@/components/Map"), {
  ssr: false,
  loading: () => (
    <div className="h-full min-h-[420px] w-full rounded-xl border border-slate-200 bg-slate-100 animate-pulse" />
  ),
});

function Report() {
  const params = useSearchParams();
  const county = params.get("county") ?? "";
  const age = params.get("age") ?? "30-49";
  const conditionsStr = params.get("conditions") ?? "none";
  const conditions = conditionsStr.split(",").filter(Boolean);

  const assessment = county ? assess({ ageGroup: age, conditions, county }) : null;

  if (!assessment) {
    return (
      <div className="max-w-md mx-auto px-4 py-24 text-center">
        <MapPin className="w-10 h-10 text-slate-300 mx-auto mb-3" />
        <p className="text-slate-600">No location selected for this report.</p>
        <Link href="/" className="mt-4 inline-block text-blue-600 hover:underline text-sm">
          ← Back to the operations map
        </Link>
      </div>
    );
  }

  const ageLabel = AGE_GROUPS.find((g) => g.value === age)?.label ?? age;
  const condLabels = conditions
    .filter((c) => c !== "none")
    .map((c) => HEALTH_CONDITIONS.find((h) => h.value === c)?.short ?? c);

  return (
    <div className="max-w-[1400px] mx-auto px-4 py-4 space-y-4">
      {/* Profile strip */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-3 flex flex-wrap items-center gap-x-6 gap-y-2">
        <div>
          <div className="text-[10px] uppercase tracking-wide text-slate-400">Location</div>
          <div className="text-sm font-semibold text-slate-800">
            {assessment.county.label} · {assessment.county.region}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wide text-slate-400">Age group</div>
          <div className="text-sm font-medium text-slate-700">{ageLabel}</div>
        </div>
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-wide text-slate-400">Conditions</div>
          <div className="text-sm font-medium text-slate-700">
            {condLabels.length ? condLabels.join(", ") : "None reported"}
          </div>
        </div>
        <Link
          href="/"
          className="ml-auto flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:underline"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Edit on map
        </Link>
      </div>

      {/* Map */}
      <div className="h-[360px]">
        <Map
          selectedCounty={county}
          layers={{ monitors: true, coverage: true, pm25: false, no2: false, ozone: false, vulnerability: true }}
        />
      </div>

      <AssessmentPanels a={assessment} />
    </div>
  );
}

export default function DashboardPage() {
  return (
    <div className="flex flex-col min-h-screen bg-slate-50">
      <header className="bg-[#0f2540] text-white">
        <div className="max-w-[1400px] mx-auto px-4 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 hover:opacity-90">
            <div className="w-8 h-8 rounded-lg bg-blue-500/20 border border-blue-400/30 flex items-center justify-center">
              <Activity className="w-4 h-4 text-blue-300" />
            </div>
            <div>
              <h1 className="text-base font-bold leading-none tracking-tight">AirHealth PASS</h1>
              <p className="text-[10px] text-blue-300/80 leading-none mt-0.5">Full Environmental-Health Report</p>
            </div>
          </Link>
          <MethodsDrawer />
        </div>
      </header>

      <main className="flex-1">
        <Suspense
          fallback={<div className="max-w-md mx-auto px-4 py-24 text-center text-slate-400">Loading report…</div>}
        >
          <Report />
        </Suspense>
      </main>

      <footer className="border-t border-slate-200 bg-white py-4 px-4">
        <div className="max-w-[1400px] mx-auto text-center text-xs text-slate-400">
          AirHealth PASS — Lehigh University · Environmental Health Equity Research · Demo data only.
        </div>
      </footer>
    </div>
  );
}
