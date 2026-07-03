/**
 * Geocoding: Open-Meteo Geocoding API (no key) by default, optional providers
 * later via GEOCODER_PROVIDER. Falls back to a local gazetteer (major US
 * cities + all county names from the Census snapshot) so search still works
 * when outbound network is unavailable — results are labeled accordingly.
 */
import { cached, TTL } from "./cache";
import { trackedFetchJson } from "./freshness";
import { allCounties } from "./counties";
import type { SourceRef } from "./types";

export interface GeocodeResult {
  name: string;
  displayName: string;
  lat: number;
  lng: number;
  admin1: string | null; // state
  countryCode: string | null;
  source: SourceRef;
}

const OM_GEO = "https://geocoding-api.open-meteo.com/v1/search";

// Small gazetteer of major US cities (approximate centroids) so offline
// search remains usable. Coordinates are city centers to ~1km.
const CITY_GAZETTEER: [string, string, number, number][] = [
  ["Allentown", "PA", 40.6023, -75.4714],
  ["Bethlehem", "PA", 40.6259, -75.3705],
  ["Easton", "PA", 40.6884, -75.2207],
  ["Reading", "PA", 40.3356, -75.9269],
  ["Philadelphia", "PA", 39.9526, -75.1652],
  ["Pittsburgh", "PA", 40.4406, -79.9959],
  ["Harrisburg", "PA", 40.2732, -76.8867],
  ["Scranton", "PA", 41.4089, -75.6624],
  ["Camden", "NJ", 39.9259, -75.1196],
  ["Newark", "NJ", 40.7357, -74.1724],
  ["Trenton", "NJ", 40.2206, -74.7597],
  ["Jersey City", "NJ", 40.7178, -74.0431],
  ["New York", "NY", 40.7128, -74.006],
  ["Buffalo", "NY", 42.8864, -78.8784],
  ["Albany", "NY", 42.6526, -73.7562],
  ["Baltimore", "MD", 39.2904, -76.6122],
  ["Washington", "DC", 38.9072, -77.0369],
  ["Wilmington", "DE", 39.7391, -75.5398],
  ["Boston", "MA", 42.3601, -71.0589],
  ["Hartford", "CT", 41.7658, -72.6734],
  ["Chicago", "IL", 41.8781, -87.6298],
  ["Detroit", "MI", 42.3314, -83.0458],
  ["Cleveland", "OH", 41.4993, -81.6944],
  ["Columbus", "OH", 39.9612, -82.9988],
  ["Atlanta", "GA", 33.749, -84.388],
  ["Miami", "FL", 25.7617, -80.1918],
  ["Houston", "TX", 29.7604, -95.3698],
  ["Dallas", "TX", 32.7767, -96.797],
  ["Austin", "TX", 30.2672, -97.7431],
  ["Phoenix", "AZ", 33.4484, -112.074],
  ["Denver", "CO", 39.7392, -104.9903],
  ["Salt Lake City", "UT", 40.7608, -111.891],
  ["Seattle", "WA", 47.6062, -122.3321],
  ["Portland", "OR", 45.5152, -122.6784],
  ["San Francisco", "CA", 37.7749, -122.4194],
  ["Oakland", "CA", 37.8044, -122.2712],
  ["Fresno", "CA", 36.7378, -119.7871],
  ["Los Angeles", "CA", 34.0522, -118.2437],
  ["San Diego", "CA", 32.7157, -117.1611],
  ["Las Vegas", "NV", 36.1699, -115.1398],
  ["Minneapolis", "MN", 44.9778, -93.265],
  ["St. Louis", "MO", 38.627, -90.1994],
  ["Kansas City", "MO", 39.0997, -94.5786],
  ["New Orleans", "LA", 29.9511, -90.0715],
  ["Charlotte", "NC", 35.2271, -80.8431],
  ["Nashville", "TN", 36.1627, -86.7816],
  ["Memphis", "TN", 35.1495, -90.049],
  ["Indianapolis", "IN", 39.7684, -86.1581],
  ["Milwaukee", "WI", 43.0389, -87.9065],
];

const GAZETTEER_SOURCE: SourceRef = {
  name: "PASS local gazetteer (fallback)",
  url: null,
  vintage: "static",
  fetchedAt: null,
  status: "fallback",
  confidence: "medium",
  notes:
    "Geocoding API unreachable — matched against a built-in list of major US cities and Census county names. Approximate centroid coordinates.",
};

function gazetteerSearch(q: string, count: number): GeocodeResult[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return [];
  const results: GeocodeResult[] = [];
  for (const [city, state, lat, lng] of CITY_GAZETTEER) {
    const hay = `${city}, ${state}`.toLowerCase();
    if (hay.includes(needle) || city.toLowerCase().startsWith(needle)) {
      results.push({
        name: city,
        displayName: `${city}, ${state}`,
        lat,
        lng,
        admin1: state,
        countryCode: "US",
        source: GAZETTEER_SOURCE,
      });
    }
  }
  for (const c of allCounties()) {
    if (results.length >= count * 2) break;
    if (c.name.toLowerCase().startsWith(needle)) {
      results.push({
        name: `${c.name} ${c.lsad}`,
        displayName: `${c.name} ${c.lsad}, ${c.state}`,
        lat: c.centroidLat,
        lng: c.centroidLng,
        admin1: c.state,
        countryCode: "US",
        source: GAZETTEER_SOURCE,
      });
    }
  }
  return results.slice(0, count);
}

interface OmGeoResponse {
  results?: {
    name: string;
    latitude: number;
    longitude: number;
    country_code?: string;
    admin1?: string;
    admin2?: string;
  }[];
}

export async function geocode(q: string, count = 5): Promise<GeocodeResult[]> {
  const key = `geocode:${q.trim().toLowerCase()}:${count}`;
  const hit = await cached(key, TTL.geocode, async () => {
    const url = `${OM_GEO}?name=${encodeURIComponent(q)}&count=${count}&language=en&format=json`;
    const data = await trackedFetchJson<OmGeoResponse>("Open-Meteo Geocoding API", url, {
      entityType: "geocode",
    });
    if (data?.results?.length) {
      const fetchedAt = new Date().toISOString();
      return data.results.map(
        (r): GeocodeResult => ({
          name: r.name,
          displayName: [r.name, r.admin1, r.country_code].filter(Boolean).join(", "),
          lat: r.latitude,
          lng: r.longitude,
          admin1: r.admin1 ?? null,
          countryCode: r.country_code ?? null,
          source: {
            name: "Open-Meteo Geocoding API (GeoNames)",
            url: "https://open-meteo.com/en/docs/geocoding-api",
            vintage: "GeoNames database",
            fetchedAt,
            status: "live",
            confidence: "high",
            notes: null,
          },
        })
      );
    }
    return gazetteerSearch(q, count);
  });
  return hit.value;
}
