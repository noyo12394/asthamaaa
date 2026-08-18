import { RandomForestRegression } from "ml-random-forest";
import { cached, TTL } from "./cache";
import { trackedFetchJson, trackedFetchText } from "./freshness";
import type { SourceRef } from "./types";

const ELEVATION_API = "https://api.open-meteo.com/v1/elevation";
const AIR_API = "https://air-quality-api.open-meteo.com/v1/air-quality";
const WEATHER_API = "https://api.open-meteo.com/v1/forecast";
const HMS_ROOT =
  "https://satepsanone.nesdis.noaa.gov/pub/FIRE/web/HMS/Smoke_Polygons/KML";
const GRID_SIDE = 7;

export type TerrainClass = "lowland" | "transition" | "highland";
export type LandscapeClass = "low-relief" | "rolling" | "mountainous";
export type SmokeDensity = "none" | "light" | "medium" | "heavy";

interface GridPoint {
  id: string;
  row: number;
  col: number;
  lat: number;
  lng: number;
  polygon: [number, number][];
}

interface ElevationResponse {
  elevation?: (number | null)[];
}

interface AirSeries {
  latitude: number;
  longitude: number;
  current?: {
    time: string;
    pm2_5: number | null;
    us_aqi: number | null;
    carbon_monoxide: number | null;
  };
  hourly?: {
    time: string[];
    pm2_5: (number | null)[];
    us_aqi: (number | null)[];
    carbon_monoxide: (number | null)[];
  };
}

interface WeatherSeries {
  latitude: number;
  longitude: number;
  current?: {
    time: string;
    wind_speed_10m: number | null;
    boundary_layer_height: number | null;
  };
  hourly?: {
    time: string[];
    wind_speed_10m: (number | null)[];
    boundary_layer_height: (number | null)[];
  };
}

export interface SmokePolygon {
  density: Exclude<SmokeDensity, "none">;
  coordinates: [number, number][];
}

export interface TerrainSmokeCell {
  id: string;
  lat: number;
  lng: number;
  polygon: [number, number][];
  elevationM: number;
  relativeElevationM: number;
  tpiM: number;
  terrainClass: TerrainClass;
  currentPm25: number | null;
  currentAqi: number | null;
  currentWindKmh: number | null;
  currentBoundaryLayerM: number | null;
  smokeDensity: SmokeDensity | "unavailable";
}

export interface TerrainModelResult {
  status: "complete" | "insufficient";
  baselineRmse: number | null;
  terrainRmse: number | null;
  terrainLiftPct: number | null;
  r2: number | null;
  trainObservations: number;
  testObservations: number;
  heldOutHours: number;
  featureImportance: { feature: string; importance: number }[];
  interpretation: string;
}

export interface TerrainSmokeAnalysis {
  center: { lat: number; lng: number };
  radiusKm: number;
  pastDays: number;
  generatedAt: string;
  cells: TerrainSmokeCell[];
  smokePlumes: SmokePolygon[];
  terrain: {
    landscapeClass: LandscapeClass;
    minimumM: number;
    maximumM: number;
    reliefM: number;
    medianM: number;
    ruggednessM: number;
  };
  smoke: {
    latestAnalysisDate: string | null;
    analyzedDates: string[];
    unavailableDates: string[];
    daysWithOverheadSmoke: number;
    latestDensity: SmokeDensity | "unavailable";
  };
  current: {
    observedAt: string | null;
    spearmanRho: number | null;
    lowlandMedianPm25: number | null;
    highlandMedianPm25: number | null;
    oedPm25: number | null;
  };
  history: {
    hourlyOed: { time: string; value: number }[];
    medianOedPm25: number | null;
    positiveHoursPct: number | null;
  };
  model: TerrainModelResult;
  sources: SourceRef[];
  limitations: string[];
}

interface ParsedSmokeDay {
  date: string;
  available: boolean;
  url: string;
  polygons: IndexedSmokePolygon[];
}

