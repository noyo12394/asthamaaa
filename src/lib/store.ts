/**
 * Persistence for user-generated records (saved locations, watch rules,
 * community reports, agent sessions, risk-score history).
 *
 * Two backends behind one interface:
 *  - Postgres (Drizzle) when DATABASE_URL is configured — durable.
 *  - In-memory when not — functional but ephemeral per server instance;
 *    API responses flag this via `persistence: "memory"` so the UI can
 *    say so instead of pretending writes are durable.
 */
import { desc, eq } from "drizzle-orm";
import { getDb, hasDb } from "@/db/client";
import * as t from "@/db/schema";
import type { CommunityReport, RiskScoreResult, SavedLocation, WatchRule } from "./types";

export type PersistenceMode = "postgres" | "memory";

export function persistenceMode(): PersistenceMode {
  return hasDb() ? "postgres" : "memory";
}

function id(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

interface MemoryState {
  savedLocations: SavedLocation[];
  watchRules: WatchRule[];
  communityReports: CommunityReport[];
  agentSessions: { id: string; userId: string | null; messagesJson: unknown; createdAt: string }[];
}

const mem: MemoryState = ((globalThis as Record<string, unknown>).__atlasMem ??= {
  savedLocations: [],
  watchRules: [],
  communityReports: [
    // One illustrative unverified report so the layer renders on first load.
    {
      id: "report_seed_1",
      userId: null,
      lat: 40.615,
      lng: -75.474,
      reportType: "odor",
      intensity: 2,
      note: "Seed example: resident-reported industrial odor near east Allentown. Unverified.",
      verifiedStatus: "unverified",
      createdAt: new Date().toISOString(),
    },
  ],
  agentSessions: [],
}) as MemoryState;

// ---------------------------------------------------------------------------
// Saved locations
// ---------------------------------------------------------------------------
export async function listSavedLocations(userId: string): Promise<SavedLocation[]> {
  const db = getDb();
  if (db) {
    const rows = await db
      .select()
      .from(t.savedLocations)
      .where(eq(t.savedLocations.userId, userId))
      .orderBy(desc(t.savedLocations.createdAt));
    return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
  }
  return mem.savedLocations.filter((l) => l.userId === userId);
}

export async function addSavedLocation(
  input: Omit<SavedLocation, "id" | "createdAt">
): Promise<SavedLocation> {
  const rec: SavedLocation = { ...input, id: id("loc"), createdAt: new Date().toISOString() };
  const db = getDb();
  if (db) {
    await db.insert(t.savedLocations).values({ ...rec, createdAt: new Date(rec.createdAt) });
  } else {
    mem.savedLocations.unshift(rec);
  }
  return rec;
}

export async function deleteSavedLocation(userId: string, locId: string): Promise<boolean> {
  const db = getDb();
  if (db) {
    const res = await db
      .delete(t.savedLocations)
      .where(eq(t.savedLocations.id, locId))
      .returning({ id: t.savedLocations.id });
    return res.length > 0;
  }
  const before = mem.savedLocations.length;
  mem.savedLocations = mem.savedLocations.filter((l) => !(l.id === locId && l.userId === userId));
  return mem.savedLocations.length < before;
}

// ---------------------------------------------------------------------------
// Watch rules
// ---------------------------------------------------------------------------
export async function listWatchRules(userId?: string): Promise<WatchRule[]> {
  const db = getDb();
  if (db) {
    const rows = userId
      ? await db.select().from(t.watchRules).where(eq(t.watchRules.userId, userId))
      : await db.select().from(t.watchRules);
    return rows.map((r) => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
      lastTriggeredAt: r.lastTriggeredAt?.toISOString() ?? null,
    }));
  }
  return userId ? mem.watchRules.filter((w) => w.userId === userId) : [...mem.watchRules];
}

