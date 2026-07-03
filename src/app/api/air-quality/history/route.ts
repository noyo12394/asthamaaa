import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAirQualityHistory } from "@/lib/openmeteo";
import { handleError, ok, parseQuery } from "@/lib/api";

const schema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  range: z.enum(["24h", "48h", "72h"]).default("48h"),
});

export async function GET(req: NextRequest) {
  try {
    const query = parseQuery(req, schema);
    if (query instanceof NextResponse) return query;
    const days = { "24h": 1, "48h": 2, "72h": 3 }[query.range];
    const { points, source } = await getAirQualityHistory(query.lat, query.lng, days, days);
    return ok({ lat: query.lat, lng: query.lng, range: query.range, points, source });
  } catch (err) {
    return handleError(err);
  }
}