interface IndexedSmokePolygon extends SmokePolygon {
  bounds: { west: number; east: number; south: number; north: number };
}

interface ModelRow {
  time: string;
  pm25: number;
  wind: number;
  boundaryLayer: number;
  smokeScore: number;
  smokeAvailable: number;
  hourSin: number;
  hourCos: number;
  elevation: number;
  tpi: number;
  ruggedness: number;
}

function round(value: number, digits = 1): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function ranks(values: number[]): number[] {
  const indexed = values.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value);
  const result = new Array<number>(values.length);
  let start = 0;
  while (start < indexed.length) {
    let end = start + 1;
    while (end < indexed.length && indexed[end].value === indexed[start].value) end++;
    const rank = (start + end - 1) / 2 + 1;
    for (let i = start; i < end; i++) result[indexed[i].index] = rank;
    start = end;
  }
  return result;
}

export function spearmanCorrelation(xs: number[], ys: number[]): number | null {
  if (xs.length !== ys.length || xs.length < 3) return null;
  const xr = ranks(xs);
  const yr = ranks(ys);
  const xm = average(xr);
  const ym = average(yr);
  let numerator = 0;
  let xsum = 0;
  let ysum = 0;
  for (let i = 0; i < xr.length; i++) {
    const xd = xr[i] - xm;
    const yd = yr[i] - ym;
    numerator += xd * yd;
    xsum += xd * xd;
    ysum += yd * yd;
  }
  const denominator = Math.sqrt(xsum * ysum);
  return denominator === 0 ? null : numerator / denominator;
}

export function terrainClasses(elevations: number[]): TerrainClass[] {
  const order = elevations
    .map((value, index) => ({ value, index }))
    .sort((a, b) => a.value - b.value);
  const lowCount = Math.max(1, Math.floor(order.length / 3));
  const highStart = order.length - lowCount;
  const classes = new Array<TerrainClass>(elevations.length).fill("transition");
  order.forEach((item, rank) => {
    if (rank < lowCount) classes[item.index] = "lowland";
    else if (rank >= highStart) classes[item.index] = "highland";
  });
  return classes;
}

export function orographicExposureDifferential(
  values: { terrainClass: TerrainClass; pm25: number | null }[]
): number | null {
  const lowland = values
    .filter((value) => value.terrainClass === "lowland" && value.pm25 != null)
    .map((value) => value.pm25 as number);
  const highland = values
    .filter((value) => value.terrainClass === "highland" && value.pm25 != null)
    .map((value) => value.pm25 as number);
  const lowMedian = median(lowland);
  const highMedian = median(highland);
  return lowMedian == null || highMedian == null ? null : lowMedian - highMedian;
}

export function pointInPolygon(
  point: { lat: number; lng: number },
  polygon: [number, number][]
): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    const intersects =
      yi > point.lat !== yj > point.lat &&
      point.lng < ((xj - xi) * (point.lat - yi)) / (yj - yi || Number.EPSILON) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function gridPoints(lat: number, lng: number, radiusKm: number): GridPoint[] {
  const latStep = radiusKm / 3 / 111.32;
  const lngStep = radiusKm / 3 / (111.32 * Math.cos((lat * Math.PI) / 180));
  const points: GridPoint[] = [];
  for (let row = 0; row < GRID_SIDE; row++) {
    for (let col = 0; col < GRID_SIDE; col++) {
      const y = row - 3;
      const x = col - 3;
      if (Math.hypot(x, y) > 3.05) continue;
      const pointLat = lat + y * latStep;
      const pointLng = lng + x * lngStep;
      const halfLat = latStep * 0.46;
      const halfLng = lngStep * 0.46;
      points.push({
        id: `cell-${row}-${col}`,
        row,
        col,
        lat: pointLat,
        lng: pointLng,
        polygon: [
          [pointLng - halfLng, pointLat - halfLat],
          [pointLng + halfLng, pointLat - halfLat],
          [pointLng + halfLng, pointLat + halfLat],
          [pointLng - halfLng, pointLat + halfLat],
          [pointLng - halfLng, pointLat - halfLat],
        ],
      });
    }
  }
  return points;
}

