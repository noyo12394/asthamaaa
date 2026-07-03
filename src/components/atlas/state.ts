/** Shared client-side state types for the command center. */

export type LayerId =
  | "aqi"
  | "plume"
  | "monitors"
  | "coverage"
  | "vulnerability"
  | "equity"
  | "alert"
  | "reports";

export interface LayerInfo {
  id: LayerId;
  label: string;
  description: string;
}

export const LAYERS: LayerInfo[] = [
  { id: "aqi", label: "Current AQI surface", description: "Hex cells colored by snapshot US AQI (EPA scale); extruded in 3D." },
  { id: "plume", label: "PM2.5 plume", description: "Animated heat surface weighted by PM2.5 concentration." },
  { id: "monitors", label: "Monitors", description: "Air-quality monitor sites as pins and towers. Check metadata status." },
  { id: "coverage", label: "Monitor confidence", description: "10 km (good) and 25 km (partial) coverage rings around monitors." },
  { id: "vulnerability", label: "Health vulnerability", description: "County extrusion height and blue ramp = composite vulnerability." },
  { id: "equity", label: "Equity burden", description: "Violet counties = high vulnerability × weak monitor coverage." },
  { id: "alert", label: "Alert priority", description: "Red-orange hexes where the general-population priority score is high." },
  { id: "reports", label: "Community reports", description: "Unverified resident reports. Never used in scoring." },
];

export interface SelectedFeature {
  kind: "monitor" | "report" | "county" | "cell";
  properties: Record<string, unknown>;
}

export interface SelectedLocation {
  lat: number;
  lng: number;
  label: string | null;
  feature: SelectedFeature | null;
}
