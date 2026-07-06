/**
 * PostgreSQL schema (Drizzle ORM). Mirrors the domain described in
 * ARCHITECTURE.md. The app runs without a database (in-memory store seeded
 * from src/data snapshots); when DATABASE_URL is configured, user-generated
 * records and observation history become durable.
 */
import {
  boolean,
  doublePrecision,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email").unique(),
  name: text("name"),
  role: text("role").notNull().default("resident"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const savedLocations = pgTable("saved_locations", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  label: text("label").notNull(),
  address: text("address"),
  lat: doublePrecision("lat").notNull(),
  lng: doublePrecision("lng").notNull(),
  county: text("county"),
  state: text("state"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const counties = pgTable("counties", {
  id: text("id").primaryKey(), // 5-digit FIPS
  name: text("name").notNull(),
  state: text("state").notNull(),
  fips: text("fips").notNull().unique(),
  centroidLat: doublePrecision("centroid_lat").notNull(),
  centroidLng: doublePrecision("centroid_lng").notNull(),
  geometryRef: text("geometry_ref"), // key into the shapes snapshot / tile source
});

export const monitors = pgTable("monitors", {
  id: text("id").primaryKey(),
  source: text("source").notNull(), // airnow | epa-aqs | seed-fallback
  monitorCode: text("monitor_code").notNull(),
  name: text("name").notNull(),
  lat: doublePrecision("lat").notNull(),
  lng: doublePrecision("lng").notNull(),
  county: text("county"),
  countyFips: text("county_fips"),
  state: text("state"),
  pollutants: jsonb("pollutants").$type<string[]>().notNull().default([]),
  active: boolean("active").notNull().default(true),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
});

export const airQualityObservations = pgTable("air_quality_observations", {
  id: text("id").primaryKey(),
  source: text("source").notNull(),
  lat: doublePrecision("lat").notNull(),
  lng: doublePrecision("lng").notNull(),
  monitorId: text("monitor_id"),
  pm25: doublePrecision("pm25"),
  pm10: doublePrecision("pm10"),
  ozone: doublePrecision("ozone"),
  no2: doublePrecision("no2"),
  so2: doublePrecision("so2"),
  co: doublePrecision("co"),
  usAqi: integer("us_aqi"),
  category: text("category"),
  observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
  rawJson: jsonb("raw_json"),
});

export const healthIndicators = pgTable("health_indicators", {
  id: text("id").primaryKey(),
  countyId: text("county_id").notNull(),
  source: text("source").notNull(),
  year: text("year"),
  asthma: doublePrecision("asthma"),
  copd: doublePrecision("copd"),
  diabetes: doublePrecision("diabetes"),
  hypertension: doublePrecision("hypertension"),
  heartDisease: doublePrecision("heart_disease"),
  obesity: doublePrecision("obesity"),
  cancer: doublePrecision("cancer"),
  rawJson: jsonb("raw_json"),
});

export const vulnerabilityIndicators = pgTable("vulnerability_indicators", {
  id: text("id").primaryKey(),
  countyId: text("county_id").notNull(),
  source: text("source").notNull(),
  year: text("year"),
  svi: doublePrecision("svi"),
  poverty: doublePrecision("poverty"),
  elderly: doublePrecision("elderly"),
  children: doublePrecision("children"),
  disability: doublePrecision("disability"),
  limitedEnglish: doublePrecision("limited_english"),
  noVehicle: doublePrecision("no_vehicle"),
  rawJson: jsonb("raw_json"),
});

export const riskScores = pgTable("risk_scores", {
  id: text("id").primaryKey(),
  locationId: text("location_id"),
  lat: doublePrecision("lat").notNull(),
  lng: doublePrecision("lng").notNull(),
  countyId: text("county_id"),
  exposureScore: integer("exposure_score").notNull(),
  monitorConfidenceScore: integer("monitor_confidence_score").notNull(),
  healthVulnerabilityScore: integer("health_vulnerability_score").notNull(),
  equityScore: integer("equity_score").notNull(),
  susceptibilityScore: integer("susceptibility_score").notNull(),
  finalScore: integer("final_score").notNull(),
  level: text("level").notNull(),
  explanationJson: jsonb("explanation_json"),
  calculatedAt: timestamp("calculated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sourceLogs = pgTable("source_logs", {
  id: text("id").primaryKey(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id"),
  sourceName: text("source_name").notNull(),
  sourceUrl: text("source_url"),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
  ok: boolean("ok").notNull().default(true),
  httpStatus: integer("http_status"),
  durationMs: integer("duration_ms"),
  vintage: text("vintage"),
  confidence: text("confidence"),
  notes: text("notes"),
});

export const watchRules = pgTable("watch_rules", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  locationId: text("location_id"),
  name: text("name").notNull(),
  lat: doublePrecision("lat").notNull(),
  lng: doublePrecision("lng").notNull(),
  locationLabel: text("location_label"),
  conditionProfile: text("condition_profile"),
  thresholdAqi: integer("threshold_aqi").notNull(),
  pollutant: text("pollutant").notNull().default("us_aqi"),
  active: boolean("active").notNull().default(true),
  lastTriggeredAt: timestamp("last_triggered_at", { withTimezone: true }),
  lastCheckedAqi: integer("last_checked_aqi"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const communityReports = pgTable("community_reports", {
  id: text("id").primaryKey(),
  userId: text("user_id"),
  lat: doublePrecision("lat").notNull(),
  lng: doublePrecision("lng").notNull(),
  reportType: text("report_type").notNull(),
  intensity: integer("intensity").notNull().default(1),
  note: text("note"),
  verifiedStatus: text("verified_status").notNull().default("unverified"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const agentSessions = pgTable("agent_sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id"),
  locationId: text("location_id"),
  messagesJson: jsonb("messages_json"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
