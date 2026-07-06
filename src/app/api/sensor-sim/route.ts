import { NextRequest } from "next/server";
import { z } from "zod";
import { simulatePlacements } from "@/lib/sensor-sim";
import { bad, handleError, ok } from "@/lib/api";

const schema = z.object({
  candidates: z
    .array(
      z.object({
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
        label: z.string().max(80).optional(),
      })
    )
    .min(1)
    .max(3),
});

/** Sensor Placement Simulator: before/after coverage for 1-3 hypothetical monitors. */
export async function POST(req: NextRequest) {
  try {
    const body = schema.safeParse(await req.json());
    if (!body.success) return bad(body.error.issues[0].message);
    return ok(simulatePlacements(body.data.candidates));
  } catch (err) {
    return handleError(err);
  }
}
