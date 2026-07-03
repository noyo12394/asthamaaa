import { NextRequest, NextResponse } from "next/server";
import { getCurrentAirQuality } from "@/lib/openmeteo";
import { handleError, latLngSchema, ok, parseQuery } from "@/lib/api";

export async function GET(req: NextRequest) {
  try {
    const query = parseQuery(req, latLngSchema);
    if (query instanceof NextResponse) return query;
    const { snapshot, cachedHit } = await getCurrentAirQuality(query.lat, query.lng);
    return ok({ ...snapshot, servedFromCache: cachedHit });
  } catch (err) {
    return handleError(err);
  }
}
