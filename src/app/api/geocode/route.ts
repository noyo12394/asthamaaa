import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { geocode } from "@/lib/geocode";
import { handleError, ok, parseQuery } from "@/lib/api";

const schema = z.object({
  q: z.string().min(1).max(200),
  count: z.coerce.number().int().min(1).max(10).default(5),
});

export async function GET(req: NextRequest) {
  try {
    const query = parseQuery(req, schema);
    if (query instanceof NextResponse) return query;
    const results = await geocode(query.q, query.count);
    return ok({ query: query.q, results });
  } catch (err) {
    return handleError(err);
  }
}
