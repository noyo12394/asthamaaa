"use client";

import { Search } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { api } from "@/lib/client/api";
import { Spinner, StatusBadge } from "./bits";

export interface PickedPlace {
  label: string;
  lat: number;
  lng: number;
}

interface GeocodeResult {
  displayName: string;
  lat: number;
  lng: number;
  source: { status: string };
}

export default function SearchBox({
  placeholder = "Search a place...",
  onPick,
}: {
  placeholder?: string;
  onPick: (place: PickedPlace) => void;
}) {
  const id = useId();
  const listId = `${id}-results`;
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GeocodeResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);
  const debounce = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    clearTimeout(debounce.current);
    if (query.trim().length < 2) return;
    debounce.current = setTimeout(async () => {
      setLoading(true);
      try {
        const data = await api<{ results: GeocodeResult[] }>(
          `/api/geocode?q=${encodeURIComponent(query)}`
        );
        setResults(data.results);
      } catch {
        setResults([]);
        setError("Search is temporarily unavailable.");
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(debounce.current);
  }, [query]);

  const open = query.trim().length >= 2 && (loading || results !== null);

  function pick(result: GeocodeResult) {
    onPick({ label: result.displayName, lat: result.lat, lng: result.lng });
    setQuery("");
    setResults(null);
    setActiveIndex(-1);
  }

  return (
    <div className="relative w-full max-w-sm">
      <Search
        size={15}
        aria-hidden="true"
        className="pointer-events-none absolute top-2.5 left-2.5 z-[1] text-ink-3"
      />
      <input
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setActiveIndex(-1);
          setError("");
          setResults(null);
          setLoading(false);
        }}
        onKeyDown={(event) => {
          if (!results?.length) {
            if (event.key === "Escape") setResults(null);
            return;
          }
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setActiveIndex((index) => Math.min(results.length - 1, index + 1));
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActiveIndex((index) => Math.max(0, index - 1));
          } else if (event.key === "Enter" && activeIndex >= 0) {
            event.preventDefault();
            pick(results[activeIndex]);
          } else if (event.key === "Escape") {
            setResults(null);
            setActiveIndex(-1);
          }
        }}
        placeholder={placeholder}
        role="combobox"
        aria-label={placeholder}
        aria-autocomplete="list"
        aria-controls={listId}
        aria-expanded={open}
        aria-activedescendant={activeIndex >= 0 ? `${id}-option-${activeIndex}` : undefined}
        className="h-10 w-full rounded-md border border-hairline bg-surface pr-9 pl-8 text-sm shadow-sm outline-none focus:border-accent"
      />
      {loading && (
        <span className="absolute top-2.5 right-2.5" aria-hidden="true">
          <Spinner />
        </span>
      )}
      <span className="sr-only" role="status" aria-live="polite">
        {loading
          ? "Searching"
          : error || (results ? `${results.length} search results` : "")}
      </span>
      {open && !loading && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-40 mt-1 max-h-72 w-full overflow-y-auto rounded-md border border-hairline bg-surface p-1 shadow-xl"
        >
          {error ? (
            <li className="px-2.5 py-2 text-xs text-critical">{error}</li>
          ) : results?.length === 0 ? (
            <li className="px-2.5 py-2 text-xs text-ink-3">No matching places found.</li>
          ) : (
            results?.map((result, index) => (
              <li
                key={`${result.lat},${result.lng},${result.displayName}`}
                id={`${id}-option-${index}`}
                role="option"
                aria-selected={activeIndex === index}
              >
                <button
                  type="button"
                  className={`flex w-full items-center justify-between gap-3 rounded-sm px-2.5 py-2 text-left text-sm ${
                    activeIndex === index ? "bg-accent-soft" : "hover:bg-surface-2"
                  }`}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => pick(result)}
                >
                  <span className="min-w-0 truncate">{result.displayName}</span>
                  <StatusBadge status={result.source.status} />
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
