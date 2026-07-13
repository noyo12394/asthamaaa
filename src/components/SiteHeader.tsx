"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Activity, Database, RadioTower, ShieldCheck } from "lucide-react";
import { api } from "@/lib/client/api";

const NAV = [
  { href: "/", label: "Command Map" },
  { href: "/simulator", label: "Sensor Planner" },
  { href: "/compare", label: "Compare" },
  { href: "/outlook", label: "7-Day Outlook" },
  { href: "/equity", label: "Equity Lens" },
  { href: "/watchlist", label: "Watchlist" },
  { href: "/alerts", label: "Alerts" },
  { href: "/clinic", label: "Clinic Mode" },
  { href: "/water-pilot", label: "PFAS Water" },
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
    <header className="no-print flex h-12 shrink-0 items-center gap-4 border-b border-hairline bg-surface/95 px-3 shadow-[0_1px_0_rgba(20,22,26,0.03)] backdrop-blur">
      <Link href="/" className="group flex items-center gap-2">
        <span className="grid h-7 w-7 place-items-center rounded-sm bg-ink text-[11px] font-black tracking-tight text-surface shadow-sm">
          PA
        </span>
        <span className="leading-none">
          <span className="block text-sm font-bold tracking-tight">PASS</span>
          <span className="block text-[11px] font-medium text-ink-3 group-hover:text-accent">
            Equity Atlas
          </span>
        </span>
      </Link>
      <nav className="flex min-w-0 flex-1 gap-0.5 overflow-x-auto text-xs">
        {NAV.map((n) => (
          <Link
            key={n.href}
            href={n.href}
            className={`whitespace-nowrap rounded-sm px-2 py-1 ${
              pathname === n.href ? "bg-accent-soft font-medium text-accent" : "text-ink-2 hover:text-ink"
            }`}
          >
            {n.label}
          </Link>
        ))}
      </nav>
      <div className="ml-auto flex items-center gap-2 text-[10px] text-ink-3">
        {fresh && (
          <>
            <span className="hidden items-center gap-1 rounded-full border border-hairline bg-surface-2 px-2 py-1 sm:inline-flex" title="Whether any external data fetch has succeeded from this deployment">
              <Activity size={12} className={liveOk ? "text-good" : "text-serious"} />
              {liveOk ? "live data" : "fallback mode"}
            </span>
            <span className="hidden items-center gap-1 rounded-full border border-hairline bg-surface-2 px-2 py-1 lg:inline-flex" title="Where user records are stored">
              <Database size={12} />
              {fresh.environment.databaseConfigured ? "postgres" : "memory (non-durable)"}
            </span>
            <span className="hidden items-center gap-1 rounded-full border border-hairline bg-surface-2 px-2 py-1 xl:inline-flex" title="Analysis stack">
              <RadioTower size={12} />
              tool-grounded agent
            </span>
            <span className="hidden items-center gap-1 rounded-full border border-hairline bg-surface-2 px-2 py-1 xl:inline-flex" title="All health output is prevention guidance, not diagnosis">
              <ShieldCheck size={12} />
              clinic-safe
            </span>
          </>
        )}
      </div>
    </header>
  );
}
