"use client";

/** Reusable geocode search input (compare / gaps / clinic pages). */
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/client/api";
import { StatusBadge } from "./bits";

export interface PickedPlace {
  label: string;
  lat: number;
  lng: number;
}

export default function SearchBox({
  placeholder = "Search a place…",
  onPick,
}: {
  placeholder?: string;
  onPick: (place: PickedPlace) => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<
    { displayName: string; lat: number; lng: number; source: { status: string } }[] | null
  >(null);
  const debounce = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    clearTimeout(debounce.current);
    if (q.trim().length < 2) return;
    debounce.current = setTimeout(async () => {
      try {
        const d = await api<{ results: typeof results }>(`/api/geocode?q=${encodeURIComponent(q)}`);
        setResults(d.results);
      } catch {
        setResults([]);
      }
    }, 300);
    return () => clearTimeout(debounce.current);
  }, [q]);

  const shown = q.trim().length >= 2 ? results : null;

  return (
    <div className="relative w-full max-w-sm">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={placeholder}
        className="w-full border border-hairline bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-accent"
      />
      {shown && (
        <ul className="absolute z-10 mt-0.5 w-full border border-hairline bg-surface shadow-md">
          {shown.length === 0 && <li className="px-2.5 py-2 text-xs text-ink-3">No matches.</li>}
          {shown.map((r, i) => (
            <li key={i}>
              <button
                className="flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left text-sm hover:bg-accent-soft"
                onClick={() => {
                  onPick({ label: r.displayName, lat: r.lat, lng: r.lng });
                  setQ("");
                  setResults(null);
                }}
              >
                <span>{r.displayName}</span>
                <StatusBadge status={r.source.status} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
