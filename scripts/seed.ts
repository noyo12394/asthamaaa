/**
 * Seed the Postgres database from the committed data snapshots.
 * Requires DATABASE_URL. Run `npm run db:push` first to create tables.
 *
 * Usage: npm run seed
 */
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as t from "../src/db/schema";
import countiesFile from "../src/data/counties.json";
import monitorsFile from "../src/data/monitors.json";
import healthFile from "../src/data/health.json";
import vulnFile from "../src/data/vulnerability.json";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set. The app runs without a DB (in-memory mode); seeding is only needed for durable deployments.");
    process.exit(1);
  }
  const client = postgres(url, { max: 1 });
  const db = drizzle(client);

  console.log("Seeding counties...");
  const counties = countiesFile.counties as {
    fips: string;
    name: string;
    state: string;
    centroidLat: number;
    centroidLng: number;
  }[];
  for (let i = 0; i < counties.length; i += 500) {
    const chunk = counties.slice(i, i + 500);
    await db
      .insert(t.counties)
      .values(
        chunk.map((c) => ({
          id: c.fips,
          fips: c.fips,
          name: c.name,
          state: c.state,
          centroidLat: c.centroidLat,
          centroidLng: c.centroidLng,
          geometryRef: `county-shapes.json#${c.fips}`,
        }))
      )
      .onConflictDoNothing();
  }

  console.log("Seeding monitors...");
  const monitors = monitorsFile.monitors as {
    id: string;
    source: string;
    monitorCode: string;
    name: string;
    lat: number;
    lng: number;
    county: string | null;
    countyFips: string | null;
    state: string | null;
    pollutants: string[];
    active: boolean;
  }[];
  for (let i = 0; i < monitors.length; i += 500) {
    const chunk = monitors.slice(i, i + 500);
    await db
      .insert(t.monitors)
      .values(chunk.map((m) => ({ ...m, lastSeenAt: new Date() })))
      .onConflictDoNothing();
  }

  console.log("Seeding health indicators...");
  const health = healthFile.records as Record<string, unknown>[];
  for (let i = 0; i < health.length; i += 500) {
    const chunk = health.slice(i, i + 500);
    await db
      .insert(t.healthIndicators)
      .values(
        chunk.map((h) => ({
          id: `health_${h.countyFips}`,
          countyId: h.countyFips as string,
          source: healthFile.source,
          year: String(h.year ?? healthFile.vintage),
          asthma: (h.asthma as number) ?? null,
          copd: (h.copd as number) ?? null,
          diabetes: (h.diabetes as number) ?? null,
          hypertension: (h.hypertension as number) ?? null,
          heartDisease: (h.heartDisease as number) ?? null,
          obesity: (h.obesity as number) ?? null,
          cancer: (h.cancer as number) ?? null,
          rawJson: h,
        }))
      )
      .onConflictDoNothing();
  }

  console.log("Seeding vulnerability indicators...");
  const vuln = vulnFile.records as Record<string, unknown>[];
  for (let i = 0; i < vuln.length; i += 500) {
    const chunk = vuln.slice(i, i + 500);
    await db
      .insert(t.vulnerabilityIndicators)
      .values(
        chunk.map((v) => ({
          id: `vuln_${v.countyFips}`,
          countyId: v.countyFips as string,
          source: vulnFile.source,
          year: String(vulnFile.vintage),
          svi: (v.svi as number) ?? null,
          poverty: (v.poverty as number) ?? null,
          elderly: (v.elderly as number) ?? null,
          children: (v.children as number) ?? null,
          disability: (v.disability as number) ?? null,
          limitedEnglish: (v.limitedEnglish as number) ?? null,
          noVehicle: (v.noVehicle as number) ?? null,
          rawJson: v,
        }))
      )
      .onConflictDoNothing();
  }

  console.log("Seeding demo user...");
  await db
    .insert(t.users)
    .values({ id: "demo-user", email: null, name: "Demo User", role: "resident" })
    .onConflictDoNothing();

  console.log("Done.");
  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
