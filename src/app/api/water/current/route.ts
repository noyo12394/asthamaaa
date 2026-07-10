import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { handleError, latLngSchema, ok, parseQuery } from "@/lib/api";
import { getCurrentWaterQuality } from "@/lib/water";

const waterQuerySchema = latLngSchema.extend({
  zip: z.string().trim().regex(/^\d{5}$/).optional(),
  county: z.string().trim().optional(),
  state: z.string().trim().optional(),
});

export async function GET(req: NextRequest) {
  try {
    const query = parseQuery(req, waterQuerySchema);
    if (query instanceof NextResponse) return query;
    const { snapshot, cachedHit } = await getCurrentWaterQuality(query);
    return ok({ ...snapshot, servedFromCache: cachedHit });
  } catch (err) {
    return handleError(err);
  }
}
