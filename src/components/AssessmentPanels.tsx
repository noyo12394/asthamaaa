"use client";

import {
  Gauge,
  Wind,
  MapPin,
  Radar,
  HeartPulse,
  ShieldAlert,
  TrendingUp,
  Activity,
  Stethoscope,
  Info,
} from "lucide-react";
import type { Assessment } from "@/lib/scoring";
import { RISK_STYLES, STATUS_STYLES, CONFIDENCE_STYLES } from "@/lib/ui";
import {
  PollutantBars,
  HealthBurdenBars,
  ContributionChart,
  ScoreGauge,
} from "./Charts";

function Panel({
  title,
  icon,
  children,
  className = "",
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`bg-white rounded-xl border border-slate-200 shadow-sm ${className}`}>
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-100">
        <span className="text-slate-400">{icon}</span>
        <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value,
  sub,
  accent = "text-slate-800",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  accent?: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-3.5">
      <div className="flex items-center gap-1.5 text-[10px] font-medium text-slate-400 uppercase tracking-wide truncate">
        <span className="shrink-0">{icon}</span>
        <span className="truncate">{label}</span>
      </div>
      <div className={`mt-1 text-lg font-bold leading-tight break-words ${accent}`}>{value}</div>
      {sub && <div className="text-[11px] text-slate-400 mt-0.5 leading-snug">{sub}</div>}
    </div>
  );
}

export default function AssessmentPanels({ a }: { a: Assessment }) {
  const risk = RISK_STYLES[a.level];
  const conf = CONFIDENCE_STYLES[a.monitor.confidence];

  return (
    <div className="space-y-4">
      {/* Metric cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <MetricCard
          icon={<Gauge className="w-3.5 h-3.5" />}
          label="Risk score"
          value={`${a.overallScore}`}
          sub={a.level}
          accent={risk.text}
        />
        <MetricCard
          icon={<Wind className="w-3.5 h-3.5" />}
          label="PM2.5 est."
          value={`${a.county.metrics.pm25.toFixed(1)}`}
          sub="µg/m³ annual"
        />
        <MetricCard
          icon={<MapPin className="w-3.5 h-3.5" />}
          label="Nearest monitor"
          value={`${a.monitor.nearestMonitorMiles.toFixed(1)} mi`}
          sub={a.monitor.nearestMonitorName}
        />
        <MetricCard
          icon={<Radar className="w-3.5 h-3.5" />}
          label="Monitor conf."
          value={a.monitor.confidence}
          sub={`${a.monitor.monitorsWithin25mi} within 25 mi`}
          accent={conf.text}
        />
        <MetricCard
          icon={<HeartPulse className="w-3.5 h-3.5" />}
          label="Conditions"
          value={`${a.sensitiveConditionCount}`}
          sub={a.isSusceptible ? "Elevated susceptibility" : "Standard"}
          accent={a.isSusceptible ? "text-orange-600" : "text-slate-800"}
        />
        <MetricCard
          icon={<ShieldAlert className="w-3.5 h-3.5" />}
          label="Action level"
          value={a.actionLevel}
          accent={risk.text}
        />
      </div>

      {/* Overall + Why + Contribution */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Panel title="Overall risk" icon={<Gauge className="w-4 h-4" />}>
          <div className="flex items-center gap-4">
            <ScoreGauge score={a.overallScore} hex={risk.hex} />
            <div>
              <div className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-sm font-semibold ${risk.bg} ${risk.text}`}>
                <span className={`w-2 h-2 rounded-full ${risk.dot}`} />
                {a.level}
              </div>
              <p className="mt-2 text-xs text-slate-500 leading-relaxed">
                Recommended action: <strong className="text-slate-700">{a.actionLevel}</strong>
              </p>
              <p className="mt-1 text-xs text-slate-500 leading-relaxed">
                Top factor: <strong className="text-slate-700">{a.topFactor.label}</strong>
              </p>
            </div>
          </div>
        </Panel>

        <Panel title="Why this risk" icon={<Info className="w-4 h-4" />} className="lg:col-span-1">
          <ul className="space-y-2">
            {a.why.map((w, i) => (
              <li key={i} className="flex gap-2 text-xs text-slate-600 leading-relaxed">
                <span className="text-slate-300 mt-0.5">▸</span>
                {w}
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="Risk contribution" icon={<TrendingUp className="w-4 h-4" />}>
          <ContributionChart assessment={a} />
        </Panel>
      </div>

      {/* Pollutants + Health burden */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel title="Air pollution risk" icon={<Wind className="w-4 h-4" />}>
          <PollutantBars data={a.pollutants} />
          <div className="mt-3 space-y-1.5">
            {a.pollutants.map((p) => (
              <div key={p.key} className="flex items-start gap-2 text-[11px]">
                <span className={`shrink-0 px-1.5 py-0.5 rounded font-semibold ${STATUS_STYLES[p.status].bg} ${STATUS_STYLES[p.status].text}`}>
                  {p.label}
                </span>
                <span className="text-slate-500">{p.message}</span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="County health burden" icon={<HeartPulse className="w-4 h-4" />}>
          <HealthBurdenBars data={a.healthBurden} />
          <p className="mt-2 text-[11px] text-slate-400">
            Adult prevalence (%) — bars normalized against statewide ranges.
          </p>
        </Panel>
      </div>

      {/* Virtual monitor + Recommendations */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel title="Virtual monitor estimate" icon={<Radar className="w-4 h-4" />}>
          <div className={`rounded-lg border p-3 ${conf.bg} ${conf.border}`}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-600">Estimate confidence</span>
              <span className={`text-sm font-bold ${conf.text}`}>{a.monitor.confidence}</span>
            </div>
            <div className="mt-2 h-1.5 rounded-full bg-white overflow-hidden">
              <div
                className={`h-full ${a.monitor.confidence === "High" ? "bg-green-500 w-full" : a.monitor.confidence === "Medium" ? "bg-yellow-500 w-2/3" : "bg-orange-500 w-1/3"}`}
              />
            </div>
            <p className="mt-2 text-[11px] text-slate-600 leading-relaxed">{a.monitor.confidenceNote}</p>
          </div>
          <p className="mt-3 text-xs text-slate-500 leading-relaxed">
            Where EPA monitors are sparse, this tool estimates local risk using nearby monitors, weather and
            context data, and county health vulnerability. Nearest real monitor:{" "}
            <strong className="text-slate-700">{a.monitor.nearestMonitorName}</strong> ({a.monitor.nearestMonitorMiles.toFixed(1)} mi).
            {a.monitor.coverageGap && " This area falls in a coverage gap."}
          </p>
        </Panel>

        <Panel title="Recommendations" icon={<Stethoscope className="w-4 h-4" />}>
          <ul className="space-y-2">
            {a.recommendations.map((r, i) => (
              <li key={i} className="flex gap-2 text-xs text-slate-600 leading-relaxed">
                <Activity className="w-3.5 h-3.5 text-blue-500 shrink-0 mt-0.5" />
                {r}
              </li>
            ))}
          </ul>
          <p className="mt-3 pt-3 border-t border-slate-100 text-[11px] text-slate-400 leading-relaxed">
            <strong>Disclaimer:</strong> Informational only — not medical advice. Consult a qualified healthcare
            provider for clinical decisions.
          </p>
        </Panel>
      </div>
    </div>
  );
}