function localTerrainMetrics(points: GridPoint[], elevations: number[]) {
  const byGrid = new Map(points.map((point, index) => [`${point.row}:${point.col}`, index]));
  const tpi: number[] = [];
  const ruggedness: number[] = [];
  points.forEach((point, index) => {
    const neighbors: number[] = [];
    for (let rowOffset = -1; rowOffset <= 1; rowOffset++) {
      for (let colOffset = -1; colOffset <= 1; colOffset++) {
        if (rowOffset === 0 && colOffset === 0) continue;
        const neighborIndex = byGrid.get(`${point.row + rowOffset}:${point.col + colOffset}`);
        if (neighborIndex != null) neighbors.push(elevations[neighborIndex]);
      }
    }
    const neighborMean = neighbors.length ? average(neighbors) : elevations[index];
    tpi.push(elevations[index] - neighborMean);
    ruggedness.push(
      neighbors.length ? average(neighbors.map((value) => Math.abs(value - elevations[index]))) : 0
    );
  });
  return { tpi, ruggedness };
}

function densityScore(density: SmokeDensity): number {
  return { none: 0, light: 1, medium: 2, heavy: 3 }[density];
}

function maxSmokeDensity(
  point: { lat: number; lng: number },
  polygons: (SmokePolygon | IndexedSmokePolygon)[]
): SmokeDensity {
  let best: SmokeDensity = "none";
  for (const polygon of polygons) {
    if (
      "bounds" in polygon &&
      (point.lng < polygon.bounds.west ||
        point.lng > polygon.bounds.east ||
        point.lat < polygon.bounds.south ||
        point.lat > polygon.bounds.north)
    ) {
      continue;
    }
    if (pointInPolygon(point, polygon.coordinates) && densityScore(polygon.density) > densityScore(best)) {
      best = polygon.density;
    }
  }
  return best;
}

function indexSmokePolygon(polygon: SmokePolygon): IndexedSmokePolygon {
  let west = Infinity;
  let east = -Infinity;
  let south = Infinity;
  let north = -Infinity;
  for (const [lng, lat] of polygon.coordinates) {
    west = Math.min(west, lng);
    east = Math.max(east, lng);
    south = Math.min(south, lat);
    north = Math.max(north, lat);
  }
  return { ...polygon, bounds: { west, east, south, north } };
}

function simplifyRing(ring: [number, number][], maxPoints = 320): [number, number][] {
  if (ring.length <= maxPoints) return ring;
  const step = Math.ceil(ring.length / maxPoints);
  const simplified = ring.filter((_, index) => index % step === 0);
  const first = simplified[0];
  const last = simplified[simplified.length - 1];
  if (first && last && (first[0] !== last[0] || first[1] !== last[1])) simplified.push(first);
  return simplified;
}

export function parseHmsSmokeKml(kml: string): SmokePolygon[] {
  const placemarks = kml.match(/<Placemark\b[\s\S]*?<\/Placemark>/g) ?? [];
  const polygons: SmokePolygon[] = [];
  for (const placemark of placemarks) {
    const densityMatch = placemark.match(/Density:\s*(Light|Medium|Heavy)/i);
    if (!densityMatch) continue;
    const density = densityMatch[1].toLowerCase() as Exclude<SmokeDensity, "none">;
    const coordinateBlocks = placemark.matchAll(/<coordinates>([\s\S]*?)<\/coordinates>/g);
    for (const block of coordinateBlocks) {
      const coordinates = block[1]
        .trim()
        .split(/\s+/)
        .map((token) => token.split(",").slice(0, 2).map(Number) as [number, number])
        .filter(([pointLng, pointLat]) => Number.isFinite(pointLng) && Number.isFinite(pointLat));
      if (coordinates.length >= 4) polygons.push({ density, coordinates });
    }
  }
  return polygons;
}

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function compactDay(day: string): string {
  return day.replaceAll("-", "");
}

