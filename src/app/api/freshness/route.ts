import { freshnessSummary, recentFetches } from "@/lib/freshness";
import { MONITOR_SOURCE } from "@/lib/monitors";
import { HEALTH_SOURCE, VULNERABILITY_SOURCE } from "@/lib/health";
import { COUNTY_SOURCE } from "@/lib/counties";
import { handleError, ok } from "@/lib/api";

/** Data Freshness panel: live fetch ledger + static snapshot vintages. */
export async function GET() {
  try {
    return ok({
      liveFetches: freshnessSummary(),
      recent: recentFetches(30),
      snapshots: [
        { name: "County boundaries", source: COUNTY_SOURCE },
        { name: "Monitor metadata", source: MONITOR_SOURCE },
        { name: "County health indicators", source: HEALTH_SOURCE },
        { name: "County vulnerability indicators", source: VULNERABILITY_SOURCE },
      ],
      environment: {
        airnowConfigured: true,
        airnowApiKeyConfigured: Boolean(process.env.AIRNOW_API_KEY),
        openaiConfigured: Boolean(process.env.OPENAI_API_KEY),
        databaseConfigured: Boolean(process.env.DATABASE_URL),
      },
    });
  } catch (err) {
    return handleError(err);
  }
}
