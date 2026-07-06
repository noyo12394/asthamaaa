"use client";

/** Monitor Gap view: where low-cost sensors would add the most value. */
import { useState } from "react";
import SiteHeader from "@/components/SiteHeader";
import SearchBox, { type PickedPlace } from "@/components/ui/SearchBox";
import { api } from "@/lib/client/api";
import { Spinner, StatusBadge } from "@/components/ui/bits";
import { MONITOR_STATUS } from "./sources";

interface Candidate {
  county: string;
  fips: string;
  distanceKm: number;
  coverageGap: number;
  vulnerability: number;
  priority: number;
  nearestMonitorKm: number | null;
  why: string;
}

export default function MonitorGapsPage() {
  const [place, setPlace] = useState<PickedPlace | null>(null);
  const [radius, setRadius] = useState(120);
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [methodology, setMethodology] = useState<string>("");
  const [loading, setLoading] = useState(false);

  async function run(p: PickedPlace, r: number) {
    setLoading(true);
    try {
      const d = await api<{ candidates: Candidate[]; methodology: string }>(
        `/api/sensor-recommendations?lat=${p.lat}&lng=${p.lng}&radiusKm=${r}&count=8`
      );
      setCandidates(d.candidates);
      setMethodology(d.methodology);
    } catch {
      setCandidates([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6">
        <h1 className="text-lg font-semibold">Monitor gaps &amp; sensor placement</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-2">
          Areas far from any regulatory monitor rely entirely on model estimates. This view ranks
          counties around a point where temporary low-cost sensors (e.g. PurpleAir-class) would
          most reduce blind spots — weighting coverage gap at 55% and social vulnerability at 45%.
        </p>
        <p className="mt-2 flex items-center gap-2 text-[11px] text-ink-3">
          Monitor metadata status: <StatusBadge status={MONITOR_STATUS} />
          {MONITOR_STATUS !== "official" &&
            "distances reflect seed placements until the AirNow site list is ingested."}
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <SearchBox
            placeholder="Center the analysis on…"
            onPick={(p) => {
              setPlace(p);
              void run(p, radius);
            }}
          />
          <label className="flex items-center gap-2 text-xs text-ink-2">
            Radius
            <select
              value={radius}
              onChange={(e) => {
                const r = parseInt(e.target.value, 10);
                setRadius(r);
                if (place) void run(place, r);
              }}
              className="border border-hairline bg-surface px-2 py-1.5"
            >
              {[60, 120, 200, 300].map((r) => (
                <option key={r} value={r}>
                  {r} km
                </option>
              ))}
            </select>
          </label>
        </div>

        {loading && (
          <div className="mt-8 text-center">
            <Spinner label="Ranking counties…" />
          </div>
        )}

        {!loading && candidates && (
          <ol className="mt-5 space-y-3">
            {candidates.map((c, i) => (
              <li key={c.fips} className="panel px-4 py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-sm font-semibold">
                    {i + 1}. {c.county}
                  </span>
                  <span className="tabular text-xs text-ink-2">
                    priority <span className="text-base font-semibold text-ink">{c.priority}</span>
                    /100
                  </span>
                </div>
                <div className="tabular mt-1.5 flex flex-wrap gap-x-5 gap-y-1 text-xs text-ink-2">
                  <span>coverage gap {c.coverageGap}/100</span>
                  <span>vulnerability {c.vulnerability}/100</span>
                  <span>nearest monitor {c.nearestMonitorKm ?? "?"} km</span>
                  <span>{c.distanceKm} km from center</span>
                </div>
                <p className="mt-1.5 text-xs leading-snug text-ink-3">
                  <span className="font-medium text-ink-2">Why this helps: </span>
                  {c.why}
                </p>
              </li>
            ))}
          </ol>
        )}

        {methodology && (
          <p className="mt-4 text-[11px] leading-snug text-ink-3">{methodology}</p>
        )}
        {!candidates && !loading && (
          <p className="mt-10 text-center text-sm text-ink-3">
            Pick a center point to analyze coverage, e.g. “Allentown, PA”.
          </p>
        )}
      </main>
    </div>
  );
}