function hmsUrl(day: string): string {
  const [year, month] = day.split("-");
  return `${HMS_ROOT}/${year}/${month}/hms_smoke${compactDay(day)}.kml`;
}

async function fetchSmokeDay(day: string): Promise<ParsedSmokeDay> {
  const url = hmsUrl(day);
  const kml = await trackedFetchText("NOAA Hazard Mapping System smoke analysis", url, {
    entityType: "terrain-smoke-hms",
    timeoutMs: 12000,
  });
  return {
    date: day,
    available: kml != null,
    url,
    polygons: kml ? parseHmsSmokeKml(kml).map(indexSmokePolygon) : [],
  };
}

function smokeDays(pastDays: number): string[] {
  const latest = new Date();
  latest.setUTCHours(0, 0, 0, 0);
  latest.setUTCDate(latest.getUTCDate() - 1);
  return Array.from({ length: pastDays }, (_, index) => {
    const day = new Date(latest);
    day.setUTCDate(latest.getUTCDate() - (pastDays - 1 - index));
    return isoDay(day);
  });
}

function rmse(actual: number[], predicted: number[]): number {
  return Math.sqrt(average(actual.map((value, index) => (value - predicted[index]) ** 2)));
}

function rSquared(actual: number[], predicted: number[]): number | null {
  if (actual.length < 2) return null;
  const mean = average(actual);
  const total = actual.reduce((sum, value) => sum + (value - mean) ** 2, 0);
  if (total === 0) return null;
  const residual = actual.reduce((sum, value, index) => sum + (value - predicted[index]) ** 2, 0);
  return 1 - residual / total;
}

function shuffleColumn(matrix: number[][], column: number, seed: number): number[][] {
  const result = matrix.map((row) => [...row]);
  const values = result.map((row) => row[column]);
  let state = seed | 0;
  const random = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
  for (let i = values.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [values[i], values[j]] = [values[j], values[i]];
  }
  result.forEach((row, index) => {
    row[column] = values[index];
  });
  return result;
}

function runTerrainModel(rows: ModelRow[], heldOutStart: string): TerrainModelResult {
  const train = rows.filter(
    (row) => row.time < heldOutStart && Number(row.time.slice(11, 13)) % 6 === 0
  );
  const test = rows.filter((row) => row.time >= heldOutStart);
  if (train.length < 100 || test.length < 20) {
    return {
      status: "insufficient",
      baselineRmse: null,
      terrainRmse: null,
      terrainLiftPct: null,
      r2: null,
      trainObservations: train.length,
      testObservations: test.length,
      heldOutHours: 24,
      featureImportance: [],
      interpretation: "Not enough complete spatiotemporal observations were available to fit both models.",
    };
  }

  const baselineNames = ["Wind speed", "Boundary layer", "Smoke density", "Smoke available", "Hour sine", "Hour cosine"];
  const terrainNames = [...baselineNames, "Elevation", "Topographic position", "Terrain ruggedness"];
  const baselineVector = (row: ModelRow) => [
    row.wind,
    row.boundaryLayer,
    row.smokeScore,
    row.smokeAvailable,
    row.hourSin,
    row.hourCos,
  ];
  const terrainVector = (row: ModelRow) => [
    ...baselineVector(row),
    row.elevation,
    row.tpi,
    row.ruggedness,
  ];
  const options = {
    seed: 42,
    maxFeatures: 0.8,
    replacement: true,
    nEstimators: 12,
    useSampleBagging: true,
    noOOB: true,
    treeOptions: { maxDepth: 8, minNumSamples: 6 },
  };
  const baselineModel = new RandomForestRegression(options);
  const terrainModel = new RandomForestRegression(options);
  baselineModel.train(train.map(baselineVector), train.map((row) => row.pm25));
  terrainModel.train(train.map(terrainVector), train.map((row) => row.pm25));
  const testTargets = test.map((row) => row.pm25);
  const baselinePredictions = baselineModel.predict(test.map(baselineVector));
  const terrainTest = test.map(terrainVector);
  const terrainPredictions = terrainModel.predict(terrainTest);
  const baselineError = rmse(testTargets, baselinePredictions);
  const terrainError = rmse(testTargets, terrainPredictions);
  const rawImportance = terrainNames.map((feature, index) => {
    const shuffled = terrainModel.predict(shuffleColumn(terrainTest, index, 417 + index * 31));
    return { feature, increase: Math.max(0, rmse(testTargets, shuffled) - terrainError) };
  });
  const importanceTotal = rawImportance.reduce((sum, item) => sum + item.increase, 0);
  const featureImportance = rawImportance
    .map((item) => ({
      feature: item.feature,
      importance: importanceTotal === 0 ? 0 : round((item.increase / importanceTotal) * 100, 0),
    }))
    .sort((a, b) => b.importance - a.importance);
  const lift = baselineError === 0 ? 0 : ((baselineError - terrainError) / baselineError) * 100;
  const interpretation =
    lift >= 5
      ? `Adding elevation, topographic position, and ruggedness reduced held-out RMSE by ${round(lift)}%. Terrain added a meaningful predictive signal in this window.`
      : lift > 0
        ? `Terrain reduced held-out RMSE by ${round(lift)}%, a small improvement that should not be overinterpreted.`
        : `Terrain did not improve the held-out prediction in this window (${round(lift)}% lift). The null result is retained rather than hidden.`;
  return {
    status: "complete",
    baselineRmse: round(baselineError, 2),
    terrainRmse: round(terrainError, 2),
    terrainLiftPct: round(lift, 1),
    r2: rSquared(testTargets, terrainPredictions) == null ? null : round(rSquared(testTargets, terrainPredictions)!, 2),
    trainObservations: train.length,
    testObservations: test.length,
    heldOutHours: 24,
    featureImportance,
    interpretation,
  };
}

