import { describe, expect, it } from "vitest";
import { haversineKm, hexGrid, parseBbox, pointInGeometry } from "@/lib/geo";

describe("geo utilities", () => {
  it("haversine: Allentown to Philadelphia ~72 km", () => {
    const d = haversineKm({ lat: 40.6023, lng: -75.4714 }, { lat: 39.9526, lng: -75.1652 });
    expect(d).toBeGreaterThan(65);
    expect(d).toBeLessThan(80);
  });

  it("point-in-polygon with a hole", () => {
    const geom = {
      type: "Polygon",
      coordinates: [
        [
          [0, 0],
          [10, 0],
          [10, 10],
          [0, 10],
          [0, 0],
        ],
        [
          [4, 4],
          [6, 4],
          [6, 6],
          [4, 6],
          [4, 4],
        ],
      ],
    };
    expect(pointInGeometry(2, 2, geom)).toBe(true);
    expect(pointInGeometry(5, 5, geom)).toBe(false); // inside the hole
    expect(pointInGeometry(11, 5, geom)).toBe(false);
  });

  it("parseBbox validates ordering", () => {
    expect(parseBbox("-76,40,-75,41")).toEqual({ west: -76, south: 40, east: -75, north: 41 });
    expect(parseBbox("-75,41,-76,40")).toBeNull();
    expect(parseBbox("a,b,c,d")).toBeNull();
  });

  it("hexGrid covers a bbox with stable ids", () => {
    const bbox = { west: -75.8, south: 40.4, east: -75.2, north: 40.8 };
    const a = hexGrid(bbox, 5);
    const b = hexGrid(bbox, 5);
    expect(a.length).toBeGreaterThan(4);
    expect(a.map((c) => c.id)).toEqual(b.map((c) => c.id)); // deterministic
    for (const cell of a) expect(cell.polygon.length).toBe(7); // closed ring
  });
});
