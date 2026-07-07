"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/client/api";

const NAV = [
  { href: "/", label: "Command Map" },
  { href: "/report", label: "My Report" },
  { href: "/simulator", label: "Sensor Planner" },
  { href: "/compare", label: "Compare" },
  { href: "/outlook", label: "7-Day Outlook" },
  { href: "/equity", label: "Equity Lens" },
  { href: "/watchlist", label: "Watchlist" },
  { href: "/alerts", label: "Alerts" },
  { href: "/clinic", label: "Clinic Mode" },
  { href: "/methods", label: "Methods" },
];

interface Freshness {
  environment: { airnowConfigured: boolean; openaiConfigured: boolean; databaseConfigured: boolean };
  liveFetches: { sourceName: string; lastOk: boolean }[];
}

export default function SiteHeader() {
  const pathname = usePathname();
  const [fresh, setFresh] = useState<Freshness | null>(null);

  useEffect(() => {
    void api<Freshness>("/api/freshness").then(setFresh).catch(() => {});
  }, [pathname]);

  const liveOk = fresh?.liveFetches.some((f) => f.lastOk) ?? false;

  return (
    <header className="no-print shell-gradient relative z-30 flex h-12 shrink-0 items-center gap-4 px-3 text-white shadow-[0_1px_0_rgba(255,255,255,0.06),0_10px_30px_-18px_rgba(11,27,51,0.9)]">
      <Link href="/" className="group flex items-center gap-2">
        <span className="accent-gradient flex h-7 w-7 items-center justify-center rounded-lg shadow-[0_2px_10px_-2px_rgba(37,99,235,0.8)] ring-1 ring-white/20">
          {/* pulse / air-signal mark */}
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 12h3l2.5-6 5 15 2.5-9H21" />
          </svg>
        </span>
        <span className="flex items-baseline gap-1.5">
          <span className="text-sm font-bold tracking-tight">PASS</span>
          <span className="hidden text-sm text-white/60 sm:inline">Equity Atlas</span>
        </span>
      </Link>

      <nav className="flex gap-0.5 overflow-x-auto text-xs">
        {NAV.map((n) => {
          const active = pathname === n.href;
          return (
            <Link
              key={n.href}
              href={n.href}
              className={`relative whitespace-nowrap rounded-md px-2.5 py-1.5 font-medium transition ${
                active ? "bg-white/12 text-white" : "text-white/60 hover:bg-white/8 hover:text-white"
              }`}
            >
              {n.label}
              {active && (
                <span className="absolute inset-x-2 -bottom-[7px] h-0.5 rounded-full bg-gradient-to-r from-sky-300 to-indigo-300" />
              )}
            </Link>
          );
        })}
      </nav>

      <div className="ml-auto flex items-center gap-2.5 text-[10px]">
        {fresh && (
          <>
            <span
              className="hidden items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-2 py-1 sm:inline-flex"
              title="Whether any external data fetch has succeeded from this deployment"
            >
              <span className={`live-dot h-1.5 w-1.5 rounded-full ${liveOk ? "bg-emerald-400 shadow-[0_0_6px_1px_rgba(52,211,153,0.7)]" : "bg-amber-400 shadow-[0_0_6px_1px_rgba(251,191,36,0.7)]"}`} />
              <span className="font-medium text-white/80">{liveOk ? "Live data" : "Fallback mode"}</span>
            </span>
            <span
              className="hidden rounded-full border border-white/15 bg-white/5 px-2 py-1 font-medium text-white/70 sm:inline"
              title="Where user records are stored"
            >
              {fresh.environment.databaseConfigured ? "Postgres" : "In-memory"}
            </span>
          </>
        )}
      </div>
    </header>
  );
}
