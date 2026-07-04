import { NextRequest } from "next/server";
import { z } from "zod";
import { addCommunityReport, listCommunityReports } from "@/lib/store";
import { bad, getUserId, handleError, ok, withUserCookie } from "@/lib/api";

const createSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  reportType: z.enum(["smoke", "odor", "dust", "burning", "visibility", "health-symptom", "other"]),
  intensity: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  note: z.string().max(500).nullish(),
});

export async function GET() {
  try {
    const reports = await listCommunityReports();
    return ok({
      reports,
      disclaimer:
        "Community reports are unverified resident observations. They are displayed separately from official measurements and never feed the scoring engine.",
    });
  } catch (err) {
    return handleError(err);
  }
}

// Anonymous rate limit: 5 reports per user per 10 minutes (per instance).
const recentByUser = new Map<string, number[]>();

export async function POST(req: NextRequest) {
  try {
    const { userId, isNew } = getUserId(req);
    const now = Date.now();
    const recent = (recentByUser.get(userId) ?? []).filter((t) => now - t < 10 * 60 * 1000);
    if (recent.length >= 5) {
      return bad("Rate limit: at most 5 community reports per 10 minutes.", 429);
    }
    recent.push(now);
    recentByUser.set(userId, recent);
    const body = createSchema.safeParse(await req.json());
    if (!body.success) return bad(body.error.issues[0].message);
    const report = await addCommunityReport({
      userId,
      lat: body.data.lat,
      lng: body.data.lng,
      reportType: body.data.reportType,
      intensity: body.data.intensity,
      note: body.data.note ?? null,
    });
    return withUserCookie(ok({ report }, { status: 201 }), userId, isNew);
  } catch (err) {
    return handleError(err);
  }
}
