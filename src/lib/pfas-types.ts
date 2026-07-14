export type PfasState = "DE" | "MD" | "NJ" | "NY" | "PA";
export type PfasCompound = "PFOA" | "PFOS" | "PFHxS" | "PFNA";

export interface WqpPfasSample {
  id: string;
  state: PfasState;
  source: "Water Quality Portal";
  provider: string;
  activityId: string;
  monitoringLocationId: string;
  locationName: string;
  activityType: string;
  medium: string;
  date: string;
  year: number | null;
  compound: PfasCompound;
  chemicalName: string;
  detected: boolean;
  valueNgL: number | null;
  limitNgL: number | null;
  originalValue: string;
  originalUnit: string;
  detectionCondition: string;
  method: string;
  lat: number;
  lng: number;
  coordinatePrecision: string;
  sourceUrl: string;
}

export interface UcmrPfasSystem {
  id: string;
  state: PfasState;
  pwsid: string;
  pwsName: string;
  zip: string;
  compound: "PFOA" | "PFOS";
  sampleCount: number;
  detectionCount: number;
  maxNgL: number | null;
  mrlNgL: number | null;
  latestDate: string;
  source: "EPA UCMR 5";
  spatialPrecision: string;
  sourceUrl: string;
}

export interface UcmrStateSummary {
  state: PfasState;
  samples: number;
  detections: number;
  systems: number;
  latestDate: string;
}

export interface PfasPilotSnapshot {
  generatedAt: string;
  sourceRelease: string;
  wqpSamples: WqpPfasSample[];
  ucmrSystems: UcmrPfasSystem[];
  ucmrStateSummary: UcmrStateSummary[];
}

export interface UsgsWaterHistoryPoint {
  time: string;
  value: number;
}

export interface UsgsWaterReading {
  code: string;
  label: string;
  value: number;
  unit: string;
  observedAt: string;
  provisional: boolean;
  history: UsgsWaterHistoryPoint[];
}

export interface UsgsWaterStation {
  siteCode: string;
  name: string;
  lat: number;
  lng: number;
  distanceKm: number;
  freshness: "fresh" | "recent" | "stale";
  latestObservedAt: string;
  readings: UsgsWaterReading[];
  sourceUrl: string;
}

export interface UsgsWaterSnapshot {
  status: "live" | "unavailable";
  fetchedAt: string;
  radiusKm: number;
  stations: UsgsWaterStation[];
  sourceUrl: string;
  caveats: string[];
  servedFromCache: boolean;
}
