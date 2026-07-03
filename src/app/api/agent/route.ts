import { NextRequest } from "next/server";
import { z } from "zod";
import { runAgent } from "@/lib/agent/agent";
import { bad, getUserId, handleError, ok, withUserCookie } from "@/lib/api";

const schema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(4000),
      })
    )
    .min(1)
    .max(30),
  location: z
    .object({
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
      label: z.string().max(200).optional(),
    })
    .nullish(),
});

export async function POST(req: NextRequest) {
  try {
    const { userId, isNew } = getUserId(req);
    const body = schema.safeParse(await req.json());
    if (!body.success) return bad(body.error.issues[0].message);
    const result = await runAgent(body.data.messages, {
      userId,
      location: body.data.location ?? null,
    });
    return withUserCookie(ok(result), userId, isNew);
  } catch (err) {
    return handleError(err);
  }
}
