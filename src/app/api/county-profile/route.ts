import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { countyByFips, countyByName, COUNTY_SOURCE } from "@/lib/counties";
import {
  healthForCounty,
  vulnerabilityForCounty,
  healthBurdenScore,
  vulnerabilityScore,
  HEALTH_SOURCE,
  VULNERABILITY_SOURCE,
} from "@/lib/health";
import { bad, handleError, ok, parseQuery } from "@/lib/api";

const schema = z
  .object({
    fips: z.string().regex(/^\d{5}$/).optional(),
    county: z.string().min(1).optional(),
    state: z.string().length(2).optional(),
  })
  .refine((v) => v.fips || (v.county && v.state), {
    message: "provide fips, or county and state",
  });

export async function GET(req: NextRequest) {
  try {
    const query = parseQuery(req, schema);
    if (query instanceof NextResponse) return query;
    const county = query.fips
      ? countyByFips(query.fips)
      : countyByName(query.county!, query.state!);
    if (!county) return bad("County not found", 404);

    const health = healthForCounty(county.fips) ?? null;
    const vuln = vulnerabilityForCounty(county.fips) ?? null;
    const burden = healthBurdenScore(county.fips);
    const vScore = vulnerabilityScore(county.fips);

    return ok({
      county: { ...county, source: COUNTY_SOURCE },
      health: health ? { ...health, source: HEALTH_SOURCE } : null,
      vulnerability: vuln ? { ...vuln, source: VULNERABILITY_SOURCE } : null,
      derived: {
        healthBurdenScore: burden.score,
        dominantBurden: burden.dominant,
        vulnerabilityScore: vScore.score,
        methodology: "See /methods — burden is the mean of prevalence values normalized to high-burden ceilings; vulnerability is the SVI percentile ×100.",
      },
      disclaimer:
        "County-level population indicators. They describe community context and must not be presented as any individual's diagnosis or risk.",
    });
  } catch (err) {
    return handleError(err);
  }
}
