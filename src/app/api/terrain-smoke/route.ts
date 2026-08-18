import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { handleError, ok, parseQuery } from "@/lib/api";
import { getTerrainSmokeAnalysis } from "@/lib/terrain-smoke";

export const maxDuration = 30;

const schema = z.object({
  lat: z.coerce.number().min(24).max(50),
  lng: z.coerce.number().min(-126).max(-66),
  radiusKm: z.coerce.number().min(15).max(75).default(40),
  pastDays: z.coerce.number().int().min(3).max(7).default(7),
});

export async function GET(req: NextRequest) {
  try {
    const query = parseQuery(req, schema);
    if (query instanceof NextResponse) return query;
    const analysis = await getTerrainSmokeAnalysis(
      query.lat,
      query.lng,
      query.radiusKm,
      query.pastDays
    );
    return ok(analysis);
  } catch (error) {
    return handleError(error);
  }
}
