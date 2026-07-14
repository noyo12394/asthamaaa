import { describe, expect, it } from "vitest";
import { distanceKm } from "@/lib/distance";
import { HEALTH_SOURCE, VULNERABILITY_SOURCE, healthForCounty, vulnerabilityForCounty } from "@/lib/health";
import { MONITOR_SOURCE, allMonitors } from "@/lib/monitors";

describe("official data snapshots", () => {
  it("uses the current official AirNow site feed", () => {
    const monitors = allMonitors();
    expect(MONITOR_SOURCE.status).toBe("official");
    expect(MONITOR_SOURCE.name).toContain("AirNow");
    expect(monitors.length).toBeGreaterThan(2000);
    expect(monitors.every((monitor) => monitor.active)).toBe(true);
    expect(monitors.every((monitor) => Number.isFinite(monitor.lat) && Number.isFinite(monitor.lng))).toBe(true);
  });

  it("uses official county health and vulnerability releases", () => {
    const lehighHealth = healthForCounty("42077");
    const lehighVulnerability = vulnerabilityForCounty("42077");
    expect(HEALTH_SOURCE.status).toBe("official");
    expect(HEALTH_SOURCE.name).toContain("CDC PLACES");
    expect(VULNERABILITY_SOURCE.status).toBe("official");
    expect(lehighHealth?.asthma).toBeGreaterThan(0);
    expect(lehighVulnerability?.svi).toBeGreaterThanOrEqual(0);
    expect(lehighVulnerability?.svi).toBeLessThanOrEqual(1);
  });
});

describe("radius search distance", () => {
  it("computes a stable great-circle distance", () => {
    expect(distanceKm(40, -75, 40, -75)).toBe(0);
    expect(distanceKm(40, -75, 41, -75)).toBeGreaterThan(110);
    expect(distanceKm(40, -75, 41, -75)).toBeLessThan(112);
  });
});
