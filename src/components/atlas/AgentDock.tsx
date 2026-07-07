"use client";

/**
 * Exposure Navigator dock. Tool calls are shown as compact, expandable rows —
 * visible but professional. The offline/deterministic mode is labeled so the
 * fallback is never mistaken for an LLM.
 */
import { useRef, useState } from "react";
import { api } from "@/lib/client/api";
import type { DistanceUnit } from "@/lib/distance";
import { Spinner } from "@/components/ui/bits";

interface ToolCall {
  tool: string;
  args: Record<string, unknown>;
  result: unknown;
}

interface ChatItem {
  role: "user" | "assistant";
  content: string;
  toolCalls?: ToolCall[];
  modeNote?: string | null;
}

const MODE_LABELS: Record<string, { label: string; live: boolean }> = {
  gemini: { label: "Gemini", live: true },
  groq: { label: "Groq", live: true },
  openai: { label: "OpenAI", live: true },
  offline: { label: "Deterministic", live: false },
};

const SUGGESTIONS = [
  "Why is this place high priority?",
  "Compare Allentown, PA and Camden, NJ for asthma-sensitive residents",
  "Create a watch rule when AQI is above 75",
  "Which values here are live vs fallback?",
  "Where would temporary sensors help most?",
];

export default function AgentDock({
  location,
  open,
  onToggle,
  distanceUnit,
}: {
  location: { lat: number; lng: number; label: string | null } | null;
  open: boolean;
  onToggle: () => void;
  distanceUnit?: DistanceUnit;
}) {
  const unit = distanceUnit ?? "km";
  const [items, setItems] = useState<ChatItem[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  async function send(text: string) {
    if (!text.trim() || busy) return;
    const next: ChatItem[] = [...items, { role: "user", content: text.trim() }];
    setItems(next);
    setInput("");
    setBusy(true);
    try {
      const d = await api<{
        reply: string;
        toolCalls: ToolCall[];
        mode: string;
        modeNote: string | null;
      }>("/api/agent", {
        method: "POST",
        body: JSON.stringify({
          messages: next.map(({ role, content }) => ({ role, content })),
          location: location ? { lat: location.lat, lng: location.lng, label: location.label ?? undefined } : null,
          distanceUnit: unit,
        }),
      });
      setMode(d.mode);
      setItems((cur) => [
        ...cur,
        { role: "assistant", content: d.reply, toolCalls: d.toolCalls, modeNote: d.modeNote },
      ]);
    } catch (err) {
      setItems((cur) => [
        ...cur,
        { role: "assistant", content: `The agent endpoint failed: ${err instanceof Error ? err.message : "error"}` },
      ]);
    } finally {
      setBusy(false);
      setTimeout(() => scrollRef.current?.scrollTo({ top: 1e6, behavior: "smooth" }), 50);
    }
  }

  const modeInfo = mode ? MODE_LABELS[mode] : null;

  if (!open) {
    return (
      <button
        onClick={onToggle}
        className="btn-accent flex items-center gap-2 px-3.5 py-2 text-sm font-semibold"
      >
        <span className="live-dot h-2 w-2 rounded-full bg-white shadow-[0_0_6px_1px_rgba(255,255,255,0.8)]" />
        Exposure Navigator
      </button>
    );
  }

  return (
    <div className="panel animate-fade-up flex h-[440px] w-[370px] flex-col overflow-hidden">
      <div className="accent-gradient flex items-center justify-between px-3 py-2.5 text-white">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-white/15 ring-1 ring-white/25">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12h3l2.5-6 5 15 2.5-9H21" />
            </svg>
          </span>
          <div>
            <h3 className="text-sm font-semibold leading-none">Exposure Navigator</h3>
            <p className="mt-0.5 text-[10px] text-white/70">Tool-grounded · distances in {unit}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {modeInfo && (
            <span
              className="inline-flex items-center gap-1 rounded-full bg-white/15 px-1.5 py-0.5 text-[9px] font-semibold ring-1 ring-white/20"
              title={modeInfo.live ? "Answered by a live LLM provider" : "Answered by the deterministic tool router"}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${modeInfo.live ? "bg-emerald-300" : "bg-amber-300"}`} />
              {modeInfo.label}
            </span>
          )}
          <button onClick={onToggle} className="text-white/70 hover:text-white" aria-label="Close assistant">
            ✕
          </button>
        </div>
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-2">
        {items.length === 0 && (
          <div>
            <p className="mb-2 text-xs text-ink-3">
              Ask about the selected location, comparisons, watch rules, sensor placement, or data
              provenance:
            </p>
            <ul className="space-y-1">
              {SUGGESTIONS.map((s) => (
                <li key={s}>
                  <button
                    onClick={() => send(s)}
                    className="w-full rounded-lg border border-hairline bg-surface px-2.5 py-1.5 text-left text-xs text-ink-2 transition hover:border-accent hover:bg-accent-soft hover:text-accent"
                  >
                    {s}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {items.map((m, i) => (
          <div key={i}>
            <p className="panel-title mb-0.5">{m.role === "user" ? "You" : "Navigator"}</p>
            <div
              className={`whitespace-pre-wrap text-xs leading-relaxed ${
                m.role === "user" ? "text-ink" : "text-ink-2"
              }`}
            >
              {m.content}
            </div>
            {m.toolCalls && m.toolCalls.length > 0 && (
              <details className="mt-1.5 border border-hairline bg-surface-2 px-2 py-1">
                <summary className="cursor-pointer text-[10px] font-medium text-ink-3">
                  {m.toolCalls.length} tool call{m.toolCalls.length > 1 ? "s" : ""} —{" "}
                  {m.toolCalls.map((t) => t.tool).join(", ")}
                </summary>
                <ul className="mt-1 space-y-1">
                  {m.toolCalls.map((t, j) => (
                    <li key={j} className="text-[10px]">
                      <code className="font-medium">{t.tool}</code>
                      <pre className="mt-0.5 max-h-24 overflow-auto bg-surface p-1 text-[9px] leading-tight">
                        {JSON.stringify(t.result, null, 1)?.slice(0, 800)}
                      </pre>
                    </li>
                  ))}
                </ul>
              </details>
            )}
            {m.modeNote && (
              <p className="mt-1 border-l-2 border-warning pl-2 text-[10px] leading-snug text-ink-3">
                {m.modeNote}
              </p>
            )}
          </div>
        ))}
        {busy && <Spinner label="Running tools…" />}
      </div>

      <form
        className="flex gap-1.5 border-t border-hairline p-2"
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={location ? `Ask about ${location.label ?? "this location"}…` : "Ask the navigator…"}
          className="min-w-0 flex-1 rounded-lg border border-hairline bg-surface px-2.5 py-1.5 text-xs outline-none focus:border-accent"
          aria-label="Message the assistant"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="btn-accent px-3.5 py-1.5 text-xs font-semibold disabled:opacity-40"
        >
          Send
        </button>
      </form>
    </div>
  );
}