function ringIntersectsBox(
  ring: [number, number][],
  box: { west: number; east: number; south: number; north: number }
): boolean {
  let west = Infinity;
  let east = -Infinity;
  let south = Infinity;
  let north = -Infinity;
  for (const [lng, lat] of ring) {
    west = Math.min(west, lng);
    east = Math.max(east, lng);
    south = Math.min(south, lat);
    north = Math.max(north, lat);
  }
  return west <= box.east && east >= box.west && south <= box.north && north >= box.south;
}

function source(
  name: string,
  url: string,
  status: SourceRef["status"],
  confidence: SourceRef["confidence"],
  notes: string,
  vintage?: string
): SourceRef {
  return {
    name,
    url,
    status,
    confidence,
    notes,
    vintage: vintage ?? null,
    fetchedAt: new Date().toISOString(),
  };
}

async function buildAnalysis(
  lat: number,
  lng: number,
  radiusKm: number,
  pastDays: number
): Promise<TerrainSmokeAnalysis> {
  const points = gridPoints(lat, lng, radiusKm);
  const lats = points.map((point) => point.lat.toFixed(5)).join(",");
  const lngs = points.map((point) => point.lng.toFixed(5)).join(",");
  const elevationUrl = `${ELEVATION_API}?latitude=${lats}&longitude=${lngs}`;
  const airUrl =
    `${AIR_API}?latitude=${lats}&longitude=${lngs}` +
    `&current=pm2_5,us_aqi,carbon_monoxide` +
    `&hourly=pm2_5,us_aqi,carbon_monoxide&past_days=${pastDays}&forecast_days=0&timezone=UTC&cell_selection=nearest`;
  const weatherUrl =
    `${WEATHER_API}?latitude=${lats}&longitude=${lngs}` +
    `&current=wind_speed_10m,boundary_layer_height` +
    `&hourly=wind_speed_10m,boundary_layer_height&past_days=${pastDays}&forecast_days=0&timezone=UTC&cell_selection=nearest`;
  const days = smokeDays(pastDays);

  const [elevationResponse, airResponse, weatherResponse, smokeResults] = await Promise.all([
    trackedFetchJson<ElevationResponse>("Open-Meteo Elevation API", elevationUrl, {
      entityType: "terrain-elevation",
      timeoutMs: 12000,
    }),
    trackedFetchJson<AirSeries | AirSeries[]>("Open-Meteo Air Quality API (CAMS model)", airUrl, {
      entityType: "terrain-air-history",
      timeoutMs: 18000,
    }),
    trackedFetchJson<WeatherSeries | WeatherSeries[]>("Open-Meteo Weather API", weatherUrl, {
      entityType: "terrain-weather-history",
      timeoutMs: 18000,
    }),
    Promise.all(days.map(fetchSmokeDay)),
  ]);

  const elevations = elevationResponse?.elevation;
  const air = airResponse ? (Array.isArray(airResponse) ? airResponse : [airResponse]) : [];
  const weather = weatherResponse
    ? Array.isArray(weatherResponse)
      ? weatherResponse
      : [weatherResponse]
    : [];
  if (!elevations || elevations.length !== points.length || air.length !== points.length || weather.length !== points.length) {
    throw new Error("Terrain analysis sources did not return a complete spatial grid. Please retry shortly.");
  }
  const numericElevations = elevations.map((value) => {
    if (value == null || !Number.isFinite(value)) throw new Error("Elevation was unavailable for part of the analysis grid.");
    return value;
  });
  const classes = terrainClasses(numericElevations);
  const metrics = localTerrainMetrics(points, numericElevations);
  const regionMedian = median(numericElevations) ?? 0;
  const minimumM = Math.min(...numericElevations);
  const maximumM = Math.max(...numericElevations);
  const reliefM = maximumM - minimumM;
  const ruggednessM = average(metrics.ruggedness);
  const landscapeClass: LandscapeClass =
    reliefM >= 300 || ruggednessM >= 80
      ? "mountainous"
      : reliefM >= 100 || ruggednessM >= 30
        ? "rolling"
        : "low-relief";

  const smokeByDay = new Map(smokeResults.map((result) => [result.date, result]));
  const smokeDensityByDay = new Map(
    smokeResults.map((result) => [
      result.date,
      result.available
        ? points.map((point) => maxSmokeDensity(point, result.polygons))
        : points.map(() => "none" as SmokeDensity),
    ])
  );
  const availableSmoke = smokeResults.filter((result) => result.available);
  const latestSmoke = availableSmoke.at(-1) ?? null;
  const latestDensities = latestSmoke
    ? smokeDensityByDay.get(latestSmoke.date) ?? points.map(() => "none" as SmokeDensity)
    : points.map(() => "unavailable" as const);
  const cells: TerrainSmokeCell[] = points.map((point, index) => ({
    id: point.id,
    lat: round(point.lat, 5),
    lng: round(point.lng, 5),
    polygon: point.polygon,
    elevationM: round(numericElevations[index], 0),
    relativeElevationM: round(numericElevations[index] - regionMedian, 0),
    tpiM: round(metrics.tpi[index], 0),
    terrainClass: classes[index],
    currentPm25: air[index].current?.pm2_5 ?? null,
    currentAqi: air[index].current?.us_aqi ?? null,
    currentWindKmh: weather[index].current?.wind_speed_10m ?? null,
    currentBoundaryLayerM: weather[index].current?.boundary_layer_height ?? null,
    smokeDensity: latestDensities[index],
  }));

  const currentPairs = cells.filter((cell) => cell.currentPm25 != null);
  const currentRho = spearmanCorrelation(
    currentPairs.map((cell) => cell.elevationM),
    currentPairs.map((cell) => cell.currentPm25 as number)
  );
  const currentOed = orographicExposureDifferential(
    cells.map((cell) => ({ terrainClass: cell.terrainClass, pm25: cell.currentPm25 }))
  );
  const lowlandMedianPm25 = median(
    cells
      .filter((cell) => cell.terrainClass === "lowland" && cell.currentPm25 != null)
      .map((cell) => cell.currentPm25 as number)
  );
  const highlandMedianPm25 = median(
    cells
      .filter((cell) => cell.terrainClass === "highland" && cell.currentPm25 != null)
      .map((cell) => cell.currentPm25 as number)
  );

  const timestamps = air[0].hourly?.time ?? [];
  const hourlyOed = timestamps.flatMap((time, timeIndex) => {
    const value = orographicExposureDifferential(
      points.map((_, cellIndex) => ({
        terrainClass: classes[cellIndex],
        pm25: air[cellIndex].hourly?.pm2_5[timeIndex] ?? null,
      }))
    );
    return value == null ? [] : [{ time: `${time}:00Z`, value: round(value, 2) }];
  });

  const rows: ModelRow[] = [];
  const providerCells = new Set<string>();
  points.forEach((point, cellIndex) => {
    const providerKey = `${air[cellIndex].latitude.toFixed(3)}:${air[cellIndex].longitude.toFixed(3)}`;
    if (providerCells.has(providerKey)) return;
    providerCells.add(providerKey);
    const airHourly = air[cellIndex].hourly;
    const weatherHourly = weather[cellIndex].hourly;
    if (!airHourly || !weatherHourly) return;
    const weatherIndex = new Map(weatherHourly.time.map((time, index) => [time, index]));
    airHourly.time.forEach((time, airIndex) => {
      const matchedWeatherIndex = weatherIndex.get(time);
      if (matchedWeatherIndex == null) return;
      const pm25 = airHourly.pm2_5[airIndex];
      const wind = weatherHourly.wind_speed_10m[matchedWeatherIndex];
      const boundaryLayer = weatherHourly.boundary_layer_height[matchedWeatherIndex];
      if (pm25 == null || wind == null || boundaryLayer == null) return;
      const day = time.slice(0, 10);
      const smokeDay = smokeByDay.get(day);
      const smokeDensity = smokeDay?.available
        ? smokeDensityByDay.get(day)?.[cellIndex] ?? "none"
        : "none";
      const hour = Number(time.slice(11, 13));
      rows.push({
        time,
        pm25,
        wind,
        boundaryLayer,
        smokeScore: densityScore(smokeDensity),
        smokeAvailable: smokeDay?.available ? 1 : 0,
        hourSin: Math.sin((2 * Math.PI * hour) / 24),
        hourCos: Math.cos((2 * Math.PI * hour) / 24),
        elevation: numericElevations[cellIndex],
        tpi: metrics.tpi[cellIndex],
        ruggedness: metrics.ruggedness[cellIndex],
      });
    });
  });
  const heldOutStart = timestamps.length >= 24 ? timestamps[timestamps.length - 24] : "9999";
  const model = runTerrainModel(rows, heldOutStart);
  const oedValues = hourlyOed.map((point) => point.value);
  const daysWithOverheadSmoke = availableSmoke.filter((day) =>
    smokeDensityByDay.get(day.date)?.some((density) => density !== "none")
  ).length;

  const latRadius = radiusKm / 111.32;
  const lngRadius = radiusKm / (111.32 * Math.cos((lat * Math.PI) / 180));
  const analysisBox = {
    west: lng - lngRadius,
    east: lng + lngRadius,
    south: lat - latRadius,
    north: lat + latRadius,
  };
  const smokePlumes = (latestSmoke?.polygons ?? [])
    .filter((polygon) => ringIntersectsBox(polygon.coordinates, analysisBox))
    .slice(0, 40)
    .map((polygon) => ({
      density: polygon.density,
      coordinates: simplifyRing(polygon.coordinates),
    }));

  const sources: SourceRef[] = [
    source(
      "Open-Meteo Elevation API (90 m DEM point samples)",
      "https://open-meteo.com/en/docs/elevation-api",
      "modeled",
      "medium",
      "Point elevations describe the analysis grid; they are not surveyed engineering elevations."
    ),
    source(
      "Open-Meteo Air Quality API (CAMS)",
      "https://open-meteo.com/en/docs/air-quality-api",
      "modeled",
      "medium",
      "PM2.5 and AQI are model-grid estimates. They are the model target in this exploratory analysis, not ground-monitor truth."
    ),
    source(
      "Open-Meteo Weather API",
      "https://open-meteo.com/en/docs",
      "modeled",
      "medium",
      "Wind speed and planetary boundary-layer height are weather-model estimates."
    ),
    source(
      "NOAA/NESDIS Hazard Mapping System smoke polygons",
      latestSmoke?.url ?? "https://www.ospo.noaa.gov/products/land/hms.html",
      "official",
      "medium",
      "Satellite analysts map visible overhead smoke as light, medium, or heavy. The polygons do not measure ground-level smoke concentration.",
      latestSmoke?.date
    ),
    source(
      "PASS terrain-aware random-forest ablation",
      "https://asthamaaa.vercel.app/methods#terrain-smoke",
      "estimated",
      "low",
      "The final 24 UTC hours are held out. The baseline uses weather, time, and NOAA smoke; the terrain model adds elevation, topographic position, and ruggedness. This is an exploratory model diagnostic, not a validated exposure product."
    ),
  ];

  return {
    center: { lat, lng },
    radiusKm,
    pastDays,
    generatedAt: new Date().toISOString(),
    cells,
    smokePlumes,
    terrain: {
      landscapeClass,
      minimumM: round(minimumM, 0),
      maximumM: round(maximumM, 0),
      reliefM: round(reliefM, 0),
      medianM: round(regionMedian, 0),
      ruggednessM: round(ruggednessM, 0),
    },
    smoke: {
      latestAnalysisDate: latestSmoke?.date ?? null,
      analyzedDates: availableSmoke.map((day) => day.date),
      unavailableDates: smokeResults.filter((day) => !day.available).map((day) => day.date),
      daysWithOverheadSmoke,
      latestDensity:
        latestSmoke == null
          ? "unavailable"
          : (latestDensities as SmokeDensity[]).reduce<SmokeDensity>(
              (best, value) => (densityScore(value) > densityScore(best) ? value : best),
              "none"
            ),
    },
    current: {
      observedAt: air[0].current?.time ? `${air[0].current.time}:00Z` : null,
      spearmanRho: currentRho == null ? null : round(currentRho, 2),
      lowlandMedianPm25: lowlandMedianPm25 == null ? null : round(lowlandMedianPm25, 1),
      highlandMedianPm25: highlandMedianPm25 == null ? null : round(highlandMedianPm25, 1),
      oedPm25: currentOed == null ? null : round(currentOed, 1),
    },
    history: {
      hourlyOed,
      medianOedPm25: oedValues.length ? round(median(oedValues)!, 1) : null,
      positiveHoursPct: oedValues.length
        ? round((oedValues.filter((value) => value > 0).length / oedValues.length) * 100, 0)
        : null,
    },
    model,
    sources,
    limitations: [
      "OED is the median modeled PM2.5 in the lowest terrain third minus the median in the highest third. A positive value is a relative model contrast, not a causal effect of elevation.",
      "NOAA HMS shows satellite-observed visible smoke overhead. It does not establish that smoke reached breathing level or caused the modeled PM2.5 value.",
      "CAMS and the weather fields have coarser native grids than the terrain samples. Duplicate provider grid cells are removed before model fitting.",
      "The model is trained on a short rolling window and tested on the final 24 UTC hours. It must be validated against monitors with spatial and temporal blocking before research release.",
    ],
  };
}

export async function getTerrainSmokeAnalysis(
  lat: number,
  lng: number,
  radiusKm: number,
  pastDays: number
): Promise<TerrainSmokeAnalysis> {
  const day = isoDay(new Date());
  const key = `terrain-smoke:${day}:${lat.toFixed(2)}:${lng.toFixed(2)}:${radiusKm}:${pastDays}`;
  const hit = await cached(key, TTL.terrainSmoke, () => buildAnalysis(lat, lng, radiusKm, pastDays));
  return hit.value;
}
