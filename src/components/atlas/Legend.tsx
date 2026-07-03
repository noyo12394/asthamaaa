"use client";

/** Map legend that follows the active layers; shows the data-status badge of the last fetch. */
import { AQI_BREAKS, ALERT_RAMP, BLUE_RAMP, VIOLET_RAMP } from "@/lib/client/colors";
import { StatusBadge } from "@/components/ui/bits";
import type { LayerId } from "./state";

function Ramp({ colors, minLabel, maxLabel }: { colors: readonly string[]; minLabel: string; maxLabel: string }) {
  return (
    <div>
      <div className="flex h-2 w-32 overflow-hidden rounded-sm">
        {colors.map((c, i) => (
          <span key={i} className="flex-1" style={{ background: c }} />
        ))}
      </div>
      <div className="mt-0.5 flex justify-between text-[9px] text-ink-3">
        <span>{minLabel}</span>
        <span>{maxLabel}</span>
      </div>
    </div>
  );
}

export default function Legend({
  activeLayers,
  layerMeta,
}: {
  activeLayers: LayerId[];
  layerMeta: Partial<Record<LayerId, unknown>>;
}) {
  if (activeLayers.length === 0) return null;
  const aqiMeta = layerMeta.aqi as { source?: { status?: string } } | undefined;

  return (
    <div className="panel max-w-[220px] space-y-3 rounded-sm p-2.5 text-xs shadow-sm">
      {activeLayers.includes("aqi") && (
        <div>
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className="panel-title">US AQI</span>
            {aqiMeta?.source?.status && <StatusBadge status={aqiMeta.source.status} />}
          </div>
          <ul className="space-y-0.5">
            {AQI_BREAKS.slice(0, 5).map((b) => (
              <li key={b.label} className="flex items-center gap-1.5 text-[10px]">
                <span className="h-2.5 w-2.5 rounded-[2px]" style={{ background: b.fill, opacity: 0.7 }} />
                <span className="text-ink-2">
                  {b.label} {b.max !== Infinity && `(≤${b.max})`}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {activeLayers.includes("vulnerability") && (
        <div>
          <span className="panel-title">Health vulnerability</span>
          <Ramp colors={BLUE_RAMP} minLabel="low" maxLabel="high" />
        </div>
      )}
      {activeLayers.includes("equity") && (
        <div>
          <span className="panel-title">Equity burden</span>
          <Ramp colors={VIOLET_RAMP} minLabel="low" maxLabel="high" />
        </div>
      )}
      {activeLayers.includes("alert") && (
        <div>
          <span className="panel-title">Alert priority</span>
          <Ramp colors={ALERT_RAMP} minLabel="0" maxLabel="100" />
        </div>
      )}
      {activeLayers.includes("coverage") && (
        <div className="flex items-center gap-1.5 text-[10px] text-ink-2">
          <span className="h-2.5 w-2.5 rounded-full border border-dashed" style={{ borderColor: "#2d8888", background: "rgba(45,136,136,0.15)" }} />
          Monitor coverage: solid ≈ 10 km, faint ≈ 25 km
        </div>
      )}
      {activeLayers.includes("monitors") && (
        <div className="flex items-center gap-1.5 text-[10px] text-ink-2">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#125858" }} />
          Monitor site (click for metadata)
        </div>
      )}
      {activeLayers.includes("reports") && (
        <div className="flex items-center gap-1.5 text-[10px] text-ink-2">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#b97b00" }} />
          Community report — unverified
        </div>
      )}
    </div>
  );
}
