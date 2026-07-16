/**
 * Route-handler tests: handlers are plain functions taking a NextRequest,
 * so they can be invoked directly without a server.
 */
import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET as geocodeGet } from "@/app/api/geocode/route";
import { GET as resolveGet } from "@/app/api/location/resolve/route";
import { GET as currentGet } from "@/app/api/air-quality/current/route";
import { GET as countyGet } from "@/app/api/county-profile/route";
import { GET as nearestGet } from "@/app/api/nearest-monitor/route";
import { GET as riskGet } from "@/app/api/risk-score/route";
import { GET as cellsGet } from "@/app/api/map/cells/route";
import { GET as trailGet } from "@/app/api/source-trail/route";
import { GET as pfasExportGet } from "@/app/api/pfas/export/route";
import { GET as liveWaterGet } from "@/app/api/water/live/route";
import { POST as agentPost } from "@/app/api/agent/route";

const req = (url: string, init?: RequestInit) =>
  new NextRequest(new Request(`http://localhost${url}`, init));

describe("API routes", () => {
  it("geocode returns labeled results (gazetteer fallback offline)", async () => {
    const res = await geocodeGet(req("/api/geocode?q=Allentown"));
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data.results.length).toBeGreaterThan(0);
    expect(body.data.results[0].source.status).toBeDefined();
  });

  it("geocode rejects empty query", async () => {
    const res = await geocodeGet(req("/api/geocode?q="));
    expect(res.status).toBe(400);
  });

  it("location resolve finds Lehigh County by polygon", async () => {
    const res = await resolveGet(req("/api/location/resolve?lat=40.6023&lng=-75.4714"));
    const body = await res.json();
    expect(body.data.county.fips).toBe("42077");
    expect(body.data.nearestMonitor).not.toBeNull();
  });

  it("current air quality always carries a source status", async () => {
    const res = await currentGet(req("/api/air-quality/current?lat=40.6&lng=-75.47"));
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(["live", "cached", "official", "fallback"]).toContain(body.data.usAqi.source.status);
    expect(body.data.pm25.unit).toBe("µg/m³");
  });

  it("county profile by name+state", async () => {
    const res = await countyGet(req("/api/county-profile?county=Lehigh&state=PA"));
    const body = await res.json();
    expect(body.data.county.fips).toBe("42077");
    expect(body.data.health.source.status).toBeDefined();
    expect(body.data.disclaimer).toContain("not");
  });

  it("nearest monitor validates coordinates", async () => {
    const bad = await nearestGet(req("/api/nearest-monitor?lat=999&lng=0"));
    expect(bad.status).toBe(400);
    const ok = await nearestGet(req("/api/nearest-monitor?lat=40.6&lng=-75.47"));
    const body = await ok.json();
    expect(body.data.distanceKm).toBeGreaterThanOrEqual(0);
  });

  it("risk score reflects the susceptibility profile", async () => {
    const base = await (await riskGet(req("/api/risk-score?lat=40.6&lng=-75.47"))).json();
    const prof = await (
      await riskGet(req("/api/risk-score?lat=40.6&lng=-75.47&conditions=asthma&age=70"))
    ).json();
    expect(prof.data.susceptibility.score).toBeGreaterThan(base.data.susceptibility.score);
    expect(prof.data.finalScore).toBeGreaterThanOrEqual(base.data.finalScore);
  });

  it("map cells: aqi hexes within budget, alert layer scored", async () => {
    const res = await cellsGet(req("/api/map/cells?bbox=-75.8,40.4,-75.2,40.8&layer=aqi"));
    const body = await res.json();
    expect(body.data.features.length).toBeGreaterThan(0);
    expect(body.data.features.length).toBeLessThanOrEqual(60);
    expect(body.data.meta.source.status).toBeDefined();

    const alert = await (
      await cellsGet(req("/api/map/cells?bbox=-75.8,40.4,-75.2,40.8&layer=alert"))
    ).json();
    const f = alert.data.features[0];
    expect(f.properties.score).toBeGreaterThanOrEqual(0);
    expect(f.properties.level).toBeDefined();
  });

  it("source trail lists every contributing source", async () => {
    const res = await trailGet(req("/api/source-trail?lat=40.6&lng=-75.47"));
    const body = await res.json();
    const fields = body.data.trail.map((t: { field: string }) => t.field);
    expect(fields.join(" ")).toMatch(/air quality/i);
    expect(fields.join(" ")).toMatch(/monitor/i);
    expect(fields.join(" ")).toMatch(/county/i);
  });

  it("PFAS export preserves an expanded address radius", async () => {
    const center = "centerLat=40.6259&centerLng=-75.3705&compound=core";
    const narrow = await pfasExportGet(req(`/api/pfas/export?${center}&radiusKm=10`));
    const expanded = await pfasExportGet(req(`/api/pfas/export?${center}&radiusKm=20`));
    const narrowRows = (await narrow.text()).trim().split("\n");
    const expandedRows = (await expanded.text()).trim().split("\n");

    expect(narrowRows).toHaveLength(1);
    expect(expandedRows.length).toBeGreaterThan(1);
    expect(expanded.headers.get("content-disposition")).toContain("pass-pfas-water");
  });

  it("live water route normalizes provisional USGS sensor readings", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({
      value: {
        timeSeries: [{
          sourceInfo: {
            siteName: "Test Creek at Testville",
            siteCode: [{ value: "01234567" }],
            geoLocation: { geogLocation: { latitude: 40.61, longitude: -75.45 } },
          },
          variable: { variableCode: [{ value: "00010" }], noDataValue: -999999 },
          values: [{ value: [
            { value: "18.1", dateTime: "2026-07-14T00:00:00-04:00", qualifiers: ["P"] },
            { value: "18.4", dateTime: "2026-07-14T00:15:00-04:00", qualifiers: ["P"] },
          ] }],
        }],
      },
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    try {
      const response = await liveWaterGet(req("/api/water/live?lat=40.6&lng=-75.47&radiusKm=20"));
      const body = await response.json();
      expect(body.ok).toBe(true);
      expect(body.data.status).toBe("live");
      expect(body.data.stations[0].siteCode).toBe("01234567");
      expect(body.data.stations[0].readings[0]).toMatchObject({ label: "Water temperature", value: 18.4, unit: "°C", provisional: true });
      expect(fetchSpy.mock.calls[0][0]).toContain("period=P1D");
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("agent answers a location question with tool calls (offline mode)", async () => {
    const res = await agentPost(
      req("/api/agent", {
        method: "POST",
        body: JSON.stringify({
          messages: [{ role: "user", content: "Why is this place high priority?" }],
          location: { lat: 40.6023, lng: -75.4714, label: "Allentown, PA" },
        }),
        headers: { "Content-Type": "application/json" },
      })
    );
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data.toolCalls.length).toBeGreaterThan(0);
    expect(body.data.reply).toMatch(/priority/i);
    // without OPENAI_API_KEY this must be labeled offline
    if (!process.env.OPENAI_API_KEY) {
      expect(body.data.mode).toBe("offline");
      expect(body.data.modeNote).toContain("OPENAI_API_KEY");
    }
  });
});
