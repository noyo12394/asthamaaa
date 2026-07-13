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
