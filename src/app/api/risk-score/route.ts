import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { calculateRiskScore } from "@/lib/scoring";
import { recordRiskScore } from "@/lib/store";
import { handleError, ok, parseQuery } from "@/lib/api";

const schema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  conditions: z.string().default(""), // comma-separated, e.g. "asthma,copd"
  age: z.coerce.number().int().min(0).max(120).optional(),
});

export async function GET(req: NextRequest) {
  try {
    const query = parseQuery(req, schema);
    if (query instanceof NextResponse) return query;
    const conditions = query.conditions
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const result = await calculateRiskScore(query.lat, query.lng, {
      age: query.age ?? null,
      conditions,
    });
    // best-effort durable history; never blocks the response
    recordRiskScore(result).catch(() => {});
    return ok(result);
  } catch (err) {
    return handleError(err);
  }
}
