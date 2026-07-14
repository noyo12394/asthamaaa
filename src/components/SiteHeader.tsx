"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Activity,
  ChevronDown,
  Database,
  Menu,
  Moon,
  Sun,
  X,
} from "lucide-react";
import { api } from "@/lib/client/api";

const PRIMARY_NAV = [
  { href: "/", label: "Air map" },
  { href: "/water-pilot", label: "Water & PFAS" },
  { href: "/compare", label: "Compare" },
  { href: "/outlook", label: "Outlook" },
  { href: "/equity", label: "Equity" },
];

const MORE_NAV = [
  { href: "/simulator", label: "Sensor planner" },
  { href: "/monitor-gaps", label: "Coverage gaps" },
  { href: "/watchlist", label: "Watchlist" },
  { href: "/alerts", label: "Alerts" },
  { href: "/clinic", label: "Clinic mode" },
  { href: "/methods", label: "Methods & sources" },
];

const ALL_NAV = [...PRIMARY_NAV, ...MORE_NAV];

interface Freshness {
  environment: { airnowConfigured: boolean; openaiConfigured: boolean; databaseConfigured: boolean };
  liveFetches: { sourceName: string; lastOk: boolean }[];
}

function NavLink({ href, label, pathname, onNavigate }: { href: string; label: string; pathname: string; onNavigate?: () => void }) {
  const active = pathname === href;
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={`relative flex min-h-10 items-center whitespace-nowrap px-3 text-xs font-medium transition-colors ${
        active ? "text-accent" : "text-ink-2 hover:text-ink"
      }`}
    >
      {label}
      {active && <span className="absolute right-3 bottom-0 left-3 h-0.5 rounded-full bg-accent" />}
    </Link>
  );
}

export default function SiteHeader() {
  const pathname = usePathname();
  const [freshness, setFreshness] = useState<Freshness | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [dark, setDark] = useState(false);

  useEffect(() => {
    void api<Freshness>("/api/freshness").then(setFreshness).catch(() => setFreshness(null));
  }, [pathname]);

  useEffect(() => {
    const stored = window.localStorage.getItem("pass-theme");
    const preferred = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const enabled = stored ? stored === "dark" : preferred;
    document.documentElement.dataset.theme = enabled ? "dark" : "light";
    queueMicrotask(() => setDark(enabled));
  }, []);

  function toggleTheme() {
    const next = !dark;
    setDark(next);
    document.documentElement.dataset.theme = next ? "dark" : "light";
    window.localStorage.setItem("pass-theme", next ? "dark" : "light");
  }

  const liveOk = freshness?.liveFetches.some((fetch) => fetch.lastOk) ?? false;
  const moreActive = MORE_NAV.some((item) => item.href === pathname);

  return (
    <header className="no-print relative z-50 shrink-0 border-b border-hairline bg-surface/95 shadow-[0_1px_0_rgba(20,32,51,0.04)] backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-[1800px] items-center gap-3 px-3 sm:px-4">
        <Link href="/" className="group flex shrink-0 items-center gap-2.5" aria-label="PASS Equity Atlas home">
          <span className="grid h-8 w-8 place-items-center rounded-md bg-ink text-[11px] font-black text-surface shadow-sm">
            PA
          </span>
          <span className="leading-none">
            <span className="block text-sm font-bold text-ink">PASS</span>
            <span className="mt-0.5 block text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-3 group-hover:text-accent">
              Equity Atlas
            </span>
          </span>
        </Link>

        <nav className="ml-3 hidden min-w-0 flex-1 items-stretch lg:flex" aria-label="Primary navigation">
          {PRIMARY_NAV.map((item) => (
            <NavLink key={item.href} {...item} pathname={pathname} />
          ))}
          <details className="group relative">
            <summary className={`flex min-h-10 cursor-pointer list-none items-center gap-1 px-3 text-xs font-medium [&::-webkit-details-marker]:hidden ${moreActive ? "text-accent" : "text-ink-2 hover:text-ink"}`}>
              More <ChevronDown size={13} className="transition-transform group-open:rotate-180" />
            </summary>
            <div className="absolute top-11 left-0 w-52 rounded-md border border-hairline bg-surface p-1.5 shadow-xl">
              {MORE_NAV.map((item) => (
                <Link key={item.href} href={item.href} className={`block rounded-sm px-3 py-2 text-xs font-medium ${pathname === item.href ? "bg-accent-soft text-accent" : "text-ink-2 hover:bg-surface-2 hover:text-ink"}`}>
                  {item.label}
                </Link>
              ))}
            </div>
          </details>
        </nav>

        <div className="ml-auto flex items-center gap-1.5">
          {freshness && (
            <span className="hidden items-center gap-1.5 rounded-full border border-hairline bg-surface-2 px-2.5 py-1.5 text-[10px] font-medium text-ink-2 sm:inline-flex" title="Status of recent external data fetches">
              <Activity size={12} className={liveOk ? "text-good" : "text-warning"} />
              {liveOk ? "Live sources" : "Limited data"}
            </span>
          )}
          {freshness && (
            <span className="hidden items-center gap-1.5 rounded-full border border-hairline bg-surface-2 px-2.5 py-1.5 text-[10px] text-ink-3 xl:inline-flex" title="Persistence for saved locations and alerts">
              <Database size={12} />
              {freshness.environment.databaseConfigured ? "Durable storage" : "Session storage"}
            </span>
          )}
          <button type="button" onClick={toggleTheme} className="grid h-9 w-9 place-items-center rounded-md border border-hairline bg-surface text-ink-2 hover:bg-surface-2 hover:text-ink" aria-label={dark ? "Use light appearance" : "Use dark appearance"} title={dark ? "Use light appearance" : "Use dark appearance"}>
            {dark ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <button type="button" onClick={() => setMobileOpen((open) => !open)} className="grid h-9 w-9 place-items-center rounded-md border border-hairline bg-surface text-ink-2 lg:hidden" aria-expanded={mobileOpen} aria-controls="mobile-navigation" aria-label={mobileOpen ? "Close navigation" : "Open navigation"}>
            {mobileOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <nav id="mobile-navigation" aria-label="Mobile navigation" className="absolute right-0 left-0 top-14 grid grid-cols-2 gap-1 border-b border-hairline bg-surface p-3 shadow-xl sm:grid-cols-3 lg:hidden">
          {ALL_NAV.map((item) => (
            <NavLink key={item.href} {...item} pathname={pathname} onNavigate={() => setMobileOpen(false)} />
          ))}
        </nav>
      )}
    </header>
  );
}
