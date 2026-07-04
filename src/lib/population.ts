/**
 * County population + demographics. Committed Census-mirror snapshot with a
 * live Census ACS refresh path (keyless for modest use) used in production.
 */
import popFile from "@/data/population.json";
import { allCounties, countyForPoint, type CountyMeta } from "./counties";
import { haversineKm } from "./geo";
import { cached } from "./cache";
import { trackedFetchJson } from "./freshness";
import type { SourceRef } from "./types";

export interface PopulationRecord {
  population: number | null;
  areaSqMi: number | null;
  densityPerSqMi: number | null;
  minorityPct: number | null;
  blackPct: number | null;
  hispanicPct: number | null;
}

const records = popFile.records as Record<string, PopulationRecord>;

export const POPULATION_SOURCE: SourceRef = {
  name: popFile.source,
  url: popFile.sourceUrl,
  vintage: popFile.vintage,
  fetchedAt: popFile.generatedAt,
  status: popFile.status as SourceRef["status"],
  confidence: "medium",
  notes: popFile.notes,
};

export function populationForCounty(fips: string): PopulationRecord | null {
  return records[fips] ?? null;
}

/**
 * Live ACS county population (B01003_001E), cached 24 h. Keyless requests to
 * api.census.gov are rate-limited but fine at our volume. Falls back to the
 * committed snapshot (already Census-derived) when unreachable.
 */
export async function livePopulationForCounty(
  fips: string
): Promise<{ population: number | null; source: SourceRef }> {
  const hit = await cached(`acs:pop:${fips}`, 24 * 60 * 60 * 1000, async () => {
    const url =
      `https://api.census.gov/data/2023/acs/acs5?get=B01003_001E` +
      `&for=county:${fips.slice(2)}&in=state:${fips.slice(0, 2)}`;
    const data = await trackedFetchJson<string[][]>("US Census ACS 5-year API", url, {
      entityType: "population",
    });
    if (data && data[1]) {
      const population = parseInt(data[1][0], 10);
      if (Number.isFinite(population)) {
        return {
          population,
          source: {
            name: "US Census ACS 5-year (2023), table B01003",
            url: "https://api.census.gov/data/2023/acs/acs5",
            vintage: "ACS 2019-2023",
            fetchedAt: new Date().toISOString(),
            status: "live",
            confidence: "high",
            notes: null,
          } as SourceRef,
        };
      }
    }
    return {
      population: records[fips]?.population ?? null,
      source: POPULATION_SOURCE,
    };
  });
  return hit.value;
}

/**
 * Estimate population within `radiusKm` of a point by overlapping county
 * disks: each county is approximated as a disk of equal area at its centroid,
 * and the shared area fraction scales its population. A siting heuristic —
 * good to ~±30% in mixed urban/rural terrain — always labeled as an estimate.
 */
export function populationWithinRadius(
  lat: number,
  lng: number,
  radiusKm: number
): { estimate: number; countiesTouched: number } {
  let total = 0;
  let touched = 0;
  for (const c of allCounties()) {
    const rec = records[c.fips];
    if (!rec?.population || !rec.areaSqMi) continue;
    const d = haversineKm({ lat, lng }, { lat: c.centroidLat, lng: c.centroidLng });
    const countyRadiusKm = Math.sqrt((rec.areaSqMi * 2.59) / Math.PI); // sqmi -> km²
    if (d > radiusKm + countyRadiusKm) continue;
    // fraction of the county disk inside the query disk (linear approximation)
    let frac: number;
    if (d + countyRadiusKm <= radiusKm) {
      frac = 1; // county entirely inside
    } else if (d <= radiusKm) {
      frac = Math.min(1, (radiusKm - d + countyRadiusKm) / (2 * countyRadiusKm));
    } else {
      frac = Math.max(0, (radiusKm + countyRadiusKm - d) / (2 * countyRadiusKm)) * 0.5;
    }
    if (frac > 0.01) {
      total += rec.population * frac;
      touched++;
    }
  }
  return { estimate: Math.round(total), countiesTouched: touched };
}

export async function countyPopulationContext(lat: number, lng: number): Promise<{
  county: CountyMeta;
  record: PopulationRecord | null;
} | null> {
  const hit = await countyForPoint(lat, lng);
  if (!hit) return null;
  return { county: hit.county, record: records[hit.county.fips] ?? null };
}
