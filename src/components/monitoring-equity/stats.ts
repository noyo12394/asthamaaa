export interface Tract {
  id: string;
  state: string;
  name: string;
  pop: number;
  svi: number | null;
  poverty: number | null;
  distance: number;
  monitor: number;
  lng: number;
  lat: number;
  white: number | null;
  black: number | null;
  hispanic: number | null;
  asian: number | null;
  aian: number | null;
  nhpi: number | null;
  multiracial: number | null;
  other: number | null;
}
export type TractFeature = GeoJSON.Feature<GeoJSON.Geometry, Tract>;
export interface Station {
  id: string;
  name: string;
  lat: number;
  lng: number;
  state: string;
  stateCode: string;
  lastSample: string;
  type: string;
  scale: string;
}
export interface ResearchMeta {
  generatedAt: string;
  monitorExtractionDate: string;
  monitorCutoff: string;
  monitorDefinition: string;
  referenceMonitorSites: number;
  regionMonitorSites: number;
  excluded: Record<string, number>;
  crossStateNearestTracts: number;
}
export const DISTANCE_COLORS = [
  "#8bd7cf",
  "#53a2a8",
  "#d9c786",
  "#df9876",
  "#bd708f",
];
export const DISTANCE_LABELS = [
  "0–5 km",
  "5–10 km",
  "10–25 km",
  "25–50 km",
  "50+ km",
];
export const BIVARIATE_COLORS = [
  "#d5e5e6",
  "#8bb9bc",
  "#44959d",
  "#b7b4ce",
  "#8d8fac",
  "#576b94",
  "#dca3bd",
  "#b977a4",
  "#864c88",
];
export function distanceBin(d: number) {
  return d <= 5 ? 0 : d <= 10 ? 1 : d <= 25 ? 2 : d <= 50 ? 3 : 4;
}
export function bivariateBin(t: Tract) {
  return t.svi == null
    ? -1
    : (t.svi < 0.5 ? 0 : t.svi < 0.75 ? 1 : 2) * 3 +
        (t.distance <= 10 ? 0 : t.distance <= 25 ? 1 : 2);
}
export function summarize(tracts: Tract[], threshold: number) {
  const population = tracts.reduce((n, t) => n + t.pop, 0);
  const beyond = tracts.reduce(
    (n, t) => n + (t.distance > threshold ? t.pop : 0),
    0,
  );
  const underserved = tracts.reduce(
    (n, t) =>
      n +
      (t.distance > threshold && t.svi != null && t.svi >= 0.75 ? t.pop : 0),
    0,
  );
  let median: number | null = null,
    cumulative = 0;
  for (const t of [...tracts].sort((a, b) => a.distance - b.distance)) {
    cumulative += t.pop;
    if (cumulative >= population / 2) {
      median = t.distance;
      break;
    }
  }
  const mean = population
    ? tracts.reduce((n, t) => n + t.pop * t.distance, 0) / population
    : null;
  return {
    population,
    beyond,
    underserved,
    median,
    mean,
    share: population ? (100 * beyond) / population : 0,
  };
}
export interface GroupRow {
  label: string;
  population: number;
  mean: number;
  share: number;
}
export function weightedGroup(
  tracts: Tract[],
  threshold: number,
  label: string,
  weight: (t: Tract) => number | null,
): GroupRow {
  let population = 0,
    dist = 0,
    beyond = 0;
  for (const t of tracts) {
    const n = weight(t);
    if (n == null || n < 0) continue;
    population += n;
    dist += n * t.distance;
    if (t.distance > threshold) beyond += n;
  }
  return {
    label,
    population,
    mean: population ? dist / population : 0,
    share: population ? (100 * beyond) / population : 0,
  };
}
export function disparityGroups(
  tracts: Tract[],
  threshold: number,
  dimension: string,
) {
  if (dimension === "state")
    return ["PA", "NY", "NJ", "MD", "DE"]
      .map((s) =>
        weightedGroup(
          tracts.filter((t) => t.state === s),
          threshold,
          s,
          (t) => t.pop,
        ),
      )
      .filter((g) => g.population);
  if (dimension === "poverty")
    return [
      weightedGroup(
        tracts.filter((t) => t.poverty != null && t.poverty < 15),
        threshold,
        "<15% below 150% FPL",
        (t) => t.pop,
      ),
      weightedGroup(
        tracts.filter(
          (t) => t.poverty != null && t.poverty >= 15 && t.poverty < 30,
        ),
        threshold,
        "15–30% below 150% FPL",
        (t) => t.pop,
      ),
      weightedGroup(
        tracts.filter((t) => t.poverty != null && t.poverty >= 30),
        threshold,
        "30%+ below 150% FPL",
        (t) => t.pop,
      ),
    ].filter((g) => g.population);
  const keys: [keyof Tract, string][] = [
    ["white", "White, non-Hispanic"],
    ["black", "Black, non-Hispanic"],
    ["hispanic", "Hispanic / Latino"],
    ["asian", "Asian, non-Hispanic"],
    ["aian", "American Indian / Alaska Native"],
    ["nhpi", "Native Hawaiian / Pacific Islander"],
    ["multiracial", "Two or more races"],
    ["other", "Other race, non-Hispanic"],
  ];
  return keys
    .map(([key, label]) =>
      weightedGroup(tracts, threshold, label, (t) => t[key] as number | null),
    )
    .filter((g) => g.population);
}
