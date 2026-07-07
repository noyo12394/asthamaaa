/**
 * Exposure Navigator agent loop.
 *
 * Modes:
 *  - "openai": OpenAI chat completions with function calling.
 *  - "gemini" / "groq": deterministic tool router first, then provider LLM
 *    composes the answer from tool results. This keeps data grounded while
 *    supporting lower-cost providers that may not share the exact tool API.
 *  - "offline": deterministic intent router only.
 */
import { TOOLS, toolByName, type ToolContext } from "./tools";
import { recordAgentSession } from "../store";
import { formatDistance, normalizeDistanceUnit } from "../distance";

export interface AgentMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AgentToolCall {
  tool: string;
  args: Record<string, unknown>;
  result: unknown;
}

export interface AgentResult {
  reply: string;
  toolCalls: AgentToolCall[];
  mode: "openai" | "gemini" | "groq" | "offline";
  modeNote: string | null;
  sessionId: string;
}

const SYSTEM_PROMPT = `You are Exposure Navigator, the analysis assistant inside PASS Equity Atlas, an environmental health intelligence platform.

Rules you must always follow:
- NEVER invent data. Every number you state must come from a tool result in this conversation. If a tool returns nothing, say the data is missing.
- Always mention the data status when it matters: values labeled "fallback" are synthetic placeholders, "modeled"/"live" are model estimates, "official" are published datasets. Never present fallback data as real conditions.
- Distinguish a current/snapshot AQI from 24-hour regulatory AQI and from annual EPA design values. Never claim annual design values from live data.
- County health indicators are population context. Never present them as an individual's diagnosis or personal risk. No medical diagnosis, no treatment advice; keep recommendations prevention-focused (e.g., limiting prolonged outdoor exertion, following an existing care plan).
- Cite the source name and vintage for key figures, briefly, e.g. "(Open-Meteo, modeled, 14:00 UTC)".
- Be concise and professional; you are speaking to residents, clinicians, and researchers.
- Use geocodePlace before location tools when the user names a place. Use the provided map context location when the user says "here" or "this place".`;

const MAX_TOOL_ROUNDS = 6;

interface OpenAiMessage {
  role: string;
  content: string | null;
  tool_calls?: {
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }[];
  tool_call_id?: string;
}

async function runLlm(
  messages: AgentMessage[],
  ctx: ToolContext
): Promise<{ reply: string; toolCalls: AgentToolCall[] }> {
  const apiKey = process.env.OPENAI_API_KEY!;
  const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
  const contextNote = ctx.location
    ? `Current map context location: ${ctx.location.label ?? ""} (lat ${ctx.location.lat}, lng ${ctx.location.lng}). Display distances in ${normalizeDistanceUnit(ctx.distanceUnit)} unless a source explicitly uses a different unit.`
    : "No map context location selected.";

  const convo: OpenAiMessage[] = [
    { role: "system", content: `${SYSTEM_PROMPT}\n\n${contextNote}` },
    ...messages.map((m) => ({ role: m.role, content: m.content })),
  ];
  const toolCalls: AgentToolCall[] = [];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: convo,
        tools: TOOLS.map((t) => ({
          type: "function",
          function: { name: t.name, description: t.description, parameters: t.parameters },
        })),
        temperature: 0.2,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`OpenAI API error ${res.status}: ${text.slice(0, 300)}`);
    }
    const data = (await res.json()) as {
      choices: { message: OpenAiMessage; finish_reason: string }[];
    };
    const msg = data.choices[0].message;
    convo.push(msg);

    if (!msg.tool_calls?.length) {
      return { reply: msg.content ?? "(no reply)", toolCalls };
    }
    for (const call of msg.tool_calls) {
      const tool = toolByName(call.function.name);
      let result: unknown;
      try {
        const args = JSON.parse(call.function.arguments || "{}") as Record<string, unknown>;
        result = tool ? await tool.execute(args, ctx) : { error: `unknown tool ${call.function.name}` };
        toolCalls.push({ tool: call.function.name, args, result });
      } catch (err) {
        result = { error: err instanceof Error ? err.message : "tool failed" };
        toolCalls.push({ tool: call.function.name, args: {}, result });
      }
      convo.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify(result).slice(0, 8000),
      });
    }
  }
  return {
    reply: "I hit the tool-call limit for one turn. Here is what I gathered so far — ask a follow-up to continue.",
    toolCalls,
  };
}

