/**
 * In-process TTL cache. On Vercel this is per-lambda-instance; it is the
 * first cache tier, with the database observation tables acting as the
 * durable tier. Kept on `globalThis` so dev-server HMR doesn't wipe it.
 */

interface Entry {
  value: unknown;
  expiresAt: number;
  storedAt: number;
}

const store: Map<string, Entry> = ((globalThis as Record<string, unknown>).__atlasCache ??=
  new Map()) as Map<string, Entry>;

export interface CacheHit<T> {
  value: T;
  cached: boolean;
  storedAt: string;
  ageMs: number;
}

export async function cached<T>(
  key: string,
  ttlMs: number,
  fn: () => Promise<T>
): Promise<CacheHit<T>> {
  const now = Date.now();
  const hit = store.get(key);
  if (hit && hit.expiresAt > now) {
    return {
      value: hit.value as T,
      cached: true,
      storedAt: new Date(hit.storedAt).toISOString(),
      ageMs: now - hit.storedAt,
    };
  }
  const value = await fn();
  store.set(key, { value, expiresAt: now + ttlMs, storedAt: now });
  return { value, cached: false, storedAt: new Date(now).toISOString(), ageMs: 0 };
}

/** Read-only peek without triggering a fetch. */
export function peek<T>(key: string): T | undefined {
  const hit = store.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.value as T;
  return undefined;
}

export function invalidate(prefix: string): number {
  let n = 0;
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) {
      store.delete(key);
      n++;
    }
  }
  return n;
}

export const TTL = {
  geocode: 24 * 60 * 60 * 1000, // 24h — places don't move
  airQualityCurrent: 10 * 60 * 1000, // 10 min
  airNowReportingAreas: 15 * 60 * 1000, // file product refreshes twice hourly
  airQualityHistory: 30 * 60 * 1000, // 30 min
  waterQualityCurrent: 60 * 60 * 1000, // 1h — official water sources change slowly
  waterLive: 10 * 60 * 1000, // 10 min — USGS provisional continuous observations
  mapCells: 10 * 60 * 1000, // 10 min
  terrainSmoke: 30 * 60 * 1000, // 30 min — multi-source terrain/smoke model run
} as const;
