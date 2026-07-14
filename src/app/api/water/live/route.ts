import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { handleError, latLngSchema, ok, parseQuery } from "@/lib/api";
import { getUsgsWaterSnapshot } from "@/lib/usgs-water";

const querySchema = latLngSchema.extend({
  radiusKm: z.coerce.number().min(5).max(100).default(50),
});

export async function GET(request: NextRequest) {
  try {
    const query = parseQuery(request, querySchema);
    if (query instanceof NextResponse) return query;
    return ok(await getUsgsWaterSnapshot(query.lat, query.lng, query.radiusKm));
  } catch (error) {
    return handleError(error);
  }
}