function providerSystemPrompt(ctx: ToolContext) {
  const unit = normalizeDistanceUnit(ctx.distanceUnit);
  return `${SYSTEM_PROMPT}

You are receiving already-executed backend tool results from PASS Equity Atlas.
Use only those results and the deterministic draft. Do not invent missing data.
Keep the answer concise, direct, and useful. Use ${unit} for distances.`;
}

function providerPayload(messages: AgentMessage[], draft: string, toolCalls: AgentToolCall[]) {
  return [
    `Conversation:\n${messages.map((m) => `${m.role}: ${m.content}`).join("\n")}`,
    `Deterministic backend draft:\n${draft}`,
    `Tool results JSON:\n${JSON.stringify(toolCalls).slice(0, 14000)}`,
    "Now write the final Exposure Navigator answer. Preserve caveats about fallback data, modeled/live status, and health data not being a diagnosis.",
  ].join("\n\n");
}

async function composeWithGemini(
  messages: AgentMessage[],
  ctx: ToolContext,
  draft: string,
  toolCalls: AgentToolCall[]
) {
  const apiKey = process.env.GEMINI_API_KEY!;
  const model = process.env.GEMINI_MODEL ?? "gemini-2.0-flash";
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: providerSystemPrompt(ctx) }] },
        contents: [{ role: "user", parts: [{ text: providerPayload(messages, draft, toolCalls) }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 900 },
      }),
    }
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gemini API error ${res.status}: ${text.slice(0, 300)}`);
  }
  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const reply = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("").trim();
  if (!reply) throw new Error("Gemini returned no text");
  return reply;
}

async function composeWithGroq(
  messages: AgentMessage[],
  ctx: ToolContext,
  draft: string,
  toolCalls: AgentToolCall[]
) {
  const apiKey = process.env.GROQ_API_KEY!;
  const model = process.env.GROQ_MODEL ?? "llama-3.1-8b-instant";
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: providerSystemPrompt(ctx) },
        { role: "user", content: providerPayload(messages, draft, toolCalls) },
      ],
      temperature: 0.2,
      max_tokens: 900,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Groq API error ${res.status}: ${text.slice(0, 300)}`);
  }
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const reply = data.choices?.[0]?.message?.content?.trim();
  if (!reply) throw new Error("Groq returned no text");
  return reply;
}

async function runGroundedProvider(
  provider: "gemini" | "groq",
  messages: AgentMessage[],
  ctx: ToolContext
): Promise<{ reply: string; toolCalls: AgentToolCall[] }> {
  const grounded = await runOffline(messages, ctx);
  const reply =
    provider === "gemini"
      ? await composeWithGemini(messages, ctx, grounded.reply, grounded.toolCalls)
      : await composeWithGroq(messages, ctx, grounded.reply, grounded.toolCalls);
  return { reply, toolCalls: grounded.toolCalls };
}

// ---------------------------------------------------------------------------
// Offline deterministic router — same tools, honest labeling.
// ---------------------------------------------------------------------------
async function call(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
  log: AgentToolCall[]
): Promise<unknown> {
  const tool = toolByName(name)!;
  const result = await tool.execute(args, ctx);
  log.push({ tool: name, args, result });
  return result;
}

function fmt(v: unknown): string {
  return v == null ? "n/a" : String(v);
}

