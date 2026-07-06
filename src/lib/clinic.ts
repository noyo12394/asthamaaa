/**
 * Clinic Mode content engine.
 *
 * Produces a structured, plain-language card for community health workers:
 * headline, what-it-means (including monitor confidence in practical terms),
 * 2-3 condition-specific actions, and doctor-conversation prompts — in
 * English or Spanish (full translated generation, same numbers).
 *
 * Generation: OpenAI at request time with the live numbers as input when
 * OPENAI_API_KEY is set (mode "llm"); otherwise deterministic bilingual
 * templates (mode "template"). Both paths are labeled in the response, both
 * are prevention-focused, and neither diagnoses.
 */
import { getCurrentAirQuality } from "./openmeteo";
import { classifySparsity } from "./sparsity";
import { calculateRiskScore } from "./scoring";
import type { SourceRef } from "./types";

export type ClinicCondition =
  | "asthma"
  | "copd"
  | "heart-disease"
  | "diabetes"
  | "general";

export interface ClinicCard {
  language: "en" | "es";
  condition: ClinicCondition;
  location: { lat: number; lng: number };
  numbers: {
    usAqi: number | null;
    category: string | null;
    pm25: number | null;
    riskScore: number;
    riskLevel: string;
    sparsityClass: string;
    nearestMonitorMiles: number | null;
    dataStatus: string;
    observedAt: string;
  };
  headline: string;
  meaning: string[];
  actions: string[];
  doctorPrompts: string[];
  numbersNote: string;
  generation: "llm" | "template";
  generationNote: string;
  sources: SourceRef[];
  generatedAt: string;
}

const KM_TO_MI = 0.6214;

// ---------------------------------------------------------------------------
// Deterministic bilingual templates
// ---------------------------------------------------------------------------

const CONDITION_LABEL: Record<ClinicCondition, { en: string; es: string }> = {
  asthma: { en: "asthma", es: "asma" },
  copd: { en: "COPD", es: "EPOC" },
  "heart-disease": { en: "heart disease", es: "enfermedad cardíaca" },
  diabetes: { en: "diabetes", es: "diabetes" },
  general: { en: "air sensitivity", es: "sensibilidad al aire" },
};

function templateActions(cond: ClinicCondition, elevated: boolean, es: boolean): string[] {
  const A: Record<ClinicCondition, { calm: string[]; elevated: string[] }> = {
    asthma: {
      calm: es
        ? [
            "Mantenga su plan de manejo habitual y su inhalador de alivio a mano.",
            "Si nota síntomas al hacer ejercicio afuera, tome descansos y anótelo para su próxima cita.",
          ]
        : [
            "Keep to your usual management plan and have your reliever inhaler available.",
            "If symptoms appear during outdoor exercise, take breaks and note it for your next appointment.",
          ],
      elevated: es
        ? [
            "Considere trasladar el ejercicio intenso al interior hoy.",
            "Lleve su inhalador de alivio; úselo según su plan de acción, no más seguido sin consultar.",
            "Ventile la casa cuando el aire mejore, no durante las horas pico.",
          ]
        : [
            "Consider moving strenuous exercise indoors today.",
            "Carry your reliever inhaler; use it per your action plan, not more often without asking your care team.",
            "Air out the home when conditions improve, not during peak hours.",
          ],
    },
    copd: {
      calm: es
        ? [
            "Siga su rutina y medicación habituales.",
            "Planifique actividades al aire libre para las horas de mejor calidad del aire.",
          ]
        : [
            "Keep to your usual routine and medication.",
            "Plan outdoor activity for the better air-quality hours of the day.",
          ],
      elevated: es
        ? [
            "Limite el esfuerzo prolongado al aire libre hoy.",
            "Tenga a mano su medicación de rescate y siga su plan de acción.",
            "Si usa oxígeno, no cambie el flujo sin hablar con su equipo de salud.",
          ]
        : [
            "Limit prolonged outdoor exertion today.",
            "Keep rescue medication at hand and follow your action plan.",
            "If you use oxygen, do not change your flow rate without talking to your care team.",
          ],
    },
    "heart-disease": {
      calm: es
        ? [
            "Mantenga su actividad y medicación habituales.",
            "Anote cualquier síntoma inusual (palpitaciones, fatiga) junto con la fecha.",
          ]
        : [
            "Keep to your usual activity and medication.",
            "Note any unusual symptoms (palpitations, fatigue) with the date.",
          ],
      elevated: es
        ? [
            "Evite esfuerzos intensos al aire libre hoy; camine a ritmo cómodo.",
            "Tome sus medicamentos según lo recetado — no salte dosis.",
            "Ante dolor de pecho o falta de aire inusual, busque atención de inmediato.",
          ]
        : [
            "Avoid strenuous outdoor exertion today; walk at a comfortable pace.",
            "Take medications as prescribed — do not skip doses.",
            "For chest pain or unusual shortness of breath, seek care immediately.",
          ],
    },
    diabetes: {
      calm: es
        ? [
            "Mantenga su rutina de actividad física habitual.",
            "El aire de hoy no requiere cambios en su plan.",
          ]
        : [
            "Keep to your usual physical-activity routine.",
            "Today's air does not call for changes to your plan.",
          ],
      elevated: es
        ? [
            "Si camina para controlar la glucosa, prefiera horarios o rutas con mejor aire.",
            "Manténgase hidratado y controle su glucosa como de costumbre.",
          ]
        : [
            "If you walk for glucose management, prefer times or routes with better air.",
            "Stay hydrated and monitor glucose as usual.",
          ],
    },
    general: {
      calm: es
        ? ["Las condiciones actuales no requieren precauciones especiales."]
        : ["Current conditions do not call for special precautions."],
      elevated: es
        ? [
            "Personas sensibles pueden reducir el esfuerzo prolongado al aire libre hoy.",
            "Cierre las ventanas durante las horas de peor calidad del aire.",
          ]
        : [
            "Sensitive individuals may reduce prolonged outdoor exertion today.",
            "Keep windows closed during the worst air-quality hours.",
          ],
    },
  };
  return elevated ? A[cond].elevated : A[cond].calm;
}

