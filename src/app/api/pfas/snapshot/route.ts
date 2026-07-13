import { NextResponse } from "next/server";
import snapshot from "@/data/pfas-pilot.json";
import type { PfasPilotSnapshot } from "@/lib/pfas-types";

export const dynamic = "force-static";

export async function GET() {
  return NextResponse.json(
    { ok: true, data: snapshot as PfasPilotSnapshot },
    {
      headers: {
        "Cache-Control": "public, max-age=300, s-maxage=86400, stale-while-revalidate=604800",
      },
    }
  );
}
