import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { toolByName } from "@/lib/agent/tools";
import { handleError, ok, parseQuery } from "@/lib/api";

const schema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  language: z.enum(["en", "es"]).default("en"),
  conditions: z.string().default(""),
});

/** Clinic Mode backend: deterministic, prevention-focused resident handout. */
export async function GET(req: NextRequest) {
  try {
    const query = parseQuery(req, schema);
    if (query instanceof NextResponse) return query;
    const tool = toolByName("generateClinicMessage")!;
    const result = await tool.execute(
      {
        lat: query.lat,
        lng: query.lng,
        language: query.language,
        conditionProfile: query.conditions || null,
      },
      { userId: "system" }
    );
    return ok(result);
  } catch (err) {
    return handleError(err);
  }
}
