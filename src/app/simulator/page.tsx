"use client";

/**
 * Sensor Placement Simulator — flagship. Click the map to drop up to three
 * hypothetical temporary monitors; see before/after sparsity class, coverage
 * gained, and estimated population served, ranked like a resource-allocation
 * decision. Explicitly a coverage simulation, never a pollution prediction.
 */
import { useState } from "react";
import SiteHeader from "@/components/SiteHeader";
import SimMap, { type SimCandidate } from "@/components/sim/SimMap";
import SearchBox from "@/components/ui/SearchBox";
import { api } from "@/lib/client/api";
import { Spinner } from "@/components/ui/bits";
import Link from "next/link";

interface CandidateResult {
  label: string;
  lat: number;
  lng: number;
  before: { class: string; nearestKm: number | null };
  classChanged: boolean;
  upgradedAreaSqKm: number;
  coverageRadiusGainedMiles: number;
  populationNewlyServed: number;
  populationWithin25Km: number;
  populationPerMileGained: number;
  narrative: string;
}

interface SimResponse {
  candidates: CandidateResult[];
  methodology: string;
  disclaimers: string[];
}

const CAND_COLORS = ["#1c5cab", "#b97b00", "#6f5cc3"];
const CLASS_STYLE: Record<string, string> = {
  dense: "bg-[#d2ecec] text-[#125858]",
  moderate: "bg-[#e3edf9] text-[#1c5cab]",
  sparse: "bg-[#faf3d7] text-[#8a6d00]",
  remote: "bg-[#fbe8dc] text-[#a04416]",
};