export async function addWatchRule(
  input: Omit<WatchRule, "id" | "createdAt" | "lastTriggeredAt" | "lastCheckedAqi">
): Promise<WatchRule> {
  const rec: WatchRule = {
    ...input,
    id: id("rule"),
    lastTriggeredAt: null,
    lastCheckedAqi: null,
    createdAt: new Date().toISOString(),
  };
  const db = getDb();
  if (db) {
    await db.insert(t.watchRules).values({
      ...rec,
      createdAt: new Date(rec.createdAt),
      lastTriggeredAt: null,
    });
  } else {
    mem.watchRules.unshift(rec);
  }
  return rec;
}

export async function updateWatchRuleCheck(
  ruleId: string,
  aqi: number | null,
  triggered: boolean
): Promise<void> {
  const now = new Date();
  const db = getDb();
  if (db) {
    await db
      .update(t.watchRules)
      .set({ lastCheckedAqi: aqi, ...(triggered ? { lastTriggeredAt: now } : {}) })
      .where(eq(t.watchRules.id, ruleId));
    return;
  }
  const rule = mem.watchRules.find((w) => w.id === ruleId);
  if (rule) {
    rule.lastCheckedAqi = aqi;
    if (triggered) rule.lastTriggeredAt = now.toISOString();
  }
}

// ---------------------------------------------------------------------------
// Community reports
// ---------------------------------------------------------------------------
export async function listCommunityReports(limit = 200): Promise<CommunityReport[]> {
  const db = getDb();
  if (db) {
    const rows = await db
      .select()
      .from(t.communityReports)
      .orderBy(desc(t.communityReports.createdAt))
      .limit(limit);
    return rows.map((r) => ({
      ...r,
      reportType: r.reportType as CommunityReport["reportType"],
      intensity: r.intensity as CommunityReport["intensity"],
      verifiedStatus: r.verifiedStatus as CommunityReport["verifiedStatus"],
      createdAt: r.createdAt.toISOString(),
    }));
  }
  return mem.communityReports.slice(0, limit);
}

export async function addCommunityReport(
  input: Omit<CommunityReport, "id" | "createdAt" | "verifiedStatus">
): Promise<CommunityReport> {
  const rec: CommunityReport = {
    ...input,
    id: id("report"),
    verifiedStatus: "unverified",
    createdAt: new Date().toISOString(),
  };
  const db = getDb();
  if (db) {
    await db.insert(t.communityReports).values({ ...rec, createdAt: new Date(rec.createdAt) });
  } else {
    mem.communityReports.unshift(rec);
  }
  return rec;
}

// ---------------------------------------------------------------------------
// Risk-score history + agent sessions (write-through, best effort)
// ---------------------------------------------------------------------------
export async function recordRiskScore(result: RiskScoreResult): Promise<void> {
  const db = getDb();
  if (!db) return; // history is a durability feature; skip silently in memory mode
  await db.insert(t.riskScores).values({
    id: id("risk"),
    locationId: null,
    lat: result.lat,
    lng: result.lng,
    countyId: result.countyFips,
    exposureScore: result.exposure.score,
    monitorConfidenceScore: result.monitorConfidence.score,
    healthVulnerabilityScore: result.healthVulnerability.score,
    equityScore: result.equity.score,
    susceptibilityScore: result.susceptibility.score,
    finalScore: result.finalScore,
    level: result.level,
    explanationJson: { explanation: result.explanation, caveats: result.caveats },
    calculatedAt: new Date(result.calculatedAt),
  });
}

export async function recordAgentSession(userId: string | null, messages: unknown): Promise<string> {
  const sessionId = id("agent");
  const db = getDb();
  if (db) {
    await db.insert(t.agentSessions).values({
      id: sessionId,
      userId,
      locationId: null,
      messagesJson: messages,
      createdAt: new Date(),
    });
  } else {
    mem.agentSessions.push({
      id: sessionId,
      userId,
      messagesJson: messages,
      createdAt: new Date().toISOString(),
    });
    if (mem.agentSessions.length > 100) mem.agentSessions.shift();
  }
  return sessionId;
}