function templateDoctorPrompts(cond: ClinicCondition, elevated: boolean, es: boolean): string[] {
  const condName = CONDITION_LABEL[cond][es ? "es" : "en"];
  if (es) {
    const base = [
      `¿Debería la calidad del aire de esta semana cambiar cómo manejo mi ${condName}?`,
      "¿Qué señales me indicarían que debo llamar a la clínica en un día de mal aire?",
    ];
    if (elevated) base.push("¿Conviene ajustar mi plan de acción para los días con aire elevado como hoy?");
    return base;
  }
  const base = [
    `Should this week's air quality change how I manage my ${condName}?`,
    "What warning signs mean I should call the clinic on a bad-air day?",
  ];
  if (elevated) base.push("Should my action plan be adjusted for elevated-air days like today?");
  return base;
}

function buildTemplateCard(input: {
  es: boolean;
  cond: ClinicCondition;
  aqi: number | null;
  category: string | null;
  sparsityClass: string;
  nearestMiles: number | null;
  isFallback: boolean;
  riskLevel: string;
}): Pick<ClinicCard, "headline" | "meaning" | "actions" | "doctorPrompts"> {
  const { es, cond, aqi, category, sparsityClass, nearestMiles, isFallback, riskLevel } = input;
  const elevated = aqi != null && aqi > 100;
  const moderate = aqi != null && aqi > 50 && aqi <= 100;

  const headline = es
    ? aqi != null
      ? `El índice de calidad del aire (AQI) es ${aqi} — categoría "${category}". Prioridad de atención: ${riskLevel}.`
      : "No hay un valor de AQI disponible en este momento."
    : aqi != null
      ? `The Air Quality Index (AQI) is ${aqi} — "${category}" category. Attention priority: ${riskLevel}.`
      : "An AQI value is not available right now.";

  const meaning: string[] = [];
  if (es) {
    meaning.push(
      elevated
        ? "El aire de hoy puede afectar a personas sensibles; es razonable tomar precauciones simples."
        : moderate
          ? "El aire de hoy es aceptable para la mayoría; personas muy sensibles pueden notar efectos."
          : "El aire de hoy se considera bueno para actividades normales."
    );
    meaning.push(
      sparsityClass === "dense" || sparsityClass === "moderate"
        ? `Hay un monitor oficial a ~${nearestMiles ?? "?"} millas, así que este número está bien anclado a mediciones reales.`
        : `No hay monitor oficial cerca (el más cercano está a ~${nearestMiles ?? "?"} millas). El número de hoy es una estimación de modelo/satélite — úselo como guía aproximada, no como medición.`
    );
    if (isFallback)
      meaning.push("AVISO: los datos en vivo no estaban disponibles; esta tarjeta usa datos de demostración etiquetados.");
  } else {
    meaning.push(
      elevated
        ? "Today's air can affect sensitive people; simple precautions are reasonable."
        : moderate
          ? "Today's air is acceptable for most people; unusually sensitive people may notice effects."
          : "Today's air is considered good for normal activities."
    );
    meaning.push(
      sparsityClass === "dense" || sparsityClass === "moderate"
        ? `An official monitor is ~${nearestMiles ?? "?"} miles away, so this number is well anchored to real measurements.`
        : `No official monitor is nearby (nearest is ~${nearestMiles ?? "?"} miles). Today's number is a model/satellite estimate — treat it as a rough guide, not a measurement.`
    );
    if (isFallback)
      meaning.push("NOTE: live data was unavailable; this card uses labeled demonstration data.");
  }

  return {
    headline,
    meaning,
    actions: templateActions(cond, elevated || moderate, es),
    doctorPrompts: templateDoctorPrompts(cond, elevated, es),
  };
}

// ---------------------------------------------------------------------------
// LLM generation (request-time, live numbers as input)
// ---------------------------------------------------------------------------

