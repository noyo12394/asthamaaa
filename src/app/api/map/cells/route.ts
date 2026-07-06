import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { cached, TTL } from "@/lib/cache";
import { hexGrid, parseBbox, circlePolygon } from "@/lib/geo";
import { getCurrentBatch } from "@/lib/openmeteo";
import { monitorsInBbox, monitorConfidenceScore, MONITOR_SOURCE } from "@/lib/monitors";
import { countyShapesInBbox, countyByFips } from "@/lib/counties";
import {
  healthBurdenScore,
  vulnerabilityScore,
  HEALTH_SOURCE,
  VULNERABILITY_SOURCE,
} from "@/lib/health";
import { listCommunityReports } from "@/lib/store";
import { exposureFromAqi, levelForScore, WEIGHTS } from "@/lib/scoring";
import { susceptibilityFromProfile } from "@/lib/scoring";
import { bad, handleError, ok, parseQuery } from "@/lib/api";

const schema = z.object({
  bbox: z.string(), // west,south,east,north
  layer: z.enum([
    "aqi",
    "monitors",
    "coverage",
    "vulnerability",
    "equity",
    "alert",
    "reports",
    "uncertainty",
  ]),
  cellKm: z.coerce.number().min(1).max(50).optional(),
});

const MAX_CELLS = 60; // keeps the Open-Meteo batch request reasonable

function autoCellKm(widthDeg: number): number {
  const widthKm = widthDeg * 85; // rough mid-latitude conversion
  return Math.max(2, Math.min(40, Math.round(widthKm / 9)));
}

