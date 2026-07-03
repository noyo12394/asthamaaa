"use client";

/** Small shared UI primitives: badges, score bars, sections. */
import { STATUS_STYLES, LEVEL_COLORS } from "@/lib/client/colors";
import type { SourceRef } from "@/lib/types";

export function StatusBadge({ status }: { status: string }) {
  const s = STATUS_STYLES[status] ?? STATUS_STYLES.seed;
  return (
    <span
      className="inline-block rounded-sm px-1.5 py-px text-[10px] font-semibold tracking-wide"
      style={{ background: s.bg, color: s.text }}
      title={`Data status: ${status}`}
    >
      {s.label}
    </span>
  );
}

export function ConfidenceDots({ confidence }: { confidence: string }) {
  const n = confidence === "high" ? 3 : confidence === "medium" ? 2 : 1;
  return (
    <span className="inline-flex items-center gap-0.5 align-middle" title={`Confidence: ${confidence}`}>
      {[1, 2, 3].map((i) => (
        <span
          key={i}
          className="h-1.5 w-1.5 rounded-full"
          style={{ background: i <= n ? "#52514e" : "#e1e0d9" }}
        />
      ))}
    </span>
  );
}

export function LevelChip({ level }: { level: string }) {
  const c = LEVEL_COLORS[level] ?? LEVEL_COLORS.Moderate;
  return (
    <span
      className="inline-block rounded-sm px-2 py-0.5 text-xs font-semibold"
      style={{ background: c.bg, color: c.text }}
    >
      {level}
    </span>
  );
}

export function SourceLine({ source }: { source: SourceRef }) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-ink-3">
      <StatusBadge status={source.status} />
      <ConfidenceDots confidence={source.confidence} />
      <span className="text-ink-2">{source.name}</span>
      {source.vintage && <span>· {source.vintage}</span>}
      {source.fetchedAt && (
        <span title={source.fetchedAt}>
          · fetched {new Date(source.fetchedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </span>
      )}
    </div>
  );
}

export function ScoreBar({
  label,
  score,
  hue = "#256abf",
  detail,
}: {
  label: string;
  score: number | null;
  hue?: string;
  detail?: string;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs text-ink-2">{label}</span>
        <span className="tabular text-xs font-semibold">{score ?? "—"}</span>
      </div>
      <div className="mt-1 h-1.5 w-full bg-surface-2">
        <div
          className="h-full transition-all duration-300"
          style={{ width: `${score ?? 0}%`, background: hue }}
        />
      </div>
      {detail && <p className="mt-1 text-[11px] leading-snug text-ink-3">{detail}</p>}
    </div>
  );
}

export function Section({
  title,
  children,
  action,
}: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className="border-b border-hairline px-3 py-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="panel-title">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-xs text-ink-3">
      <span className="h-3 w-3 animate-spin rounded-full border border-baseline border-t-accent" />
      {label}
    </span>
  );
}