async function llmSections(
  numbers: ClinicCard["numbers"],
  cond: ClinicCondition,
  language: "en" | "es"
): Promise<Pick<ClinicCard, "headline" | "meaning" | "actions" | "doctorPrompts"> | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  const sys = `You write one-page air-quality handouts for community health workers. Rules: plain 8th-grade language; prevention-focused; never diagnose or adjust medication; never invent numbers — use ONLY the numbers provided; explicitly explain the monitor-confidence situation in practical terms; if dataStatus is "fallback" say clearly the numbers are demonstration data. Write entirely in ${language === "es" ? "Spanish" : "English"}. Respond as JSON: {"headline": string, "meaning": string[2-3], "actions": string[2-3], "doctorPrompts": string[2-3]}.`;
  const user = `Condition focus: ${cond}. Live numbers: ${JSON.stringify(numbers)}. nearestMonitorMiles tells how far the closest official monitor is; sparsityClass ${numbers.sparsityClass} means ${numbers.sparsityClass === "dense" || numbers.sparsityClass === "moderate" ? "the estimate is anchored by a nearby monitor" : "there is no nearby monitor and the value is a model/satellite estimate"}.`;
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
        messages: [
          { role: "system", content: sys },
          { role: "user", content: user },
        ],
        response_format: { type: "json_object" },
        temperature: 0.4,
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { choices: { message: { content: string } }[] };
    const parsed = JSON.parse(data.choices[0].message.content) as {
      headline: string;
      meaning: string[];
      actions: string[];
      doctorPrompts: string[];
    };
    if (!parsed.headline || !Array.isArray(parsed.actions)) return null;
    return {
      headline: String(parsed.headline),
      meaning: (parsed.meaning ?? []).map(String).slice(0, 3),
      actions: parsed.actions.map(String).slice(0, 3),
      doctorPrompts: (parsed.doctorPrompts ?? []).map(String).slice(0, 3),
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------

export async function generateClinicCard(
  lat: number,
  lng: number,
  condition: ClinicCondition,
  language: "en" | "es"
): Promise<ClinicCard> {
  const [{ snapshot }, risk] = await Promise.all([
    getCurrentAirQuality(lat, lng),
    calculateRiskScore(lat, lng, {
      conditions: condition === "general" ? [] : [condition],
    }),
  ]);
  const sparsity = classifySparsity(lat, lng);
  const nearestMiles =
    sparsity.nearestMonitorKm != null
      ? Math.round(sparsity.nearestMonitorKm * KM_TO_MI * 10) / 10
      : null;

  const numbers: ClinicCard["numbers"] = {
    usAqi: snapshot.usAqi.value,
    category: snapshot.category,
    pm25: snapshot.pm25.value,
    riskScore: risk.finalScore,
    riskLevel: risk.level,
    sparsityClass: sparsity.class,
    nearestMonitorMiles: nearestMiles,
    dataStatus: snapshot.usAqi.source.status,
    observedAt: snapshot.observedAt,
  };

  const llm = await llmSections(numbers, condition, language);
  const sections =
    llm ??
    buildTemplateCard({
      es: language === "es",
      cond: condition,
      aqi: numbers.usAqi,
      category: numbers.category,
      sparsityClass: sparsity.class,
      nearestMiles,
      isFallback: numbers.dataStatus === "fallback",
      riskLevel: risk.level,
    });

  return {
    language,
    condition,
    location: { lat, lng },
    numbers,
    ...sections,
    numbersNote:
      language === "es"
        ? "Los números y umbrales no cambian con el idioma — solo el texto explicativo."
        : "Numbers and thresholds do not change with language — only the explanatory text.",
    generation: llm ? "llm" : "template",
    generationNote: llm
      ? "Narrative generated at request time from the live numbers above."
      : "Narrative from reviewed bilingual templates (no LLM configured); numbers are inserted live.",
    sources: [snapshot.usAqi.source, ...(sparsity.nearestMonitor ? [sparsity.nearestMonitor.source] : [])],
    generatedAt: new Date().toISOString(),
  };
}

/** Plain-text rendering for the low-bandwidth/SMS path. */
export function cardToPlainText(card: ClinicCard): string {
  const lines = [
    card.headline,
    "",
    ...card.meaning,
    "",
    card.language === "es" ? "Qué hacer:" : "What to do:",
    ...card.actions.map((a) => `- ${a}`),
    "",
    card.language === "es" ? "Para su próxima cita:" : "For your next appointment:",
    ...card.doctorPrompts.map((p) => `- ${p}`),
    "",
    `${card.language === "es" ? "Datos" : "Data"}: AQI ${card.numbers.usAqi ?? "n/a"} (${card.numbers.dataStatus}), ${card.numbers.sparsityClass} coverage, ${card.generatedAt.slice(0, 16)}Z`,
    card.language === "es"
      ? "Informativo, no es consejo médico."
      : "Informational, not medical advice.",
  ];
  return lines.join("\n");
}
