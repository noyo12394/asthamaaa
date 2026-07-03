import { NextRequest } from "next/server";
import { z } from "zod";
import { addSavedLocation, deleteSavedLocation, listSavedLocations } from "@/lib/store";
import { bad, getUserId, handleError, ok, withUserCookie } from "@/lib/api";

const createSchema = z.object({
  label: z.string().min(1).max(120),
  address: z.string().max(300).nullish(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  county: z.string().max(120).nullish(),
  state: z.string().max(2).nullish(),
});

export async function GET(req: NextRequest) {
  try {
    const { userId, isNew } = getUserId(req);
    const locations = await listSavedLocations(userId);
    return withUserCookie(ok({ locations }), userId, isNew);
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { userId, isNew } = getUserId(req);
    const body = createSchema.safeParse(await req.json());
    if (!body.success) return bad(body.error.issues[0].message);
    const location = await addSavedLocation({
      userId,
      label: body.data.label,
      address: body.data.address ?? null,
      lat: body.data.lat,
      lng: body.data.lng,
      county: body.data.county ?? null,
      state: body.data.state ?? null,
    });
    return withUserCookie(ok({ location }, { status: 201 }), userId, isNew);
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { userId } = getUserId(req);
    const locId = req.nextUrl.searchParams.get("id");
    if (!locId) return bad("id query param required");
    const deleted = await deleteSavedLocation(userId, locId);
    if (!deleted) return bad("Not found", 404);
    return ok({ deleted: locId });
  } catch (err) {
    return handleError(err);
  }
}
