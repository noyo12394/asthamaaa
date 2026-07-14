import snapshot from "@/data/pfas-pilot.json";
import type { PfasPilotSnapshot, WqpPfasSample } from "@/lib/pfas-types";
import { distanceKm } from "@/lib/distance";

const data = snapshot as PfasPilotSnapshot;

function csvCell(value: unknown) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function matchesCompound(sample: WqpPfasSample, filter: string) {
  if (filter === "all") return true;
  if (filter === "core") return sample.compound === "PFOA" || sample.compound === "PFOS";
  return sample.compound === filter;
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const state = params.get("state") ?? "all";
  const compound = params.get("compound") ?? "core";
  const detection = params.get("detection") ?? "all";
  const year = params.get("year") ?? "all";
  const query = (params.get("q") ?? "").trim().toLowerCase();
  const centerLat = Number(params.get("centerLat"));
  const centerLng = Number(params.get("centerLng"));
  const radiusKm = Number(params.get("radiusKm"));
  const hasRadius =
    Number.isFinite(centerLat) &&
    Number.isFinite(centerLng) &&
    Number.isFinite(radiusKm) &&
    radiusKm > 0 &&
    radiusKm <= 10;

  const samples = data.wqpSamples.filter((sample) => {
    if (state !== "all" && sample.state !== state) return false;
    if (!matchesCompound(sample, compound)) return false;
    if (detection === "detected" && !sample.detected) return false;
    if (detection === "non-detect" && sample.detected) return false;
    if (year !== "all" && sample.year !== Number(year)) return false;
    if (hasRadius && distanceKm(centerLat, centerLng, sample.lat, sample.lng) > radiusKm) return false;
    return !query || `${sample.locationName} ${sample.provider} ${sample.monitoringLocationId}`.toLowerCase().includes(query);
  });

  const headers = [
    "source", "state", "location", "sample_date", "compound", "detection_status",
    "result_ng_L", "reporting_limit_ng_L", "medium", "provider", "latitude", "longitude",
    "coordinate_precision", "source_url",
  ];
  const rows = samples.map((sample) => [
    sample.source, sample.state, sample.locationName, sample.date, sample.compound,
    sample.detected ? "detected" : "non-detect", sample.valueNgL, sample.limitNgL,
    sample.medium, sample.provider, sample.lat, sample.lng, sample.coordinatePrecision, sample.sourceUrl,
  ]);
  const csv = [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
  const filename = `pass-pfas-water-${state}-${new Date().toISOString().slice(0, 10)}.csv`;

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, max-age=60",
    },
  });
}
