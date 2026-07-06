import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { generateClinicCard } from "@/lib/clinic";
import { handleError, ok, parseQuery } from "@/lib/api";

const schema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  language: z.enum(["en", "es"]).default("en"),
  condition: z.enum(["asthma", "copd", "heart-disease", "diabetes", "general"]).default("general"),
});

/** Clinic Mode card: structured plain-language handout content. */
export async function GET(req: NextRequest) {
  try {
    const query = parseQuery(req, schema);
    if (query instanceof NextResponse) return query;
    const card = await generateClinicCard(query.lat, query.lng, query.condition, query.language);
    return ok(card);
  } catch (err) {
    return handleError(err);
  }
}