export async function GET(req: NextRequest) {
  try {
    const query = parseQuery(req, schema);
    if (query instanceof NextResponse) return query;
    const bbox = parseBbox(query.bbox);
    if (!bbox) return bad("bbox must be west,south,east,north");

    switch (query.layer) {
      case "aqi": {
        const cellKm = query.cellKm ?? autoCellKm(bbox.east - bbox.west);
        const key = `cells:aqi:${query.bbox}:${cellKm}`;
        const hit = await cached(key, TTL.mapCells, async () => {
          let cells = hexGrid(bbox, cellKm);
          if (cells.length > MAX_CELLS) {
            // grow the cell size until the grid fits the batch budget
            const scale = Math.sqrt(cells.length / MAX_CELLS);
            cells = hexGrid(bbox, Math.min(50, cellKm * scale * 1.05));
          }
          const { values, source } = await getCurrentBatch(cells.map((c) => c.center));
          return {
            type: "FeatureCollection" as const,
            features: cells.map((c, i) => ({
              type: "Feature" as const,
              id: c.id,
              properties: {
                aqi: values[i]?.usAqi ?? null,
                pm25: values[i]?.pm25 ?? null,
                centerLat: c.center.lat,
                centerLng: c.center.lng,
              },
              geometry: { type: "Polygon" as const, coordinates: [c.polygon] },
            })),
            meta: { layer: "aqi", cellKm, source, cellCount: cells.length },
          };
        });
        return ok(hit.value);
      }

      case "monitors": {
        const monitors = monitorsInBbox(bbox).slice(0, 400);
        return ok({
          type: "FeatureCollection",
          features: monitors.map((m) => ({
            type: "Feature",
            id: m.id,
            properties: {
              id: m.id,
              name: m.name,
              code: m.monitorCode,
              pollutants: m.pollutants.join(", "),
              state: m.state,
              county: m.county,
              status: m.status,
              sourceName: m.source,
            },
            geometry: { type: "Point", coordinates: [m.lng, m.lat] },
          })),
          meta: { layer: "monitors", source: MONITOR_SOURCE, count: monitors.length },
        });
      }

      case "coverage": {
        // Translucent rings at 10km (good) and 25km (partial) per monitor.
        const monitors = monitorsInBbox(bbox).slice(0, 150);
        const features = monitors.flatMap((m) => [
          {
            type: "Feature" as const,
            properties: { band: "good", monitorId: m.id },
            geometry: {
              type: "Polygon" as const,
              coordinates: [circlePolygon({ lat: m.lat, lng: m.lng }, 10)],
            },
          },
          {
            type: "Feature" as const,
            properties: { band: "partial", monitorId: m.id },
            geometry: {
              type: "Polygon" as const,
              coordinates: [circlePolygon({ lat: m.lat, lng: m.lng }, 25)],
            },
          },
        ]);
        return ok({
          type: "FeatureCollection",
          features,
          meta: {
            layer: "coverage",
            source: MONITOR_SOURCE,
            note: "10 km ≈ good coverage, 25 km ≈ partial. Heuristic bands, see SCORING.md.",
          },
        });
      }

      case "vulnerability": {
        const shapes = await countyShapesInBbox(bbox);
        return ok({
          type: "FeatureCollection",
          features: shapes.slice(0, 400).map((s) => {
            const burden = healthBurdenScore(s.id);
            const vuln = vulnerabilityScore(s.id);
            return {
              ...s,
              properties: {
                ...s.properties,
                healthBurden: burden.score,
                dominantBurden: burden.dominant,
                vulnerability: vuln.score,
              },
            };
          }),
          meta: { layer: "vulnerability", sources: [HEALTH_SOURCE, VULNERABILITY_SOURCE] },
        });
      }

      case "equity": {
        const shapes = await countyShapesInBbox(bbox);
        return ok({
          type: "FeatureCollection",
          features: shapes.slice(0, 400).map((s) => {
            const vuln = vulnerabilityScore(s.id).score ?? 40;
            const county = countyByFips(s.id);
            const mc = county
              ? monitorConfidenceScore(county.centroidLat, county.centroidLng).score
              : 50;
            const equity = Math.round(0.6 * vuln + 0.4 * (100 - mc));
            return {
              ...s,
              properties: {
                ...s.properties,
                equity,
                vulnerability: vuln,
                monitorConfidence: mc,
              },
            };
          }),
          meta: {
            layer: "equity",
            sources: [VULNERABILITY_SOURCE, MONITOR_SOURCE],
            note: "equity = 0.6×vulnerability + 0.4×(100−monitor confidence at county centroid)",
          },
        });
      }

      case "alert": {
        // Alert priority = the profile-free risk formula per hex cell.
        const cellKm = query.cellKm ?? Math.max(6, autoCellKm(bbox.east - bbox.west));
        const key = `cells:alert:${query.bbox}:${cellKm}`;
        const hit = await cached(key, TTL.mapCells, async () => {
          let cells = hexGrid(bbox, cellKm);
          if (cells.length > MAX_CELLS) {
            const scale = Math.sqrt(cells.length / MAX_CELLS);
            cells = hexGrid(bbox, Math.min(50, cellKm * scale * 1.05));
          }
          const { values, source } = await getCurrentBatch(cells.map((c) => c.center));
          const baseSusceptibility = susceptibilityFromProfile({ conditions: [] }).score;
          const features = await Promise.all(
            cells.map(async (c, i) => {
              const aqi = values[i]?.usAqi ?? null;
              const exposure = aqi != null ? exposureFromAqi(aqi) : 35;
              // county terms via nearest-centroid (cheap approximation for cells)
              const { countyForPoint } = await import("@/lib/counties");
              const hitC = await countyForPoint(c.center.lat, c.center.lng);
              const fips = hitC?.county.fips;
              const burden = fips ? healthBurdenScore(fips).score ?? 40 : 40;
              const vuln = fips ? vulnerabilityScore(fips).score ?? 40 : 40;
              const mc = monitorConfidenceScore(c.center.lat, c.center.lng).score;
              const equity = Math.round(0.6 * vuln + 0.4 * (100 - mc));
              const final = Math.round(
                exposure * WEIGHTS.exposure +
                  burden * WEIGHTS.healthVulnerability +
                  equity * WEIGHTS.equity +
                  baseSusceptibility * WEIGHTS.susceptibility
              );
              return {
                type: "Feature" as const,
                id: c.id,
                properties: {
                  score: final,
                  level: levelForScore(final),
                  aqi,
                  equity,
                  healthBurden: burden,
                },
                geometry: { type: "Polygon" as const, coordinates: [c.polygon] },
              };
            })
          );
          return {
            type: "FeatureCollection" as const,
            features,
            meta: {
              layer: "alert",
              cellKm,
              source,
              note: "General-population alert priority (no personal profile). Same formula as /api/risk-score.",
            },
          };
        });
        return ok(hit.value);
      }

      case "uncertainty": {
        // "Why we're unsure": monitor-sparsity class per cell, its own layer
        // with its own legend — uncertainty as a first-class citizen. Pure
        // distance math, so the grid can be denser than the AQI batch layer.
        const { classifySparsity } = await import("@/lib/sparsity");
        const cellKm = query.cellKm ?? Math.max(3, autoCellKm(bbox.east - bbox.west) * 0.8);
        let cells = hexGrid(bbox, cellKm);
        if (cells.length > 140) {
          const scale = Math.sqrt(cells.length / 140);
          cells = hexGrid(bbox, Math.min(50, cellKm * scale * 1.05));
        }
        return ok({
          type: "FeatureCollection",
          features: cells.map((c) => {
            const s = classifySparsity(c.center.lat, c.center.lng);
            return {
              type: "Feature" as const,
              id: c.id,
              properties: {
                class: s.class,
                nearestKm: s.nearestMonitorKm,
                dataBasis: s.dataBasis,
              },
              geometry: { type: "Polygon" as const, coordinates: [c.polygon] },
            };
          }),
          meta: {
            layer: "uncertainty",
            cellKm,
            source: MONITOR_SOURCE,
            note: "Class by distance to nearest active monitor: dense <10 km, moderate <25, sparse <50, remote ≥50. Sparse/remote areas rely on model/satellite estimates, not ground truth. County health data everywhere is population burden, not individual diagnosis.",
          },
        });
      }

      case "reports": {
        const reports = await listCommunityReports();
        const inBox = reports.filter(
          (r) => r.lng >= bbox.west && r.lng <= bbox.east && r.lat >= bbox.south && r.lat <= bbox.north
        );
        return ok({
          type: "FeatureCollection",
          features: inBox.map((r) => ({
            type: "Feature",
            id: r.id,
            properties: {
              id: r.id,
              reportType: r.reportType,
              intensity: r.intensity,
              note: r.note,
              verifiedStatus: r.verifiedStatus,
              createdAt: r.createdAt,
            },
            geometry: { type: "Point", coordinates: [r.lng, r.lat] },
          })),
          meta: {
            layer: "reports",
            note: "Unverified human reports. Not official measurements.",
          },
        });
      }
    }
  } catch (err) {
    return handleError(err);
  }
}
