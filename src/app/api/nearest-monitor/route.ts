import { NextRequest, NextResponse } from "next/server";
import { nearestMonitor } from "@/lib/monitors";
import { bad, handleError, latLngSchema, ok, parseQuery } from "@/lib/api";

export async function GET(req: NextRequest) {
  try {
    const query = parseQuery(req, latLngSchema);
    if (query instanceof NextResponse) return query;
    const result = nearestMonitor(query.lat, query.lng);
    if (!result) return bad("No monitors available", 404);
    return ok(result);
  } catch (err) {
    return handleError(err);
  }
}
