"use client";

import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { PollutantReading, HealthBurdenReading, Assessment } from "@/lib/scoring";
import { STATUS_STYLES, BURDEN_HEX, scoreHex } from "@/lib/ui";

const axisStyle = { fontSize: 11, fill: "#64748b" };

export function PollutantBars({ data }: { data: PollutantReading[] }) {
  const rows = data.map((d) => ({ name: d.label, value: d.value, hex: STATUS_STYLES[d.status].hex, display: d.display }));
  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={rows} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
        <XAxis type="number" domain={[0, 100]} tick={axisStyle} axisLine={false} tickLine={false} />
        <YAxis type="category" dataKey="name" tick={axisStyle} axisLine={false} tickLine={false} width={48} />
        <Tooltip
          cursor={{ fill: "#f1f5f9" }}
          formatter={((v: number, _n: string, p: { payload: { display: string } }) => [
            `${v}/100 (${p.payload.display})`,
            "Risk",
          ]) as never}
          contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
        />
        <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={18} minPointSize={3} isAnimationActive={false}>
          {rows.map((r, i) => (
            <Cell key={i} fill={r.hex} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function HealthBurdenBars({ data }: { data: HealthBurdenReading[] }) {
  const rows = data.map((d) => ({ name: d.label, value: d.value, hex: BURDEN_HEX[d.level], prevalence: d.prevalence }));
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={rows} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
        <XAxis type="number" domain={[0, 100]} tick={axisStyle} axisLine={false} tickLine={false} />
        <YAxis type="category" dataKey="name" tick={axisStyle} axisLine={false} tickLine={false} width={86} />
        <Tooltip
          cursor={{ fill: "#f1f5f9" }}
          formatter={((_v: number, _n: string, p: { payload: { prevalence: number } }) => [
            `${p.payload.prevalence}% prevalence`,
            "Burden",
          ]) as never}
          contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
        />
        <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={16} minPointSize={3} isAnimationActive={false}>
          {rows.map((r, i) => (
            <Cell key={i} fill={r.hex} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

const CONTRIB_COLORS = ["#dc2626", "#f97316", "#8b5cf6", "#3b82f6"];

export function ContributionChart({ assessment }: { assessment: Assessment }) {
  const c = assessment.components;
  const rows = [
    { name: "Exposure", value: Math.round(c.exposure.contribution) },
    { name: "Susceptibility", value: Math.round(c.susceptibility.contribution) },
    { name: "Health burden", value: Math.round(c.healthBurden.contribution) },
    { name: "Monitor gap", value: Math.round(c.monitorGap.contribution) },
  ].filter((r) => r.value > 0);

  return (
    <div className="flex items-center gap-3">
      <ResponsiveContainer width={140} height={140}>
        <PieChart>
          <Pie data={rows} dataKey="value" nameKey="name" innerRadius={36} outerRadius={62} paddingAngle={2}>
            {rows.map((_, i) => (
              <Cell key={i} fill={CONTRIB_COLORS[i % CONTRIB_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            formatter={((v: number, n: string) => [`${v} pts`, n]) as never}
            contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
          />
        </PieChart>
      </ResponsiveContainer>
      <ul className="space-y-1.5 text-xs">
        {rows.map((r, i) => (
          <li key={r.name} className="flex items-center gap-2">
            <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: CONTRIB_COLORS[i % CONTRIB_COLORS.length] }} />
            <span className="text-slate-600">{r.name}</span>
            <span className="ml-auto font-semibold text-slate-800">{r.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ScoreGauge({ score, hex }: { score: number; hex: string }) {
  const data = [
    { name: "score", value: score },
    { name: "rest", value: 100 - score },
  ];
  return (
    <div className="relative" style={{ width: 120, height: 120 }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="value" startAngle={90} endAngle={-270} innerRadius={44} outerRadius={56} stroke="none">
            <Cell fill={hex} />
            <Cell fill="#e2e8f0" />
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold text-slate-800">{score}</span>
        <span className="text-[10px] text-slate-400 uppercase tracking-wide">/ 100</span>
      </div>
    </div>
  );
}
