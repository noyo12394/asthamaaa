import { NextRequest } from "next/server";
import { z } from "zod";
import { addWatchRule, listWatchRules } from "@/lib/store";
import { bad, getUserId, handleError, ok, withUserCookie } from "@/lib/api";

const createSchema = z.object({
  name: z.string().min(1).max(160),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  locationLabel: z.string().max(160).nullish(),
  conditionProfile: z.string().max(300).nullish(), // e.g. "asthma, age 70"
  thresholdAqi: z.number().int().min(10).max(400),
  pollutant: z.enum(["us_aqi", "pm25", "ozone"]).default("us_aqi"),
});

export async function GET(req: NextRequest) {
  try {
    const { userId, isNew } = getUserId(req);
    const rules = await listWatchRules(userId);
    return withUserCookie(ok({ rules }), userId, isNew);
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { userId, isNew } = getUserId(req);
    const body = createSchema.safeParse(await req.json());
    if (!body.success) return bad(body.error.issues[0].message);
    const rule = await addWatchRule({
      userId,
      name: body.data.name,
      lat: body.data.lat,
      lng: body.data.lng,
      locationLabel: body.data.locationLabel ?? null,
      conditionProfile: body.data.conditionProfile ?? null,
      thresholdAqi: body.data.thresholdAqi,
      pollutant: body.data.pollutant,
      active: true,
    });
    return withUserCookie(ok({ rule }, { status: 201 }), userId, isNew);
  } catch (err) {
    return handleError(err);
  }
}
