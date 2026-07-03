/**
 * Lazy Postgres client. Only instantiated when DATABASE_URL is present, so
 * the whole app (including builds and previews) works with no database.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Db = ReturnType<typeof drizzle<typeof schema>>;

const g = globalThis as Record<string, unknown>;

export function getDb(): Db | null {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  if (!g.__atlasDb) {
    const client = postgres(url, { max: 1, prepare: false }); // serverless-friendly
    g.__atlasDb = drizzle(client, { schema });
  }
  return g.__atlasDb as Db;
}

export function hasDb(): boolean {
  return Boolean(process.env.DATABASE_URL);
}
