"use client";

/**
 * Exposure Navigator dock. Tool calls are shown as compact, expandable rows —
 * visible but professional. The offline/deterministic mode is labeled so the
 * fallback is never mistaken for an LLM.
 */
import { useRef, useState } from "react";
import { Bot, BrainCircuit, ChevronRight, Sparkles, X } from "lucide-react";
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
  mode?: string;
  modeNote?: string | null;
}

const SUGGESTIONS = [
  "Generate an incident brief with exposure overlay, confidence heatmap, and priority mask",
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
      setItems((cur) => [
        ...cur,
        { role: "assistant", content: d.reply, toolCalls: d.toolCalls, mode: d.mode, modeNote: d.modeNote },
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

  if (!open) {
    return (
      <button
        onClick={onToggle}
        className="panel flex items-center gap-2 rounded-sm px-2.5 py-2 text-sm font-medium shadow-lg hover:border-accent hover:bg-accent-soft sm:px-3"
      >
        <span className="grid h-5 w-5 place-items-center rounded-sm bg-accent text-white">
          <Bot size={13} />
        </span>
        <span className="hidden sm:inline">Exposure Navigator</span>
        <span className="sm:hidden">Navigator</span>
      </button>
    );
  }

  return (
    <div className="panel flex h-[460px] w-[calc(100vw-1rem)] flex-col overflow-hidden rounded-sm shadow-2xl sm:w-[380px]">
      <div className="flex items-center justify-between border-b border-hairline px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-sm bg-ink text-surface">
            <BrainCircuit size={17} />
          </span>
          <div>
            <h3 className="text-sm font-semibold">Exposure Navigator</h3>
            <p className="text-[10px] text-ink-3">
              Tool-grounded analysis · distances in {unit}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="rounded-full border border-hairline bg-surface-2 px-2 py-0.5 text-[10px] font-medium text-ink-3">
            provider auto
          </span>
          <button onClick={onToggle} className="text-ink-3 hover:text-ink" aria-label="Close assistant">
            <X size={14} />
          </button>
        </div>
      </div>
      <div className="border-b border-hairline bg-surface-2/70 px-3 py-2">
        <div className="flex items-center gap-2 text-[11px] text-ink-2">
          <Sparkles size={13} className="text-accent" />
          <span>Ask for a sensor plan, clinic-safe note, source audit, or cross-city comparison.</span>
        </div>
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-2">
        {items.length === 0 && (
          <div>
            <p className="mb-2 text-xs text-ink-3">
              Choose a workflow:
            </p>
            <ul className="space-y-1.5">
              {SUGGESTIONS.map((s) => (
                <li key={s}>
                  <button
                    onClick={() => send(s)}
                    className="group flex w-full items-center justify-between gap-2 border border-hairline bg-surface px-2 py-2 text-left text-xs text-ink-2 hover:border-accent hover:bg-accent-soft hover:text-accent"
                  >
                    <span>{s}</span>
                    <ChevronRight size={13} className="text-ink-3 group-hover:text-accent" />
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
            {m.role === "assistant" && m.mode && (
              <span className="mt-1 inline-flex rounded-full border border-hairline bg-surface-2 px-2 py-0.5 text-[10px] font-medium text-ink-3">
                mode: {m.mode}
              </span>
            )}
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
          className="min-w-0 flex-1 border border-hairline bg-surface px-2 py-1.5 text-xs outline-none focus:border-accent"
          aria-label="Message the assistant"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="bg-accent px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
        >
          Send
        </button>
      </form>
    </div>
  );
}
