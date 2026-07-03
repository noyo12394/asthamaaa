/** Route-handler helpers: validation, error envelopes, anonymous identity. */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { persistenceMode } from "./store";

export function ok(data: unknown, init?: ResponseInit): NextResponse {
  return NextResponse.json(
    { ok: true, persistence: persistenceMode(), generatedAt: new Date().toISOString(), data },
    init
  );
}

export function bad(message: string, status = 400): NextResponse {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export function handleError(err: unknown): NextResponse {
  console.error("[api]", err);
  const message = err instanceof Error ? err.message : "Internal error";
  return NextResponse.json({ ok: false, error: message }, { status: 500 });
}

export const latLngSchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
});

export function parseQuery<T extends z.ZodTypeAny>(
  req: NextRequest,
  schema: T
): z.infer<T> | NextResponse {
  const obj = Object.fromEntries(req.nextUrl.searchParams.entries());
  const parsed = schema.safeParse(obj);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return bad(`Invalid query: ${issue.path.join(".")} — ${issue.message}`);
  }
  return parsed.data;
}

const UID_COOKIE = "atlas_uid";

/** Anonymous per-browser identity; no auth system in v1. */
export function getUserId(req: NextRequest): { userId: string; isNew: boolean } {
  const existing = req.cookies.get(UID_COOKIE)?.value;
  if (existing && /^[a-z0-9_-]{8,64}$/i.test(existing)) {
    return { userId: existing, isNew: false };
  }
  const userId = `anon_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  return { userId, isNew: true };
}

export function withUserCookie(res: NextResponse, userId: string, isNew: boolean): NextResponse {
  if (isNew) {
    res.cookies.set(UID_COOKIE, userId, {
      httpOnly: true,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 365,
      path: "/",
    });
  }
  return res;
}
