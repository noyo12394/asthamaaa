"use client";

/** Left rail: search, saved places, layer controls. */
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/client/api";
import { StatusBadge, Section, Spinner } from "@/components/ui/bits";
import { formatDistance, type DistanceUnit } from "@/lib/distance";
import { LAYERS, type LayerId } from "./state";
import type { SavedLocation } from "@/lib/types";

interface GeocodeResult {
  name: string;
  displayName: string;
  lat: number;
  lng: number;
  source: { status: string; name: string };
}

interface Props {
  activeLayers: LayerId[];
  onToggleLayer: (id: LayerId) => void;
  onPickPlace: (lat: number, lng: number, label: string) => void;
  selected: { lat: number; lng: number; label: string | null } | null;
  distanceUnit: DistanceUnit;
  onDistanceUnitChange: (unit: DistanceUnit) => void;
}

export default function Sidebar({
  activeLayers,
  onToggleLayer,
  onPickPlace,
  selected,
  distanceUnit,
  onDistanceUnitChange,
}: Props) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<GeocodeResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [saved, setSaved] = useState<SavedLocation[]>([]);
  const [saving, setSaving] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    void api<{ locations: SavedLocation[] }>("/api/saved-locations")
      .then((d) => setSaved(d.locations))
      .catch(() => {});
  }, []);

  useEffect(() => {
    clearTimeout(debounce.current);
    if (q.trim().length < 2) return;
    debounce.current = setTimeout(async () => {
      setSearching(true);
      try {
        const d = await api<{ results: GeocodeResult[] }>(`/api/geocode?q=${encodeURIComponent(q)}`);
        setResults(d.results);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(debounce.current);
  }, [q]);

  const shownResults = q.trim().length >= 2 ? results : null;
  const layerDescription = (description: string) =>
    description
      .replace("10 km", formatDistance(10, distanceUnit, 0))
      .replace("25 km", formatDistance(25, distanceUnit, 0));

  async function saveCurrent() {
    if (!selected) return;
    setSaving(true);
    try {
      const d = await api<{ location: SavedLocation }>("/api/saved-locations", {
        method: "POST",
        body: JSON.stringify({
          label: selected.label ?? `${selected.lat.toFixed(3)}, ${selected.lng.toFixed(3)}`,
          lat: selected.lat,
          lng: selected.lng,
        }),
      });
      setSaved((s) => [d.location, ...s]);
    } catch {
      /* surfaced via UI absence */
    } finally {
      setSaving(false);
    }
  }

  async function removeSaved(id: string) {
    setSaved((s) => s.filter((l) => l.id !== id));
    await api(`/api/saved-locations?id=${id}`, { method: "DELETE" }).catch(() => {});
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <Section title="Search location">
        <div className="relative">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="City, county, or place…"
            className="w-full border border-hairline bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-accent"
            aria-label="Search location"
          />
          {searching && (
            <span className="absolute top-1.5 right-2">
              <Spinner />
            </span>
          )}
        </div>
        {shownResults && (
          <ul className="mt-1 border border-hairline bg-surface">
            {shownResults.length === 0 && (
              <li className="px-2.5 py-2 text-xs text-ink-3">No matches.</li>
            )}
            {shownResults.map((r, i) => (
              <li key={i}>
                <button
                  className="flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left text-sm hover:bg-accent-soft"
                  onClick={() => {
                    onPickPlace(r.lat, r.lng, r.displayName);
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
      </Section>

      <Section
        title="Saved places"
        action={
          selected && (
            <button
              onClick={saveCurrent}
              disabled={saving}
              className="text-[11px] font-medium text-accent hover:underline disabled:opacity-50"
            >
              + Save current
            </button>
          )
        }
      >
        {saved.length === 0 ? (
          <p className="text-xs text-ink-3">
            Nothing saved yet. Select a location and press “Save current”.
          </p>
        ) : (
          <ul className="space-y-1">
            {saved.map((l) => (
              <li key={l.id} className="group flex items-center justify-between gap-2">
                <button
                  className="truncate text-left text-sm text-ink hover:text-accent"
                  onClick={() => onPickPlace(l.lat, l.lng, l.label)}
                >
                  {l.label}
                </button>
                <button
                  onClick={() => removeSaved(l.id)}
                  className="invisible text-xs text-ink-3 hover:text-critical group-hover:visible"
                  aria-label={`Remove ${l.label}`}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Distance units">
        <div className="grid grid-cols-2 gap-px border border-hairline bg-surface-2 p-0.5 text-xs">
          {(["km", "mi"] as const).map((unit) => (
            <button
              key={unit}
              type="button"
              onClick={() => onDistanceUnitChange(unit)}
              className={`px-2 py-1.5 font-medium ${
                distanceUnit === unit
                  ? "bg-surface text-accent shadow-sm"
                  : "text-ink-3 hover:bg-surface hover:text-ink-2"
              }`}
              aria-pressed={distanceUnit === unit}
            >
              {unit === "km" ? "Kilometers" : "Miles"}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-[11px] leading-snug text-ink-3">
          Display only. Monitor confidence still uses the documented 10/25 km method.
        </p>
      </Section>

      <Section title="Map layers">
        <ul className="space-y-2">
          {LAYERS.map((layer) => (
            <li key={layer.id}>
              <label className="flex cursor-pointer items-start gap-2">
                <input
                  type="checkbox"
                  checked={activeLayers.includes(layer.id)}
                  onChange={() => onToggleLayer(layer.id)}
                  className="mt-0.5 accent-[#1c5cab]"
                />
                <span>
                  <span className="block text-sm leading-tight">{layer.label}</span>
                  <span className="block text-[11px] leading-snug text-ink-3">
                    {layerDescription(layer.description)}
                  </span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      </Section>

      <div className="mt-auto px-3 py-3 text-[11px] leading-snug text-ink-3">
        Every value in this tool carries a source, timestamp, and confidence label. Amber
        “FALLBACK” badges mark synthetic placeholders — see the Methods page.
      </div>
    </div>
  );
}
