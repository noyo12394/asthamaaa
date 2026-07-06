/** Geospatial helpers: distance, point-in-polygon, bbox, hex grids. */

export interface LngLat {
  lng: number;
  lat: number;
}

const R_EARTH_KM = 6371;

export function haversineKm(a: LngLat, b: LngLat): number {
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R_EARTH_KM * Math.asin(Math.sqrt(h));
}

/** Ray casting; ring is [[lng,lat],...]. */
function inRing(pt: [number, number], ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

export function pointInGeometry(
  lng: number,
  lat: number,
  geometry: { type: string; coordinates: unknown }
): boolean {
  const pt: [number, number] = [lng, lat];
  if (geometry.type === "Polygon") {
    const rings = geometry.coordinates as number[][][];
    if (!inRing(pt, rings[0])) return false;
    for (let i = 1; i < rings.length; i++) if (inRing(pt, rings[i])) return false;
    return true;
  }
  if (geometry.type === "MultiPolygon") {
    const polys = geometry.coordinates as number[][][][];
    return polys.some((rings) => {
      if (!inRing(pt, rings[0])) return false;
      for (let i = 1; i < rings.length; i++) if (inRing(pt, rings[i])) return false;
      return true;
    });
  }
  return false;
}

export interface Bbox {
  west: number;
  south: number;
  east: number;
  north: number;
}

export function parseBbox(s: string): Bbox | null {
  const parts = s.split(",").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return null;
  const [west, south, east, north] = parts;
  if (west >= east || south >= north) return null;
  return { west, south, east, north };
}

/** Approximate geodesic circle polygon (for monitor coverage rings). */
export function circlePolygon(center: LngLat, radiusKm: number, steps = 48): number[][] {
  const coords: number[][] = [];
  const latRad = (center.lat * Math.PI) / 180;
  for (let i = 0; i <= steps; i++) {
    const theta = (i / steps) * 2 * Math.PI;
    const dLat = (radiusKm / R_EARTH_KM) * Math.sin(theta);
    const dLng = (radiusKm / (R_EARTH_KM * Math.cos(latRad))) * Math.cos(theta);
    coords.push([
      +(center.lng + (dLng * 180) / Math.PI).toFixed(4),
      +(center.lat + (dLat * 180) / Math.PI).toFixed(4),
    ]);
  }
  return coords;
}

export interface HexCell {
  id: string;
  center: LngLat;
  polygon: number[][]; // closed ring [lng,lat]
}

/**
 * Flat-top hexagonal grid covering a bbox. `cellKm` is the hex circumradius.
 * Grid keys are derived from axial indices at a fixed origin so cell ids are
 * stable across requests (which makes them cacheable).
 */
export function hexGrid(bbox: Bbox, cellKm: number): HexCell[] {
  const cells: HexCell[] = [];
  const midLat = (bbox.south + bbox.north) / 2;
  const kmPerDegLat = 110.574;
  const kmPerDegLng = 111.32 * Math.cos((midLat * Math.PI) / 180);
  const rLat = cellKm / kmPerDegLat; // circumradius in degrees lat
  const rLng = cellKm / kmPerDegLng;

  const stepX = 1.5 * rLng;
  const stepY = Math.sqrt(3) * rLat;

  const iMin = Math.floor(bbox.west / stepX) - 1;
  const iMax = Math.ceil(bbox.east / stepX) + 1;
  const jMin = Math.floor(bbox.south / stepY) - 1;
  const jMax = Math.ceil(bbox.north / stepY) + 1;

  for (let i = iMin; i <= iMax; i++) {
    for (let j = jMin; j <= jMax; j++) {
      const cx = i * stepX;
      const cy = j * stepY + (i % 2 !== 0 ? stepY / 2 : 0);
      if (cx < bbox.west - stepX || cx > bbox.east + stepX) continue;
      if (cy < bbox.south - stepY || cy > bbox.north + stepY) continue;
      const ring: number[][] = [];
      for (let k = 0; k <= 6; k++) {
        const ang = (Math.PI / 3) * k;
        ring.push([
          +(cx + rLng * Math.cos(ang)).toFixed(4),
          +(cy + rLat * Math.sin(ang)).toFixed(4),
        ]);
      }
      cells.push({ id: `${i}:${j}:${cellKm}`, center: { lng: cx, lat: cy }, polygon: ring });
    }
  }
  return cells;
}

export function clampNumber(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}
