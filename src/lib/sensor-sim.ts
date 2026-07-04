/**
 * Sensor Placement Simulator engine.
 *
 * Given hypothetical monitor placements, quantify what each would change:
 *  - sparsity class at the site, before → after
 *  - area upgraded out of sparse/remote (sampled on a ~5 km lattice)
 *  - estimated population newly brought within 25 km of ANY monitor
 *  - ranking by population served per mile of coverage-radius gained
 *
 * THIS IS A SIMULATION of distance-to-monitor coverage geometry. It does not
 * predict what a real sensor would measure, and placing a sensor does not
 * change pollution — it changes how observable pollution is. Every response
 * carries that disclaimer.
 */
import { allMonitors } from "./monitors";
import { classForDistance, classifyWithExtraMonitors, type SparsityClass } from "./sparsity";
import { allCounties } from "./counties";
import { populationForCounty, populationWithinRadius } from "./population";
import { haversineKm } from "./geo";
import type { MonitorRecord } from "./types";

export interface CandidateInput {
  lat: number;
  lng: number;
  label?: string;
}

export interface CandidateResult {
  label: string;
  lat: number;
  lng: number;
  before: { class: SparsityClass; nearestKm: number | null };
  after: { class: SparsityClass; nearestKm: number };
  classChanged: boolean;
  upgradedAreaSqKm: number; // area moved out of sparse/remote (>25 km) coverage
  coverageRadiusGainedMiles: number; // equivalent-circle radius of that area
  populationNewlyServed: number; // people in the upgraded area (density-weighted)
  populationWithin25Km: number; // total people within the site's 25 km radius
  populationPerMileGained: number; // ranking metric
  narrative: string;
}

export interface SimulationResult {
  candidates: CandidateResult[]; // sorted by populationPerMileGained desc
  methodology: string;
  disclaimers: string[];
}

const SAMPLE_STEP_KM = 5;
const SAMPLE_RADIUS_KM = 45; // how far a new monitor's influence is evaluated
const COVERED_KM = 25; // ≤25 km = at least "moderate" (ground-anchored)

interface Sample {
  lat: number;
  lng: number;
  densityPerSqKm: number;
}

function nearestDistance(lat: number, lng: number, monitors: MonitorRecord[]): number {
  let best = Infinity;
  for (const m of monitors) {
    const d = haversineKm({ lat, lng }, { lat: m.lat, lng: m.lng });
    if (d < best) best = d;
  }
  return best;
}

