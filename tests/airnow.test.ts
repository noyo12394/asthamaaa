import { describe, expect, it } from "vitest";
import { parseAirNowReportingAreas, selectNearestOfficialAqi } from "@/lib/airnow";

const rows = [
  "07/16/26|07/16/26|13:00|EDT|0|O|Y|Central|NJ|40.4010|-74.3250|PM2.5|158|Unhealthy|No||New Jersey DEP",
  "07/16/26|07/16/26|13:00|EDT|0|O|N|Central|NJ|40.4010|-74.3250|OZONE|48|Good|No||New Jersey DEP",
  "07/16/26|07/16/26||EDT|0|F|Y|Central|NJ|40.4010|-74.3250|PM2.5|190|Unhealthy|Yes||New Jersey DEP",
  "07/16/26|07/16/26|13:00|EDT|0|O|Y|North Central|NJ|40.7670|-74.6320|PM2.5|155|Unhealthy|No||New Jersey DEP",
].join("\n");

describe("AirNow reporting-area observations", () => {
  it("parses observations and excludes forecasts", () => {
    const parsed = parseAirNowReportingAreas(rows);
    expect(parsed).toHaveLength(3);
    expect(parsed[0]).toMatchObject({ area: "Central", pollutant: "PM2.5", aqi: 158 });
    expect(parsed[0].observedAt).toBe("2026-07-16T17:00:00.000Z");
    expect(parsed[1].pollutant).toBe("O3");
  });

  it("uses the nearest reporting area and its peak pollutant AQI", () => {
    const selected = selectNearestOfficialAqi(parseAirNowReportingAreas(rows), 40.3173, -74.6199);
    expect(selected).not.toBeNull();
    expect(selected?.area).toBe("Central");
    expect(selected?.aqi).toBe(158);
    expect(selected?.pollutant).toBe("PM2.5");
  });

  it("returns null when no reporting area is reasonably close", () => {
    const selected = selectNearestOfficialAqi(parseAirNowReportingAreas(rows), 10, -61);
    expect(selected).toBeNull();
  });
});
