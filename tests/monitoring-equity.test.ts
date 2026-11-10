import { describe, expect, it } from "vitest";
import fs from "node:fs";
import {
  summarize,
  disparityGroups,
  distanceBin,
  bivariateBin,
  type Tract,
  type Station,
} from "../src/components/monitoring-equity/stats";
const { features } = JSON.parse(
  fs.readFileSync("public/research/monitoring-tracts.geojson", "utf8"),
);
const {
  meta,
  monitors,
}: { meta: Record<string, unknown>; monitors: Station[] } = JSON.parse(
  fs.readFileSync("public/research/monitoring-meta.json", "utf8"),
);
const tracts: Tract[] = features.map(
  (f: { properties: Tract }) => f.properties,
);
function haversine(a: Tract, b: Station) {
  const rad = Math.PI / 180;
  const p =
    Math.sin(((a.lat - b.lat) * rad) / 2) ** 2 +
    Math.cos(a.lat * rad) *
      Math.cos(b.lat * rad) *
      Math.sin(((a.lng - b.lng) * rad) / 2) ** 2;
  return 6371.0088 * 2 * Math.atan2(Math.sqrt(p), Math.sqrt(1 - p));
}
describe("Monitoring Divide research integrity", () => {
  it("matches independent precomputed population and cross-state totals", () => {
    const s = summarize(tracts, 25);
    expect(s.population).toBe(49387992);
    expect(s.beyond).toBe(8388350);
    expect(s.underserved).toBe(845175);
    expect(s.median).toBeCloseTo(9.25, 2);
    expect(
      tracts.filter((t) => monitors[t.monitor].stateCode !== t.id.slice(0, 2)),
    ).toHaveLength(1081);
    expect(meta.referenceMonitorSites).toBe(monitors.length);
  });
  it("retains mutually exclusive race counts and unique site identities", () => {
    const gs = disparityGroups(tracts, 25, "race");
    expect(gs.reduce((s, g) => s + g.population, 0)).toBe(49387992);
    expect(new Set(monitors.map((s) => s.id)).size).toBe(monitors.length);
    expect(new Set(tracts.map((t) => t.id)).size).toBe(tracts.length);
  });
  it("independently verifies nearest sites with haversine, including border tracts", () => {
    const sample = [
      ...tracts
        .filter((t) => monitors[t.monitor].stateCode !== t.id.slice(0, 2))
        .slice(0, 3),
      ...tracts.filter((_, i) => i % 900 === 0),
    ];
    for (const t of sample) {
      const nearest = Math.min(...monitors.map((m) => haversine(t, m)));
      expect(t.distance).toBeCloseTo(nearest, 4);
      expect(haversine(t, monitors[t.monitor])).toBeCloseTo(nearest, 5);
    }
  });
  it("uses group population weights and a strict distance threshold", () => {
    const base = tracts[0];
    const a = { ...base, pop: 10, distance: 5, black: 8 };
    const b = { ...base, pop: 90, distance: 25, black: 2 };
    const gs = disparityGroups([a, b], 10, "race");
    const black = gs.find((g) => g.label === "Black, non-Hispanic")!;
    expect(black.mean).toBe(9);
    expect(black.share).toBe(20);
    expect(summarize([a, b], 25).beyond).toBe(0);
    expect(summarize([a, b], 10).median).toBe(25);
  });
  it("preserves missing SVI and assigns boundary classes consistently", () => {
    expect(tracts.filter((t) => t.svi == null)).toHaveLength(66);
    expect(distanceBin(5)).toBe(0);
    expect(distanceBin(10)).toBe(1);
    expect(distanceBin(25)).toBe(2);
    expect(distanceBin(50)).toBe(3);
    expect(bivariateBin({ ...tracts[0], svi: null })).toBe(-1);
  });
});
