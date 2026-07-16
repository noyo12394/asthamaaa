/**
 * Fetch ledger: every outbound data fetch (success or failure) is recorded
 * here and mirrored into source_logs. Powers the Data Freshness panel and
 * the "is this live or fallback?" answers from the agent.
 */
import type { SourceLogEntry } from "./types";

const ledger: SourceLogEntry[] = ((globalThis as Record<string, unknown>).__atlasLedger ??=
  []) as SourceLogEntry[];

const MAX_ENTRIES = 500;
let seq = 0;

export function recordFetch(entry: Omit<SourceLogEntry, "id">): SourceLogEntry {
  const full: SourceLogEntry = { id: `log-${Date.now()}-${seq++}`, ...entry };
  ledger.push(full);
  if (ledger.length > MAX_ENTRIES) ledger.splice(0, ledger.length - MAX_ENTRIES);
  return full;
}

export function recentFetches(limit = 50): SourceLogEntry[] {
  return ledger.slice(-limit).reverse();
}

/** Last successful fetch per source name, for the freshness panel. */
export function freshnessSummary(): {
  sourceName: string;
  lastSuccess: string | null;
  lastAttempt: string | null;
  lastOk: boolean;
  attempts: number;
}[] {
  const bySource = new Map<
    string,
    { lastSuccess: string | null; lastAttempt: string | null; lastOk: boolean; attempts: number }
  >();
  for (const e of ledger) {
    const cur = bySource.get(e.sourceName) ?? {
      lastSuccess: null,
      lastAttempt: null,
      lastOk: false,
      attempts: 0,
    };
    cur.attempts++;
    cur.lastAttempt = e.fetchedAt;
    cur.lastOk = e.ok;
    if (e.ok) cur.lastSuccess = e.fetchedAt;
    bySource.set(e.sourceName, cur);
  }
  return [...bySource.entries()].map(([sourceName, v]) => ({ sourceName, ...v }));
}

/**
 * Instrumented fetch with timeout. Never throws on network failure — returns
 * `null` and logs the attempt, so callers can fall back deliberately.
 */
export async function trackedFetchJson<T>(
  sourceName: string,
  url: string,
  opts?: { timeoutMs?: number; entityType?: string }
): Promise<T | null> {
  const started = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts?.timeoutMs ?? 8000);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    const ok = res.ok;
    let body: T | null = null;
    if (ok) body = (await res.json()) as T;
    recordFetch({
      entityType: opts?.entityType ?? "api-fetch",
      entityId: null,
      sourceName,
      sourceUrl: url,
      fetchedAt: new Date().toISOString(),
      ok,
      httpStatus: res.status,
      durationMs: Date.now() - started,
      vintage: null,
      confidence: null,
      notes: ok ? null : `HTTP ${res.status}`,
    });
    return ok ? body : null;
  } catch (err) {
    recordFetch({
      entityType: opts?.entityType ?? "api-fetch",
      entityId: null,
      sourceName,
      sourceUrl: url,
      fetchedAt: new Date().toISOString(),
      ok: false,
      httpStatus: null,
      durationMs: Date.now() - started,
      vintage: null,
      confidence: null,
      notes: err instanceof Error ? err.message : "fetch failed",
    });
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Instrumented text fetch for official pipe/CSV file products. */
export async function trackedFetchText(
  sourceName: string,
  url: string,
  opts?: { timeoutMs?: number; entityType?: string }
): Promise<string | null> {
  const started = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts?.timeoutMs ?? 8000);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    const ok = res.ok;
    const body = ok ? await res.text() : null;
    recordFetch({
      entityType: opts?.entityType ?? "api-fetch",
      entityId: null,
      sourceName,
      sourceUrl: url,
      fetchedAt: new Date().toISOString(),
      ok,
      httpStatus: res.status,
      durationMs: Date.now() - started,
      vintage: null,
      confidence: null,
      notes: ok ? null : `HTTP ${res.status}`,
    });
    return body;
  } catch (err) {
    recordFetch({
      entityType: opts?.entityType ?? "api-fetch",
      entityId: null,
      sourceName,
      sourceUrl: url,
      fetchedAt: new Date().toISOString(),
      ok: false,
      httpStatus: null,
      durationMs: Date.now() - started,
      vintage: null,
      confidence: null,
      notes: err instanceof Error ? err.message : "fetch failed",
    });
    return null;
  } finally {
    clearTimeout(timer);
  }
}
