/** Vercel AI Gateway calls (auth: Vercel OIDC on deployments, AI_GATEWAY_API_KEY if set). Nothing secret is logged. */
import { generateText, Output, transcribe } from "ai";
import { z } from "zod";
import { CATEGORIES, normalizeStructured, type Structured } from "./recap-rules";

export const TRANSCRIBE_MODEL = process.env.RECAP_TRANSCRIBE_MODEL || "openai/gpt-4o-transcribe";
export const TRANSCRIBE_FALLBACK = process.env.RECAP_TRANSCRIBE_FALLBACK || "openai/whisper-1";
export const LLM_MODEL = process.env.RECAP_LLM_MODEL || "google/gemini-3-flash";
export const LLM_FALLBACKS = (process.env.RECAP_LLM_FALLBACKS || "openai/gpt-5-mini").split(",").map(s => s.trim()).filter(Boolean);

/** Gateway refused for account reasons (no card / no credits / auth): keep the audio and let the user retry or type. */
export class AiUnavailable extends Error {}
/** Product request only. Do not add a player credit gate. Renaming stays pending until the rule is clarified. This is not the gateway HTTP 402. */
export const CREDIT_WORDING_PENDING = "Pendiente de aclarar la regla o el producto antes de renombrar. No es un gate de créditos y no es el HTTP 402 del gateway.";
/** Server-side AI is off by default: recaps are transcribed + structured on the iPhone (Apple Speech + Foundation Models).
 *  Set RECAP_SERVER_AI=on (and enable AI Gateway billing) to turn the server path back on. */
export const serverAiEnabled = () => process.env.RECAP_SERVER_AI === "on";
const gate = () => { if (!serverAiEnabled()) throw new AiUnavailable("server AI disabled (RECAP_SERVER_AI != on)"); };
function classify(e: unknown): never {
  const msg = e instanceof Error ? e.message : String(e);
  const any = e as any; const status = any?.statusCode ?? any?.status ?? any?.cause?.statusCode;
  if (/customer_verification_required|credit card|insufficient|credits|budget|unauthori[sz]ed|authentication|OIDC|api key/i.test(msg) || status === 401 || status === 402 || status === 403)
    throw new AiUnavailable(msg.slice(0, 200));
  throw e;
}

const GOLF_PROMPT = "Resumen de una vuelta de golf en español rioplatense (Argentina). Vocabulario: birdie, par, bogey, doble bogey, driver, madera 3, híbrido, hierro 7, pitching, sand wedge, lob, putter, putt, tres putts, approach, chip, pitch, bunker, green, fairway, rough, OB, fuera de límites, hoyo, salida, golpe, palo, tee, Jockey, Colorada, Azul.";

export async function transcribeAudio(audio: Uint8Array, mime: string): Promise<{ text: string; duration: number | null; model: string }> {
  gate();
  for (const model of [TRANSCRIBE_MODEL, TRANSCRIBE_FALLBACK]) {
    try {
      const r = await transcribe({ model, audio, maxRetries: 1,
        providerOptions: { openai: { language: "es", prompt: GOLF_PROMPT } } });
      return { text: (r.text || "").trim(), duration: r.durationInSeconds ?? null, model };
    } catch (e) {
      try { classify(e); } catch (x) { if (x instanceof AiUnavailable) throw x; if (model === TRANSCRIBE_FALLBACK) throw x; }
    }
  }
  throw new Error("transcription failed");
}

const schema = z.object({
  summary: z.string().describe("2 o 3 oraciones, en segunda persona (vos), tono de caddie: cómo fue la vuelta."),
  mistakes: z.array(z.object({
    category: z.enum(CATEGORIES).describe("salida=drive/tee shot; approach=tiro al green; juego_corto=chip/pitch alrededor del green; bunker; putt; estrategia=decisiones/mental; otro"),
    hole: z.number().int().min(1).max(18).nullable().describe("número de hoyo si se menciona, si no null"),
    text: z.string().describe("el error en una frase corta, en segunda persona"),
  })),
  positives: z.array(z.object({ hole: z.number().int().min(1).max(18).nullable(), text: z.string() })),
});

export async function structureRecap(transcript: string, context?: string): Promise<{ data: Structured; model: string }> {
  gate();
  try {
    const r = await generateText({
      model: LLM_MODEL,
      output: Output.object({ schema }),
      providerOptions: { gateway: { models: LLM_FALLBACKS } },
      maxRetries: 1,
      system: "Sos el caddie analista de Golflet. Recibís lo que un golfista contó en un audio al terminar su vuelta (transcripción automática, puede tener errores) y lo ordenás. Escribí en español rioplatense (vos), claro, sin inventar nada que no haya dicho. Un error por cada falla concreta que mencione; si menciona el mismo error en varios hoyos, uno por hoyo. Si no menciona hoyo, hole = null. Los aciertos van en positives.",
      prompt: `${context ? `Datos de la tarjeta (referencia, no inventes errores a partir de esto):\n${context}\n\n` : ""}Transcripción:\n"""${transcript.slice(0, 12_000)}"""`,
    });
    return { data: normalizeStructured(r.output), model: (r.response as any)?.modelId || LLM_MODEL };
  } catch (e) { classify(e); }
}
