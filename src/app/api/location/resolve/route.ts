import { NextRequest, NextResponse } from "next/server";
import { countyForPoint, COUNTY_SOURCE } from "@/lib/counties";
import { nearestMonitor } from "@/lib/monitors";
import { handleError, latLngSchema, ok, parseQuery } from "@/lib/api";

export async function GET(req: NextRequest) {
  try {
    const query = parseQuery(req, latLngSchema);
    if (query instanceof NextResponse) return query;
    const [countyHit, nearest] = await Promise.all([
      countyForPoint(query.lat, query.lng),
      Promise.resolve(nearestMonitor(query.lat, query.lng)),
    ]);
    return ok({
      lat: query.lat,
      lng: query.lng,
      county: countyHit
        ? {
            fips: countyHit.county.fips,
            name: countyHit.county.name,
            state: countyHit.county.state,
            centroidLat: countyHit.county.centroidLat,
            centroidLng: countyHit.county.centroidLng,
            resolutionMethod: countyHit.method,
            source: COUNTY_SOURCE,
          }
        : null,
      nearestMonitor: nearest,
    });
  } catch (err) {
    return handleError(err);
  }
}