function localizeDistanceText(text: string, unit: ReturnType<typeof normalizeDistanceUnit>): string {
  return text.replace(/(~?)(\d+(?:\.\d+)?)\s*km\b/g, (_match, approx: string, value: string) => {
    const digits = value.includes(".") ? 1 : 0;
    return `${approx}${formatDistance(Number(value), unit, digits)}`;
  });
}

async function runOffline(
  messages: AgentMessage[],
  ctx: ToolContext
): Promise<{ reply: string; toolCalls: AgentToolCall[] }> {
  const text = messages.filter((m) => m.role === "user").at(-1)?.content ?? "";
  const lower = text.toLowerCase();
  const log: AgentToolCall[] = [];
  const loc = ctx.location;
  const distanceUnit = normalizeDistanceUnit(ctx.distanceUnit);

  const needLocation = () =>
    "I need a location for that — search or click a place on the map first, or name a city (e.g. \"Allentown, PA\").";

  // Try to pull a named place out of the message ("in <place>", "at <place>")
  async function resolvePlace(): Promise<{ lat: number; lng: number; label: string } | null> {
    const m = text.match(/(?:in|at|near|for)\s+([A-Z][A-Za-z.\s]+(?:,\s*[A-Z]{2})?)/);
    if (m) {
      const results = (await call("geocodePlace", { query: m[1].trim() }, ctx, log)) as {
        displayName: string;
        lat: number;
        lng: number;
      }[];
      if (results.length) {
        return { lat: results[0].lat, lng: results[0].lng, label: results[0].displayName };
      }
    }
    return loc ? { lat: loc.lat, lng: loc.lng, label: loc.label ?? "selected location" } : null;
  }

  // --- compare X and Y ---
  if (lower.includes("compare")) {
    const m = text.match(/compare\s+(.+?)\s+(?:and|vs\.?|with)\s+([^.?!]+)/i);
    if (m) {
      const conditions = lower.includes("asthma") ? ["asthma"] : [];
      const places: { label: string; lat: number; lng: number }[] = [];
      // strip trailing qualifier clauses like "… for asthma-sensitive residents"
      const second = m[2].replace(/\s+(?:for|regarding|considering)\s+.*$/i, "");
      for (const namePart of [m[1], second]) {
        const r = (await call("geocodePlace", { query: namePart.trim() }, ctx, log)) as {
          displayName: string;
          lat: number;
          lng: number;
        }[];
        if (r.length) places.push({ label: r[0].displayName, lat: r[0].lat, lng: r[0].lng });
      }
      if (places.length === 2) {
        const rows = (await call("compareLocations", { locations: places, conditions }, ctx, log)) as {
          label: string;
          usAqi: number | null;
          aqiStatus: string;
          finalScore: number;
          level: string;
          monitorConfidence: number;
          healthBurden: number;
          equity: number;
        }[];
        const lines = rows.map(
          (r) =>
            `• ${r.label}: AQI ${fmt(r.usAqi)} (${r.aqiStatus}), priority ${r.finalScore}/100 (${r.level}), monitor confidence ${r.monitorConfidence}/100, county burden ${r.healthBurden}/100, equity ${r.equity}/100`
        );
        return {
          reply: `Comparison${conditions.length ? ` for ${conditions.join("/")}-sensitive residents` : ""}:\n\n${lines.join("\n")}\n\nHigher priority = more reasons for caution/attention. Check the aqiStatus labels — "fallback" means synthetic demo data, not real conditions.`,
          toolCalls: log,
        };
      }
    }
    return { reply: "Tell me the two places to compare, e.g. \"Compare Allentown, PA and Camden, NJ\".", toolCalls: log };
  }

  // --- watch rule ---
  if (lower.includes("watch") || (lower.includes("alert") && /\d/.test(lower))) {
    const th = text.match(/(?:above|over|exceeds?|>)\s*(\d{2,3})/i);
    const place = await resolvePlace();
    if (!place) return { reply: needLocation(), toolCalls: log };
    const threshold = th ? parseInt(th[1], 10) : 100;
    const conditionProfile = lower.includes("asthma")
      ? "asthma"
      : lower.includes("copd")
        ? "copd"
        : null;
    const res = (await call(
      "createWatchRule",
      {
        name: `AQI > ${threshold} at ${place.label}`,
        lat: place.lat,
        lng: place.lng,
        locationLabel: place.label,
        thresholdAqi: threshold,
        conditionProfile,
      },
      ctx,
      log
    )) as { ruleId: string };
    return {
      reply: `Done — watch rule created (${res.ruleId}): I'll flag ${place.label} whenever the scheduled refresh sees US AQI ≥ ${threshold}${conditionProfile ? `, profile: ${conditionProfile}` : ""}. See the Alerts page for status and history.`,
      toolCalls: log,
    };
  }

  // --- clinic message ---
  if (lower.includes("clinic") || lower.includes("handout") || lower.includes("resident message")) {
    const place = await resolvePlace();
    if (!place) return { reply: needLocation(), toolCalls: log };
    const language = /spanish|español/i.test(text) ? "es" : "en";
    const res = (await call(
      "generateClinicMessage",
      { lat: place.lat, lng: place.lng, language, conditionProfile: lower.includes("asthma") ? "asthma" : null },
      ctx,
      log
    )) as { message: string };
    return { reply: `Clinic-safe draft for ${place.label}:\n\n${res.message}`, toolCalls: log };
  }

  // --- sensor placement ---
  if (lower.includes("sensor")) {
    const place = await resolvePlace();
    if (!place) return { reply: needLocation(), toolCalls: log };
    const res = (await call("recommendSensorPlacement", { lat: place.lat, lng: place.lng }, ctx, log)) as {
      candidates: { county: string; priority: number; why: string }[];
    };
    const lines = res.candidates
      .slice(0, 5)
      .map((c, i) => `${i + 1}. ${c.county} — priority ${c.priority}/100. ${localizeDistanceText(c.why, distanceUnit)}`);
    return {
      reply: `Where temporary low-cost sensors would help most near ${place.label} (coverage gap × vulnerability):\n\n${lines.join("\n")}\n\nMethodology and status labels are in the Monitor Gaps view.`,
      toolCalls: log,
    };
  }

  // --- uncertainty / live vs fallback / sources ---
  if (
    lower.includes("uncertain") ||
    lower.includes("fallback") ||
    lower.includes("live") ||
    lower.includes("source") ||
    lower.includes("confiden")
  ) {
    const place = await resolvePlace();
    if (!place) return { reply: needLocation(), toolCalls: log };
    const res = (await call("explainUncertainty", { lat: place.lat, lng: place.lng }, ctx, log)) as {
      airQualityStatus: string;
      airQualityNote: string;
      monitorCoverage: { confidence: number; nearestKm: number | null; note: string; metadataStatus: string };
      countyDataVintage: { health: { vintage: string | null; status: string }; vulnerability: { vintage: string | null; status: string } };
    };
    return {
      reply:
        `Uncertainty read-out for ${place.label}:\n\n` +
        `• Air quality: status "${res.airQualityStatus}". ${res.airQualityNote}\n` +
        `• Monitor coverage: confidence ${res.monitorCoverage.confidence}/100 — nearest site ${formatDistance(res.monitorCoverage.nearestKm, distanceUnit)} (metadata: ${res.monitorCoverage.metadataStatus}). ${localizeDistanceText(res.monitorCoverage.note, distanceUnit)}\n` +
        `• County health data: ${res.countyDataVintage.health.status}, vintage ${fmt(res.countyDataVintage.health.vintage)}.\n` +
        `• Vulnerability data: ${res.countyDataVintage.vulnerability.status}, vintage ${fmt(res.countyDataVintage.vulnerability.vintage)}.\n\n` +
        `Anything marked "fallback" is a labeled synthetic placeholder, not a measurement.`,
      toolCalls: log,
    };
  }

  // --- why risky / risk score / default air-quality answer ---
  const place = await resolvePlace();
  if (!place) return { reply: needLocation(), toolCalls: log };
  const conditions = lower.includes("asthma") ? ["asthma"] : lower.includes("copd") ? ["copd"] : [];
  const risk = (await call("calculateRiskScore", { lat: place.lat, lng: place.lng, conditions }, ctx, log)) as {
    finalScore: number;
    level: string;
    explanation: string;
    components: Record<string, number>;
    caveats: string[];
  };
  const aq = (await call("getCurrentAirQuality", { lat: place.lat, lng: place.lng }, ctx, log)) as {
    usAqi: number | null;
    category: string | null;
    dataStatus: string;
    source: string;
    observedAt: string;
  };
  return {
    reply:
      `${place.label} right now:\n\n` +
      `• Snapshot US AQI ${fmt(aq.usAqi)} (${fmt(aq.category)}) — ${aq.source}, status "${aq.dataStatus}", observed ${aq.observedAt}.\n` +
      `• Alert priority ${risk.finalScore}/100 (${risk.level}). ${localizeDistanceText(risk.explanation, distanceUnit)}\n\n` +
      `Caveats: ${localizeDistanceText(risk.caveats.join(" "), distanceUnit)}`,
    toolCalls: log,
  };
}