export default function SimulatorPage() {
  const [candidates, setCandidates] = useState<SimCandidate[]>([]);
  const [result, setResult] = useState<SimResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [center, setCenter] = useState<[number, number] | null>(null);

  async function runSim(cands: SimCandidate[]) {
    if (cands.length === 0) {
      setResult(null);
      return;
    }
    setBusy(true);
    try {
      const d = await api<SimResponse>("/api/sensor-sim", {
        method: "POST",
        body: JSON.stringify({ candidates: cands }),
      });
      setResult(d);
    } finally {
      setBusy(false);
    }
  }

  function addCandidate(lat: number, lng: number) {
    setCandidates((cur) => {
      if (cur.length >= 3) return cur;
      const next = [
        ...cur,
        { lat, lng, label: `Candidate ${String.fromCharCode(65 + cur.length)}` },
      ];
      void runSim(next);
      return next;
    });
  }

  function removeCandidate(i: number) {
    setCandidates((cur) => {
      const next = cur
        .filter((_, j) => j !== i)
        .map((c, j) => ({ ...c, label: `Candidate ${String.fromCharCode(65 + j)}` }));
      void runSim(next);
      return next;
    });
  }

  return (
    <div className="flex h-dvh flex-col">
      <SiteHeader />
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <div className="relative h-64 min-h-0 flex-1 md:h-auto">
          <SimMap candidates={candidates} onAdd={addCandidate} center={center} />
          <div className="absolute top-2 left-2 w-72 max-w-[calc(100%-1rem)]">
            <SearchBox
              placeholder="Fly to an area…"
              onPick={(p) => setCenter([p.lng, p.lat])}
            />
          </div>
          <div className="panel absolute bottom-8 left-2 max-w-[240px] rounded-sm p-2 text-[11px] leading-snug text-ink-2">
            Click anywhere to drop a hypothetical temporary monitor (up to 3). Teal rings are
            existing coverage; dashed rings are your candidates’ 25 km reach.
          </div>
        </div>

        <aside className="w-full shrink-0 overflow-y-auto border-l border-hairline bg-surface md:w-[420px]">
          <div className="border-b border-hairline px-4 py-3">
            <h1 className="text-base font-semibold">Sensor Placement Simulator</h1>
            <p className="mt-1 text-xs leading-snug text-ink-2">
              A resource-allocation view: where would one temporary monitor most improve{" "}
              <em>observability</em>? Candidates are ranked by estimated population newly served
              per mile of coverage gained.
            </p>
            <p className="mt-2 border-l-2 border-warning pl-2 text-[11px] leading-snug text-ink-3">
              Simulation of coverage geometry only — it does not predict what a sensor would
              measure, and it does not change actual air quality.
            </p>
          </div>

          {candidates.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-ink-3">
              <p>Drop a candidate on the map to begin.</p>
              <p className="mt-2 text-xs">
                Looking for regional priorities first? See the{" "}
                <Link href="/monitor-gaps" className="text-accent hover:underline">
                  county gap ranking
                </Link>
                .
              </p>
            </div>
          )}

          {busy && (
            <div className="px-4 py-4">
              <Spinner label="Simulating coverage…" />
            </div>
          )}

          {result && !busy && (
            <div className="space-y-3 px-4 py-3">
              {result.candidates.map((c, rank) => {
                const idx = candidates.findIndex((x) => x.label === c.label);
                return (
                  <div key={c.label} className="panel p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2 text-sm font-semibold">
                        <span
                          className="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-white"
                          style={{ background: CAND_COLORS[idx] ?? "#52514e" }}
                        >
                          {c.label.slice(-1)}
                        </span>
                        {c.label}
                        {rank === 0 && result.candidates.length > 1 && (
                          <span className="rounded-sm bg-accent-soft px-1.5 py-px text-[10px] font-medium text-accent">
                            best value
                          </span>
                        )}
                      </span>
                      <button
                        onClick={() => removeCandidate(idx)}
                        className="text-xs text-ink-3 hover:text-critical"
                        aria-label={`Remove ${c.label}`}
                      >
                        remove
                      </button>
                    </div>

                    <div className="tabular mt-2 flex items-center gap-2 text-xs">
                      <span className={`rounded-sm px-1.5 py-0.5 font-medium ${CLASS_STYLE[c.before.class]}`}>
                        {c.before.class}
                        {c.before.nearestKm != null && ` · ${c.before.nearestKm} km`}
                      </span>
                      <span className="text-ink-3">→</span>
                      <span className={`rounded-sm px-1.5 py-0.5 font-medium ${CLASS_STYLE.dense}`}>
                        dense · on-site
                      </span>
                    </div>

                    <dl className="tabular mt-2.5 grid grid-cols-3 gap-2 text-center text-xs">
                      <div className="border border-hairline px-1 py-1.5">
                        <dt className="text-[9px] uppercase tracking-wide text-ink-3">
                          Area upgraded
                        </dt>
                        <dd className="mt-0.5 font-semibold">
                          {c.upgradedAreaSqKm.toLocaleString()} km²
                        </dd>
                      </div>
                      <div className="border border-hairline px-1 py-1.5">
                        <dt className="text-[9px] uppercase tracking-wide text-ink-3">
                          Newly served
                        </dt>
                        <dd className="mt-0.5 font-semibold">
                          ~{c.populationNewlyServed.toLocaleString()}
                        </dd>
                      </div>
                      <div className="border border-hairline px-1 py-1.5">
                        <dt className="text-[9px] uppercase tracking-wide text-ink-3">
                          People / mile
                        </dt>
                        <dd className="mt-0.5 font-semibold">
                          {c.populationPerMileGained.toLocaleString()}
                        </dd>
                      </div>
                    </dl>

                    <p className="mt-2 text-[11px] leading-snug text-ink-2">{c.narrative}</p>
                    <p className="tabular mt-1 text-[10px] text-ink-3">
                      ~{c.populationWithin25Km.toLocaleString()} people live within 25 km of this
                      site · +{c.coverageRadiusGainedMiles} mi equivalent coverage radius
                    </p>
                  </div>
                );
              })}

              <details className="text-[11px] text-ink-3">
                <summary className="cursor-pointer font-medium text-ink-2">
                  Methodology &amp; limits
                </summary>
                <p className="mt-1 leading-snug">{result.methodology}</p>
                <ul className="mt-1.5 list-disc space-y-1 pl-4">
                  {result.disclaimers.map((d, i) => (
                    <li key={i}>{d}</li>
                  ))}
                </ul>
              </details>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
