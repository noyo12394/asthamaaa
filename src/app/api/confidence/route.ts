import { NextRequest, NextResponse } from "next/server";
import { classifySparsity } from "@/lib/sparsity";
import { monitorConfidenceScore, MONITOR_SOURCE } from "@/lib/monitors";
import { handleError, latLngSchema, ok, parseQuery } from "@/lib/api";

/**
 * PUBLIC API — monitor-sparsity class + coverage-confidence score for any
 * point. Stable contract so other researchers/tools can build on the
 * classification. Documented in the README and /methods.
 *
 *   GET /api/confidence?lat=&lng=
 */
export async function GET(req: NextRequest) {
  try {
    const query = parseQuery(req, latLngSchema);
    if (query instanceof NextResponse) return query;
    const sparsity = classifySparsity(query.lat, query.lng);
    const confidence = monitorConfidenceScore(query.lat, query.lng);
    const res = ok({
      lat: query.lat,
      lng: query.lng,
      sparsityClass: sparsity.class,
      dataBasis: sparsity.dataBasis,
      nearestMonitorKm: sparsity.nearestMonitorKm,
      monitorsWithin25Km: sparsity.monitorsWithin25Km,
      confidenceScore: confidence.score,
      plainLanguage: sparsity.plainLanguage,
      confidenceForecast: sparsity.confidenceForecast,
      methodology:
        "class by distance to nearest active monitor (<10 dense, <25 moderate, <50 sparse, else remote); confidence = 100·(0.7·max(0,1−d/50km) + 0.3·min(1,n25/4)). See /methods.",
      monitorMetadata: MONITOR_SOURCE,
    });
    res.headers.set("Access-Control-Allow-Origin", "*");
    return res;
  } catch (err) {
    return handleError(err);
  }
}