export function simulatePlacements(inputs: CandidateInput[]): SimulationResult {
  const monitors = allMonitors().filter((m) => m.active);

  const results: CandidateResult[] = inputs.slice(0, 3).map((cand, i) => {
    const label = cand.label?.trim() || `Candidate ${String.fromCharCode(65 + i)}`;

    // Restrict to monitors that could matter near this candidate.
    const localMonitors = monitors.filter(
      (m) => haversineKm({ lat: cand.lat, lng: cand.lng }, { lat: m.lat, lng: m.lng }) < 200
    );

    const beforeAtSite = classifyWithExtraMonitors(cand.lat, cand.lng, [], localMonitors);

    // Sample lattice around the candidate.
    const kmPerDegLat = 110.574;
    const kmPerDegLng = 111.32 * Math.cos((cand.lat * Math.PI) / 180);
    const dLat = SAMPLE_STEP_KM / kmPerDegLat;
    const dLng = SAMPLE_STEP_KM / kmPerDegLng;
    const steps = Math.ceil(SAMPLE_RADIUS_KM / SAMPLE_STEP_KM);

    // Precompute county densities near the candidate for the population term.
    const nearbyCounties = allCounties()
      .map((c) => ({
        c,
        d: haversineKm({ lat: cand.lat, lng: cand.lng }, { lat: c.centroidLat, lng: c.centroidLng }),
      }))
      .filter((x) => x.d < 160)
      .map((x) => {
        const rec = populationForCounty(x.c.fips);
        return {
          lat: x.c.centroidLat,
          lng: x.c.centroidLng,
          densityPerSqKm: rec?.densityPerSqMi ? rec.densityPerSqMi / 2.59 : 20,
        };
      });

    const densityAt = (lat: number, lng: number): number => {
      let best = Infinity;
      let density = 20; // rural default when no county nearby
      for (const c of nearbyCounties) {
        const d = haversineKm({ lat, lng }, { lat: c.lat, lng: c.lng });
        if (d < best) {
          best = d;
          density = c.densityPerSqKm;
        }
      }
      return density;
    };

    const upgraded: Sample[] = [];
    for (let ix = -steps; ix <= steps; ix++) {
      for (let iy = -steps; iy <= steps; iy++) {
        const sLat = cand.lat + iy * dLat;
        const sLng = cand.lng + ix * dLng;
        const dToCand = haversineKm({ lat: sLat, lng: sLng }, { lat: cand.lat, lng: cand.lng });
        if (dToCand > SAMPLE_RADIUS_KM) continue;
        const before = nearestDistance(sLat, sLng, localMonitors);
        if (before <= COVERED_KM) continue; // already covered
        const after = Math.min(before, dToCand);
        if (after <= COVERED_KM) {
          upgraded.push({ lat: sLat, lng: sLng, densityPerSqKm: densityAt(sLat, sLng) });
        }
      }
    }

    const cellAreaSqKm = SAMPLE_STEP_KM * SAMPLE_STEP_KM;
    const upgradedAreaSqKm = Math.round(upgraded.length * cellAreaSqKm);
    const populationNewlyServed = Math.round(
      upgraded.reduce((sum, s) => sum + s.densityPerSqKm * cellAreaSqKm, 0)
    );
    const radiusGainedKm = Math.sqrt(upgradedAreaSqKm / Math.PI);
    const coverageRadiusGainedMiles = Math.round(radiusGainedKm * 0.6214 * 10) / 10;
    const populationPerMileGained =
      coverageRadiusGainedMiles > 0
        ? Math.round(populationNewlyServed / coverageRadiusGainedMiles)
        : 0;

    const afterAtSite = classifyWithExtraMonitors(
      cand.lat,
      cand.lng,
      [{ lat: cand.lat, lng: cand.lng }],
      localMonitors
    );
    const within25 = populationWithinRadius(cand.lat, cand.lng, COVERED_KM);

    const narrative =
      beforeAtSite.class === "dense" || beforeAtSite.class === "moderate"
        ? `This area is already ${beforeAtSite.class} (nearest monitor ${beforeAtSite.nearestKm} km). A sensor here adds redundancy rather than new coverage — consider a sparse/remote candidate instead.`
        : `Upgrades the site from ${beforeAtSite.class} to dense coverage and moves ~${upgradedAreaSqKm.toLocaleString()} km² out of the sparse/remote class, bringing an estimated ${populationNewlyServed.toLocaleString()} residents within 25 km of a monitor for the first time.`;

    return {
      label,
      lat: cand.lat,
      lng: cand.lng,
      before: beforeAtSite,
      after: { class: classForDistance(0), nearestKm: 0 },
      classChanged: beforeAtSite.class !== afterAtSite.class,
      upgradedAreaSqKm,
      coverageRadiusGainedMiles,
      populationNewlyServed,
      populationWithin25Km: within25.estimate,
      populationPerMileGained,
      narrative,
    };
  });

  results.sort((a, b) => b.populationPerMileGained - a.populationPerMileGained);

  return {
    candidates: results,
    methodology:
      `Coverage sampled on a ${SAMPLE_STEP_KM} km lattice within ${SAMPLE_RADIUS_KM} km of each candidate; ` +
      `"covered" means within ${COVERED_KM} km of any active monitor. Population uses county density at each upgraded sample ` +
      `(Census-derived), so the estimate is coarse in mixed urban/rural terrain. Ranking = population newly served ÷ miles of equivalent coverage radius gained.`,
    disclaimers: [
      "This simulates coverage geometry (distance to monitor), not what a real sensor would measure — no pollution values are predicted for the hypothetical site.",
      "Placing a sensor changes how observable air quality is, not the air quality itself.",
      "Population figures are density-weighted estimates (~±30%), not counts of individuals.",
      "Monitor metadata status applies: if the monitor list is a labeled fallback seed, distances reflect seed placements.",
    ],
  };
}
