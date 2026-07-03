import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { toolByName } from "@/lib/agent/tools";
import { handleError, ok, parseQuery } from "@/lib/api";

const schema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  radiusKm: z.coerce.number().min(10).max(500).default(120),
  count: z.coerce.number().int().min(1).max(10).default(6),
});

/** Monitor Gap view backend: same logic the agent uses, as a plain endpoint. */
export async function GET(req: NextRequest) {
  try {
    const query = parseQuery(req, schema);
    if (query instanceof NextResponse) return query;
    const tool = toolByName("recommendSensorPlacement")!;
    const result = await tool.execute(
      { lat: query.lat, lng: query.lng, radiusKm: query.radiusKm, count: query.count },
      { userId: "system" }
    );
    return ok(result);
  } catch (err) {
    return handleError(err);
  }
}