export async function runAgent(
  messages: AgentMessage[],
  ctx: ToolContext
): Promise<AgentResult> {
  const preferred = (process.env.AI_PROVIDER || "").toLowerCase();
  const hasGemini = Boolean(process.env.GEMINI_API_KEY);
  const hasGroq = Boolean(process.env.GROQ_API_KEY);
  const hasOpenAi = Boolean(process.env.OPENAI_API_KEY);
  let reply: string;
  let toolCalls: AgentToolCall[];
  let mode: AgentResult["mode"];
  let modeNote: string | null = null;

  if ((preferred === "gemini" || (!preferred && hasGemini)) && hasGemini) {
    try {
      ({ reply, toolCalls } = await runGroundedProvider("gemini", messages, ctx));
      mode = "gemini";
    } catch (err) {
      ({ reply, toolCalls } = await runOffline(messages, ctx));
      mode = "offline";
      modeNote = `Gemini call failed (${err instanceof Error ? err.message.slice(0, 120) : "error"}); answered by the deterministic tool router instead.`;
    }
  } else if ((preferred === "groq" || (!preferred && hasGroq)) && hasGroq) {
    try {
      ({ reply, toolCalls } = await runGroundedProvider("groq", messages, ctx));
      mode = "groq";
    } catch (err) {
      ({ reply, toolCalls } = await runOffline(messages, ctx));
      mode = "offline";
      modeNote = `Groq call failed (${err instanceof Error ? err.message.slice(0, 120) : "error"}); answered by the deterministic tool router instead.`;
    }
  } else if (hasOpenAi) {
    try {
      ({ reply, toolCalls } = await runLlm(messages, ctx));
      mode = "openai";
    } catch (err) {
      ({ reply, toolCalls } = await runOffline(messages, ctx));
      mode = "offline";
      modeNote = `LLM call failed (${err instanceof Error ? err.message.slice(0, 120) : "error"}); answered by the deterministic tool router instead.`;
    }
  } else {
    ({ reply, toolCalls } = await runOffline(messages, ctx));
    mode = "offline";
    modeNote =
      "No LLM provider key is configured — this answer came from the deterministic tool router (real backend tools, scripted language). Add GEMINI_API_KEY, GROQ_API_KEY, or OPENAI_API_KEY for conversational phrasing.";
  }

  const sessionId = await recordAgentSession(ctx.userId, {
    messages,
    reply,
    toolCalls: toolCalls.map((t) => ({ tool: t.tool, args: t.args })),
    mode,
  });

  return { reply, toolCalls, mode, modeNote, sessionId };
}
