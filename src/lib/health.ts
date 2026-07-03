/** County health & vulnerability indicator access over committed snapshots. */
import healthFile from "@/data/health.json";
import vulnFile from "@/data/vulnerability.json";
import type { SourceRef } from "./types";

export interface HealthRecord {
  countyFips: string;
  asthma: number | null;
  copd: number | null;
  diabetes: number | null;
  hypertension: number | null;
  heartDisease: number | null;
  obesity: number | null;
  cancer: number | null;
  year?: string;
}

export interface VulnerabilityRecord {
  countyFips: string;
  svi: number | null;
  poverty: number | null;
  elderly: number | null;
  children: number | null;
  disability: number | null;
  limitedEnglish: number | null;
  noVehicle: number | null;
}

const healthRecords = healthFile.records as HealthRecord[];
const vulnRecords = vulnFile.records as VulnerabilityRecord[];
const healthByFips = new Map(healthRecords.map((r) => [r.countyFips, r]));
const vulnByFips = new Map(vulnRecords.map((r) => [r.countyFips, r]));

export const HEALTH_SOURCE: SourceRef = {
  name: healthFile.source,
  url: healthFile.sourceUrl,
  vintage: healthFile.vintage,
  fetchedAt: healthFile.generatedAt,
  status: healthFile.status as SourceRef["status"],
  confidence: healthFile.status === "official" ? "medium" : "low",
  notes: healthFile.notes,
};

export const VULNERABILITY_SOURCE: SourceRef = {
  name: vulnFile.source,
  url: vulnFile.sourceUrl,
  vintage: vulnFile.vintage,
  fetchedAt: vulnFile.generatedAt,
  status: vulnFile.status as SourceRef["status"],
  confidence: vulnFile.status === "official" ? "medium" : "low",
  notes: vulnFile.notes,
};

export function healthForCounty(fips: string): HealthRecord | undefined {
  return healthByFips.get(fips);
}

export function vulnerabilityForCounty(fips: string): VulnerabilityRecord | undefined {
  return vulnByFips.get(fips);
}

/**
 * Health burden score 0-100: mean of each measure normalized against a
 * "high burden" reference ceiling (roughly the 95th percentile of county
 * prevalence nationally). Documented in SCORING.md.
 */
const BURDEN_CEILINGS: Record<string, number> = {
  asthma: 14,
  copd: 12,
  diabetes: 18,
  hypertension: 45,
  heartDisease: 10,
  obesity: 45,
};

export function healthBurdenScore(fips: string): {
  score: number | null;
  dominant: string | null;
  detail: Record<string, number | null>;
} {
  const rec = healthByFips.get(fips);
  if (!rec) return { score: null, dominant: null, detail: {} };
  let sum = 0;
  let n = 0;
  let dominant: string | null = null;
  let dominantRatio = -1;
  const detail: Record<string, number | null> = {};
  for (const [measure, ceiling] of Object.entries(BURDEN_CEILINGS)) {
    const v = rec[measure as keyof HealthRecord] as number | null;
    detail[measure] = v;
    if (v == null) continue;
    const ratio = Math.min(1, v / ceiling);
    sum += ratio;
    n++;
    if (ratio > dominantRatio) {
      dominantRatio = ratio;
      dominant = measure;
    }
  }
  if (n === 0) return { score: null, dominant: null, detail };
  return { score: Math.round((sum / n) * 100), dominant, detail };
}

/** Vulnerability score 0-100 from SVI percentile (or component mean if absent). */
export function vulnerabilityScore(fips: string): { score: number | null; svi: number | null } {
  const rec = vulnByFips.get(fips);
  if (!rec) return { score: null, svi: null };
  if (rec.svi != null) return { score: Math.round(rec.svi * 100), svi: rec.svi };
  const ceilings: Record<string, number> = {
    poverty: 30,
    elderly: 30,
    disability: 22,
    limitedEnglish: 15,
    noVehicle: 20,
  };
  let sum = 0;
  let n = 0;
  for (const [k, ceiling] of Object.entries(ceilings)) {
    const v = rec[k as keyof VulnerabilityRecord] as number | null;
    if (v == null) continue;
    sum += Math.min(1, v / ceiling);
    n++;
  }
  return n === 0 ? { score: null, svi: null } : { score: Math.round((sum / n) * 100), svi: null };
}
