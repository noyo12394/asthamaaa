/**
 * Shared domain types. The central idea: no bare numbers. Every value that
 * reaches the UI is a `Sourced<T>` carrying provenance, freshness, and a
 * confidence label, so the source trail can be rendered anywhere.
 */

/** How a value was obtained. Rendered as a badge next to every number. */
export type DataStatus =
  | "live" // fetched from an external API within its freshness window
  | "cached" // served from backend cache, within TTL
  | "modeled" // model output (e.g. Open-Meteo reanalysis), not a physical monitor
  | "official" // official published dataset (EPA/CDC/Census)
  | "estimated" // derived by our own methodology from other inputs
  | "fallback" // deterministic placeholder because the source was unreachable
  | "seed"; // committed seed snapshot

export type Confidence = "high" | "medium" | "low";

export interface SourceRef {
  /** Human name, e.g. "Open-Meteo Air Quality API" */
  name: string;
  url?: string | null;
  /** Data vintage: an ISO timestamp for live data, a release label for datasets */
  vintage?: string | null;
  /** When our backend obtained it (ISO) */
  fetchedAt?: string | null;
  status: DataStatus;
  confidence: Confidence;
  notes?: string | null;
}

export interface Sourced<T> {
  value: T;
  unit?: string;
  source: SourceRef;
}

export type AqiCategory =
  | "Good"
  | "Moderate"
  | "Unhealthy for Sensitive Groups"
  | "Unhealthy"
  | "Very Unhealthy"
  | "Hazardous";

export interface AirQualitySnapshot {
  lat: number;
  lng: number;
  observedAt: string;
  pm25: Sourced<number | null>;
  pm10: Sourced<number | null>;
  ozone: Sourced<number | null>;
  no2: Sourced<number | null>;
  so2: Sourced<number | null>;
  co: Sourced<number | null>;
  usAqi: Sourced<number | null>;
  category: AqiCategory | null;
  dominantPollutant: string | null;
}

export interface WaterSystem {
  name: Sourced<string>;
  pwsid: Sourced<string | null>;
  status: Sourced<string>;
}

export interface WaterViolation {
  contaminant: string;
  count: Sourced<number>;
  period: string;
}

export interface WaterContaminant {
  contaminant: string;
  value: Sourced<string | number | null>;
  concern: "context" | "watch" | "elevated" | "unknown";
}

export interface WaterStation {
  id: string;
  name: string;
  type: string;
  source: SourceRef;
}

export interface WaterSample {
  characteristic: string;
  value: Sourced<string | number | null>;
  station?: string | null;
  date?: string | null;
}

export interface WaterwayAssessment {
  summary: Sourced<string>;
}

export interface ExternalWaterLink {
  label: string;
  url: string;
  sourceType: DataStatus | "external-tool" | "archived";
  explanation: string;
}

export interface WaterQualitySnapshot {
  location: {
    lat: number;
    lng: number;
    zip?: string | null;
    county?: string | null;
    state?: string | null;
  };
  status: DataStatus;
  fetchedAt: string;
  drinkingWater: {
    systems: WaterSystem[];
    violations: WaterViolation[];
    contaminants: WaterContaminant[];
  };
  surfaceWater: {
    nearbyStations: WaterStation[];
    recentSamples: WaterSample[];
    assessment?: WaterwayAssessment;
  };
  pfas: {
    detections: WaterContaminant[];
    ucmr5Summary?: Sourced<string>;
  };
  externalLinks: ExternalWaterLink[];
  sources: SourceRef[];
  caveats: string[];
}

export interface HourlyPoint {
  time: string;
  pm25: number | null;
  ozone: number | null;
  usAqi: number | null;
  kind: "past" | "current" | "forecast";
}

export interface CountyRef {
  fips: string;
  name: string;
  state: string;
  centroidLat: number;
  centroidLng: number;
}

export interface MonitorRecord {
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
  status: DataStatus;
}

export interface NearestMonitorResult {
  monitor: MonitorRecord;
  distanceKm: number;
  monitorsWithin25Km: number;
  coverage: "good" | "partial" | "sparse";
  source: SourceRef;
}

export interface SusceptibilityProfile {
  age?: number | null;
  conditions: string[]; // e.g. ["asthma", "copd"]
}

export interface ScoreComponent {
  score: number; // 0-100
  weight: number; // contribution weight to the final score
  label: string;
  explanation: string;
  inputs: Record<string, string | number | null>;
  sources: SourceRef[];
}

export type RiskLevel = "Low" | "Moderate" | "High" | "Very High";

export interface RiskScoreResult {
  lat: number;
  lng: number;
  countyFips: string | null;
  exposure: ScoreComponent;
  monitorConfidence: ScoreComponent;
  healthVulnerability: ScoreComponent;
  equity: ScoreComponent;
  susceptibility: ScoreComponent;
  finalScore: number;
  level: RiskLevel;
  explanation: string;
  caveats: string[];
  calculatedAt: string;
}

export interface SavedLocation {
  id: string;
  userId: string;
  label: string;
  address: string | null;
  lat: number;
  lng: number;
  county: string | null;
  state: string | null;
  createdAt: string;
}

export interface WatchRule {
  id: string;
  userId: string;
  name: string;
  lat: number;
  lng: number;
  locationLabel: string | null;
  conditionProfile: string | null;
  thresholdAqi: number;
  pollutant: string;
  active: boolean;
  lastTriggeredAt: string | null;
  lastCheckedAqi: number | null;
  createdAt: string;
}

export interface CommunityReport {
  id: string;
  userId: string | null;
  lat: number;
  lng: number;
  reportType: "smoke" | "odor" | "dust" | "burning" | "visibility" | "health-symptom" | "other";
  intensity: 1 | 2 | 3;
  note: string | null;
  verifiedStatus: "unverified" | "corroborated" | "disputed";
  createdAt: string;
}

export interface SourceLogEntry {
  id: string;
  entityType: string;
  entityId: string | null;
  sourceName: string;
  sourceUrl: string | null;
  fetchedAt: string;
  ok: boolean;
  httpStatus: number | null;
  durationMs: number | null;
  vintage: string | null;
  confidence: Confidence | null;
  notes: string | null;
}
