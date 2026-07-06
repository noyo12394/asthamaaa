import { NextRequest } from "next/server";
import { geocode } from "@/lib/geocode";
import { generateClinicCard, cardToPlainText, type ClinicCondition } from "@/lib/clinic";

/**
 * Low-bandwidth text path for Clinic Mode: plain text/plain response suitable
 * for an SMS gateway (Twilio webhook can proxy straight to this) or curl in
 * the field.
 *
 *   GET /api/text-card?q=<zip or place>&condition=asthma&language=es
 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();
  const language = req.nextUrl.searchParams.get("language") === "es" ? "es" : "en";
  const condRaw = req.nextUrl.searchParams.get("condition") ?? "general";
  const condition = (
    ["asthma", "copd", "heart-disease", "diabetes", "general"].includes(condRaw)
      ? condRaw
      : "general"
  ) as ClinicCondition;

  const text = (s: string, status = 200) =>
    new Response(s, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });

  if (!q) {
    return text(
      "PASS Equity Atlas text card.\nUsage: /api/text-card?q=<zip or place>&condition=asthma|copd|heart-disease|diabetes&language=en|es",
      400
    );
  }
  try {
    const results = await geocode(q, 1);
    if (results.length === 0) {
      return text(
        language === "es"
          ? `No se encontró "${q}". Pruebe con ciudad y estado, p. ej. "Allentown, PA".`
          : `Could not find "${q}". Try city and state, e.g. "Allentown, PA".`,
        404
      );
    }
    const card = await generateClinicCard(results[0].lat, results[0].lng, condition, language);
    return text(`${results[0].displayName}\n${cardToPlainText(card)}`);
  } catch {
    return text("Temporary error — try again shortly.", 500);
  }
}
