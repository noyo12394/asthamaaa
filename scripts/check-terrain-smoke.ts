import { getTerrainSmokeAnalysis } from "../src/lib/terrain-smoke";
import { recentFetches } from "../src/lib/freshness";

async function main() {
  const analysis = await getTerrainSmokeAnalysis(40.6023, -75.4714, 40, 3);
  console.log(
    JSON.stringify(
      {
        terrain: analysis.terrain,
        smoke: analysis.smoke,
        current: analysis.current,
        history: {
          latest: analysis.history.hourlyOed.slice(-3),
          median: analysis.history.medianOedPm25,
          positive: analysis.history.positiveHoursPct,
        },
        model: analysis.model,
        cells: analysis.cells.length,
        plumes: analysis.smokePlumes.length,
        sources: analysis.sources.map((source) => [source.name, source.status]),
        fetches: recentFetches(20).map((fetch) => ({
          source: fetch.sourceName,
          durationMs: fetch.durationMs,
          ok: fetch.ok,
        })),
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
