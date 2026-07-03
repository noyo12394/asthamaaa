import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentAirQuality } from "@/lib/openmeteo";
import { nearestMonitor, MONITOR_SOURCE } from "@/lib/monitors";
import { countyForPoint, COUNTY_SOURCE } from "@/lib/counties";
import { HEALTH_SOURCE, VULNERABILITY_SOURCE } from "@/lib/health";
import { recentFetches } from "@/lib/freshness";
import { listSavedLocations } from "@/lib/store";
import { bad, getUserId, handleError, ok, parseQuery } from "@/lib/api";

const schema = z
  .object({
    lat: z.coerce.number().min(-90).max(90).optional(),
    lng: z.coerce.number().min(-180).max(180).optional(),
    locationId: z.string().optional(),
  })
  .refine((v) => v.locationId || (v.lat != null && v.lng != null), {
    message: "provide lat+lng or locationId",
  });

/**
 * The audit view: every source contributing to a location's answer, with
 * status/vintage/confidence, plus the recent backend fetch ledger.
 */
export async function GET(req: NextRequest) {
  try {
    const query = parseQuery(req, schema);
    if (query instanceof NextResponse) return query;

    let lat = query.lat;
    let lng = query.lng;
    let locationLabel: string | null = null;
    if (query.locationId) {
      const { userId } = getUserId(req);
      const saved = (await listSavedLocations(userId)).find((l) => l.id === query.locationId);
      if (!saved) return bad("Saved location not found", 404);
      lat = saved.lat;
      lng = saved.lng;
      locationLabel = saved.label;
    }

    const [{ snapshot }, countyHit] = await Promise.all([
      getCurrentAirQuality(lat!, lng!),
      countyForPoint(lat!, lng!),
    ]);
    const nearest = nearestMonitor(lat!, lng!);

    const trail = [
      {
        field: "Current air quality (PM2.5, ozone, NO2, AQI)",
        value: snapshot.usAqi.value != null ? `US AQI ${snapshot.usAqi.value}` : "unavailable",
        source: snapshot.usAqi.source,
      },
      {
        field: "Monitor metadata & distances",
        value: nearest
          ? `${nearest.monitor.name} @ ${nearest.distanceKm} km`
          : "no monitors",
        source: MONITOR_SOURCE,
      },
      {
        field: "County boundary & identification",
        value: countyHit ? `${countyHit.county.name}, ${countyHit.county.state} (${countyHit.method})` : "not in a US county",
        source: COUNTY_SOURCE,
      },
      { field: "County health indicators", value: countyHit?.county.fips ?? "n/a", source: HEALTH_SOURCE },
      { field: "County vulnerability indicators", value: countyHit?.county.fips ?? "n/a", source: VULNERABILITY_SOURCE },
    ];

    return ok({
      lat,
      lng,
      locationLabel,
      trail,
      recentFetches: recentFetches(25),
      note: "Confidence and status labels are set per source; 'fallback' entries are synthetic placeholders, never real observations.",
    });
  } catch (err) {
    return handleError(err);
  }
}
