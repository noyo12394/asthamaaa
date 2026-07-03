"use client";

/** Alert Builder: form-based watch rules + status/history. */
import { useEffect, useState } from "react";
import SiteHeader from "@/components/SiteHeader";
import SearchBox, { type PickedPlace } from "@/components/ui/SearchBox";
import { api, apiWithMeta } from "@/lib/client/api";
import { Spinner } from "@/components/ui/bits";
import type { WatchRule } from "@/lib/types";

export default function AlertsPage() {
  const [rules, setRules] = useState<WatchRule[]>([]);
  const [persistence, setPersistence] = useState<"postgres" | "memory">("memory");
  const [place, setPlace] = useState<PickedPlace | null>(null);
  const [threshold, setThreshold] = useState(100);
  const [profile, setProfile] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void apiWithMeta<{ rules: WatchRule[] }>("/api/watch-rules")
      .then((d) => {
        setRules(d.data.rules);
        setPersistence(d.persistence);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function createRule(e: React.FormEvent) {
    e.preventDefault();
    if (!place) return;
    setBusy(true);
    try {
      const d = await api<{ rule: WatchRule }>("/api/watch-rules", {
        method: "POST",
        body: JSON.stringify({
          name: name || `AQI > ${threshold} at ${place.label}`,
          lat: place.lat,
          lng: place.lng,
          locationLabel: place.label,
          conditionProfile: profile || null,
          thresholdAqi: threshold,
          pollutant: "us_aqi",
        }),
      });
      setRules((cur) => [d.rule, ...cur]);
      setName("");
      setPlace(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6">
        <h1 className="text-lg font-semibold">Alert builder</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-2">
          Watch rules are evaluated by the scheduled backend refresh (every 15 minutes on Vercel
          Cron). Triggers are recorded here; email/SMS delivery is stubbed at the architecture
          level and intentionally not enabled.
        </p>
        {persistence === "memory" && (
          <p className="mt-2 inline-block border border-warning/40 bg-[#faf3d7] px-2 py-1 text-[11px] text-[#8a6d00]">
            No database configured — rules live in server memory and reset on redeploy. Set
            DATABASE_URL for durable rules.
          </p>
        )}

        <form onSubmit={createRule} className="panel mt-5 space-y-3 p-4">
          <h2 className="panel-title">New watch rule</h2>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="mb-1 block text-xs text-ink-2">Location</label>
              {place ? (
                <span className="inline-flex items-center gap-2 border border-hairline bg-accent-soft px-2 py-1.5 text-sm">
                  {place.label}
                  <button type="button" onClick={() => setPlace(null)} className="text-ink-3 hover:text-critical">
                    ✕
                  </button>
                </span>
              ) : (
                <SearchBox placeholder="Watch location…" onPick={setPlace} />
              )}
            </div>
            <label className="block text-xs text-ink-2">
              Trigger when US AQI ≥
              <input
                type="number"
                min={10}
                max={400}
                value={threshold}
                onChange={(e) => setThreshold(parseInt(e.target.value || "100", 10))}
                className="tabular mt-1 block w-24 border border-hairline bg-surface px-2 py-1.5 text-sm"
              />
            </label>
            <label className="block text-xs text-ink-2">
              Condition profile (optional)
              <input
                value={profile}
                onChange={(e) => setProfile(e.target.value)}
                placeholder="e.g. asthma, age 70"
                className="mt-1 block w-44 border border-hairline bg-surface px-2 py-1.5 text-sm"
              />
            </label>
            <label className="block text-xs text-ink-2">
              Name (optional)
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="auto"
                className="mt-1 block w-44 border border-hairline bg-surface px-2 py-1.5 text-sm"
              />
            </label>
            <button
              type="submit"
              disabled={!place || busy}
              className="bg-accent px-4 py-2 text-xs font-medium text-white disabled:opacity-40"
            >
              {busy ? "Creating…" : "Create rule"}
            </button>
          </div>
          <p className="text-[11px] text-ink-3">
            Tip: the Exposure Navigator can create rules conversationally — “create a watch rule
            when AQI is above 75”.
          </p>
        </form>

        <h2 className="panel-title mt-6 mb-2">Your rules</h2>
        {loading ? (
          <Spinner label="Loading rules…" />
        ) : rules.length === 0 ? (
          <p className="text-sm text-ink-3">No watch rules yet.</p>
        ) : (
          <div className="panel overflow-x-auto">
            <table className="tabular w-full text-sm">
              <thead>
                <tr className="border-b border-hairline text-left text-[11px] uppercase tracking-wide text-ink-3">
                  <th className="px-3 py-2 font-medium">Rule</th>
                  <th className="px-3 py-2 font-medium">Threshold</th>
                  <th className="px-3 py-2 font-medium">Profile</th>
                  <th className="px-3 py-2 font-medium">Last check</th>
                  <th className="px-3 py-2 font-medium">Last triggered</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {rules.map((r) => (
                  <tr key={r.id} className="border-b border-hairline last:border-0">
                    <td className="px-3 py-2.5">
                      <span className="font-medium">{r.name}</span>
                      {r.locationLabel && (
                        <span className="block text-[10px] text-ink-3">{r.locationLabel}</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">AQI ≥ {r.thresholdAqi}</td>
                    <td className="px-3 py-2.5 text-ink-2">{r.conditionProfile ?? "—"}</td>
                    <td className="px-3 py-2.5">{r.lastCheckedAqi != null ? `AQI ${r.lastCheckedAqi}` : "pending"}</td>
                    <td className="px-3 py-2.5">
                      {r.lastTriggeredAt ? new Date(r.lastTriggeredAt).toLocaleString() : "never"}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={r.active ? "text-good" : "text-ink-3"}>
                        {r.active ? "active" : "paused"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
