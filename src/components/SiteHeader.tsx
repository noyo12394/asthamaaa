"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/client/api";

const NAV = [
  { href: "/", label: "Command Map" },
  { href: "/compare", label: "Compare" },
  { href: "/monitor-gaps", label: "Monitor Gaps" },
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
    <header className="no-print flex h-11 shrink-0 items-center gap-4 border-b border-hairline bg-surface px-3">
      <Link href="/" className="flex items-baseline gap-1.5">
        <span className="text-sm font-bold tracking-tight">PASS</span>
        <span className="text-sm text-ink-2">Equity Atlas</span>
      </Link>
      <nav className="flex gap-0.5 overflow-x-auto text-xs">
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
      <div className="ml-auto flex items-center gap-3 text-[10px] text-ink-3">
        {fresh && (
          <>
            <span className="hidden items-center gap-1 sm:inline-flex" title="Whether any external data fetch has succeeded from this deployment">
              <span className={`h-1.5 w-1.5 rounded-full ${liveOk ? "bg-good" : "bg-serious"}`} />
              {liveOk ? "live data" : "fallback mode"}
            </span>
            <span className="hidden sm:inline" title="Where user records are stored">
              {fresh.environment.databaseConfigured ? "postgres" : "memory (non-durable)"}
            </span>
          </>
        )}
      </div>
    </header>
  );
}
