"use client";

/**
 * Exposure Navigator dock. Tool calls are shown as compact, expandable rows —
 * visible but professional. The offline/deterministic mode is labeled so the
 * fallback is never mistaken for an LLM.
 */
import { useRef, useState } from "react";
import { api } from "@/lib/client/api";
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
}: {
  location: { lat: number; lng: number; label: string | null } | null;
  open: boolean;
  onToggle: () => void;
}) {
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
        }),
      });
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

  if (!open) {
    return (
      <button
        onClick={onToggle}
        className="panel flex items-center gap-2 rounded-sm px-3 py-2 text-sm font-medium shadow-sm hover:border-accent"
      >
        <span className="h-2 w-2 rounded-full bg-accent" />
        Exposure Navigator
      </button>
    );
  }

  return (
    <div className="panel flex h-[420px] w-[360px] flex-col rounded-sm shadow-lg">
      <div className="flex items-center justify-between border-b border-hairline px-3 py-2">
        <div>
          <h3 className="text-sm font-semibold">Exposure Navigator</h3>
          <p className="text-[10px] text-ink-3">
            Tool-driven analysis — cites sources, never invents data
          </p>
        </div>
        <button onClick={onToggle} className="text-ink-3 hover:text-ink" aria-label="Close assistant">
          ✕
        </button>
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
                    className="w-full border border-hairline px-2 py-1.5 text-left text-xs text-ink-2 hover:border-accent hover:text-accent"
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
