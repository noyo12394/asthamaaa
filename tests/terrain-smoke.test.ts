import { describe, expect, it } from "vitest";
import { terrainSmokeQuerySchema } from "@/app/api/terrain-smoke/route";
import {
  orographicExposureDifferential,
  parseHmsSmokeKml,
  pointInPolygon,
  spearmanCorrelation,
  terrainClasses,
} from "@/lib/terrain-smoke";

describe("terrain and smoke research helpers", () => {
  it("accepts global study coordinates while protecting map projection limits", () => {
    expect(
      terrainSmokeQuerySchema.safeParse({
        lat: -28.2308,
        lng: 28.3071,
        radiusKm: 20,
        pastDays: 3,
      }).success
    ).toBe(true);
    expect(terrainSmokeQuerySchema.safeParse({ lat: -90, lng: 28.3071 }).success).toBe(false);
    expect(terrainSmokeQuerySchema.safeParse({ lat: 40, lng: 181 }).success).toBe(false);
  });

  it("computes Spearman correlation with tied ranks", () => {
    expect(spearmanCorrelation([100, 200, 300, 400], [1, 2, 3, 4])).toBeCloseTo(1);
    expect(spearmanCorrelation([100, 200, 300, 400], [4, 3, 2, 1])).toBeCloseTo(-1);
  });

  it("assigns relative terrain thirds", () => {
    expect(terrainClasses([90, 10, 70, 20, 50, 40])).toEqual([
      "highland",
      "lowland",
      "highland",
      "lowland",
      "transition",
      "transition",
    ]);
  });

  it("reports lowland minus highland median PM2.5", () => {
    expect(
      orographicExposureDifferential([
        { terrainClass: "lowland", pm25: 12 },
        { terrainClass: "lowland", pm25: 16 },
        { terrainClass: "transition", pm25: 9 },
        { terrainClass: "highland", pm25: 6 },
        { terrainClass: "highland", pm25: 8 },
      ])
    ).toBe(7);
  });

  it("tests points against NOAA-style polygon rings", () => {
    const ring: [number, number][] = [
      [-76, 40],
      [-75, 40],
      [-75, 41],
      [-76, 41],
      [-76, 40],
    ];
    expect(pointInPolygon({ lat: 40.5, lng: -75.5 }, ring)).toBe(true);
    expect(pointInPolygon({ lat: 39.5, lng: -75.5 }, ring)).toBe(false);
  });

  it("parses HMS density and coordinates", () => {
    const kml = `<Placemark><description>Density: Medium</description><Polygon><outerBoundaryIs><LinearRing><coordinates>-76,40,0 -75,40,0 -75,41,0 -76,40,0</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>`;
    expect(parseHmsSmokeKml(kml)).toEqual([
      {
        density: "medium",
        coordinates: [
          [-76, 40],
          [-75, 40],
          [-75, 41],
          [-76, 40],
        ],
      },
    ]);
  });
});
