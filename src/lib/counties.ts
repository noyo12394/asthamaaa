/** County lookups over the committed Census snapshot. */
import countiesFile from "@/data/counties.json";
import type { SourceRef } from "./types";
import { haversineKm, pointInGeometry } from "./geo";

export interface CountyMeta {
  fips: string;
  name: string;
  state: string;
  stateFips: string;
  lsad: string;
  centroidLat: number;
  centroidLng: number;
  areaSqMi: number;
}

interface CountyShape {
  type: "Feature";
  id: string;
  properties: { fips: string; name: string; state: string };
  geometry: { type: string; coordinates: unknown };
}

const meta = countiesFile.counties as CountyMeta[];
const byFips = new Map(meta.map((c) => [c.fips, c]));

// Shapes are ~2MB, so load lazily and only on the server paths that need
// point-in-polygon or geometry serving.
let shapesCache: CountyShape[] | null = null;
async function shapes(): Promise<CountyShape[]> {
  if (!shapesCache) {
    const mod = await import("@/data/county-shapes.json");
    shapesCache = (mod.default as { features: CountyShape[] }).features;
  }
  return shapesCache;
}

export const COUNTY_SOURCE: SourceRef = {
  name: "US Census Bureau cartographic boundaries (20m generalized)",
  url: countiesFile.sourceUrl,
  vintage: countiesFile.vintage,
  fetchedAt: countiesFile.fetchedAt,
  status: "official",
  confidence: "high",
  notes: "Generalized geometry for display and containment tests, not legal boundaries.",
};

export function countyByFips(fips: string): CountyMeta | undefined {
  return byFips.get(fips);
}

export function countyByName(name: string, state: string): CountyMeta | undefined {
  const n = name.trim().toLowerCase().replace(/ county$/i, "");
  const s = state.trim().toUpperCase();
  return meta.find((c) => c.state === s && c.name.toLowerCase() === n);
}

export function countiesOfState(state: string): CountyMeta[] {
  const s = state.trim().toUpperCase();
  return meta.filter((c) => c.state === s);
}

export function allCounties(): CountyMeta[] {
  return meta;
}

/**
 * Resolve a point to its containing county: candidate-filter by centroid
 * distance, then exact point-in-polygon, falling back to nearest centroid.
 */
export async function countyForPoint(
  lat: number,
  lng: number
): Promise<{ county: CountyMeta; method: "polygon" | "nearest-centroid" } | null> {
  const candidates = meta
    .map((c) => ({ c, d: haversineKm({ lat, lng }, { lat: c.centroidLat, lng: c.centroidLng }) }))
    .filter((x) => x.d < 250)
    .sort((a, b) => a.d - b.d)
    .slice(0, 30);
  if (candidates.length === 0) return null;

  const shapeList = await shapes();
  const shapeByFips = new Map(shapeList.map((s) => [s.id, s]));
  for (const { c } of candidates) {
    const shape = shapeByFips.get(c.fips);
    if (shape && pointInGeometry(lng, lat, shape.geometry)) {
      return { county: c, method: "polygon" };
    }
  }
  return { county: candidates[0].c, method: "nearest-centroid" };
}

/** GeoJSON features for counties intersecting a bbox (by centroid padding). */
export async function countyShapesInBbox(bbox: {
  west: number;
  south: number;
  east: number;
  north: number;
}): Promise<CountyShape[]> {
  const pad = 1.5; // degrees — big enough to include counties whose centroid is outside
  const hits = meta.filter(
    (c) =>
      c.centroidLng > bbox.west - pad &&
      c.centroidLng < bbox.east + pad &&
      c.centroidLat > bbox.south - pad &&
      c.centroidLat < bbox.north + pad
  );
  const shapeList = await shapes();
  const shapeByFips = new Map(shapeList.map((s) => [s.id, s]));
  return hits
    .map((c) => shapeByFips.get(c.fips))
    .filter((s): s is CountyShape => s != null);
}
