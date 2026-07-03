import { NextRequest } from "next/server";
import { getCurrentAirQuality } from "@/lib/openmeteo";
import { listWatchRules, updateWatchRuleCheck, listSavedLocations } from "@/lib/store";
import { invalidate } from "@/lib/cache";
import { bad, handleError, ok } from "@/lib/api";

/**
 * Scheduled refresh (vercel.json cron — daily on Vercel Hobby, every 15 minutes on Pro):
 *  1. Invalidate the current-air-quality cache tier.
 *  2. Re-fetch air quality for every active watch rule and evaluate it.
 *  3. Record trigger timestamps so the Alerts page shows history.
 *
 * Auth: Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}` when the
 * env var is configured. Manual invocation with the same header works too.
 */
export async function GET(req: NextRequest) {
  try {
    const secret = process.env.CRON_SECRET;
    if (secret) {
      const auth = req.headers.get("authorization");
      if (auth !== `Bearer ${secret}`) return bad("Unauthorized", 401);
    }

    const invalidated = invalidate("aq:current:");

    const rules = await listWatchRules();
    const results: { ruleId: string; aqi: number | null; triggered: boolean }[] = [];
    for (const rule of rules.filter((r) => r.active)) {
      const { snapshot } = await getCurrentAirQuality(rule.lat, rule.lng);
      const aqi = snapshot.usAqi.value;
      const triggered = aqi != null && aqi >= rule.thresholdAqi;
      await updateWatchRuleCheck(rule.id, aqi, triggered);
      results.push({ ruleId: rule.id, aqi, triggered });
    }

    // Warm the cache for saved locations so first paint is fast.
    const demoLocations = await listSavedLocations("demo-user");
    for (const loc of demoLocations.slice(0, 10)) {
      await getCurrentAirQuality(loc.lat, loc.lng);
    }

    return ok({
      invalidatedCacheEntries: invalidated,
      rulesChecked: results.length,
      rulesTriggered: results.filter((r) => r.triggered).length,
      results,
    });
  } catch (err) {
    return handleError(err);
  }
}
