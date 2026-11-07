/** Pure helpers for post-round recaps: categories, audio sniffing, rule-based fallback tagger, recurring-mistake aggregate. */
export const CATEGORIES = ["salida", "approach", "juego_corto", "bunker", "putt", "estrategia", "otro"] as const;
export type Category = (typeof CATEGORIES)[number];
export const CATEGORY_LABEL: Record<Category, string> = {
  salida: "Salida", approach: "Approach", juego_corto: "Juego corto", bunker: "Bunker", putt: "Putt", estrategia: "Estrategia / mental", otro: "Otro",
};
export type Mistake = { category: Category; hole: number | null; text: string };
export type Positive = { hole: number | null; text: string };
export type Structured = { summary: string; mistakes: Mistake[]; positives: Positive[] };

export const MAX_AUDIO_BYTES = 4 * 1024 * 1024;      // Vercel request bodies cap at 4.5 MB
export const MIN_AUDIO_BYTES = 1024;

/** Detect the container from the first bytes; the claimed Content-Type is not trusted. */
export function sniffAudio(b: Uint8Array): { mime: string; ext: string } | { error: string } {
  const s = (o: number, n: number) => String.fromCharCode(...b.slice(o, o + n));
  if (b.length >= 12 && s(4, 4) === "ftyp") return { mime: "audio/mp4", ext: "m4a" };
  if (s(0, 4) === "OggS") return { mime: "audio/ogg", ext: "ogg" };
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return { mime: "audio/webm", ext: "webm" };
  if (s(0, 4) === "RIFF" && s(8, 4) === "WAVE") return { mime: "audio/wav", ext: "wav" };
  if (s(0, 3) === "ID3" || (b[0] === 0xff && (b[1] & 0xe6) === 0xe2)) return { mime: "audio/mpeg", ext: "mp3" };
  if (b[0] === 0xff && (b[1] & 0xf6) === 0xf0) return { error: "AAC sin contenedor (ADTS) no es compatible: grabá en .m4a (MPEG-4 AAC)." };
  return { error: "Formato de audio no reconocido. Usá m4a, webm, ogg, mp3 o wav." };
}

const clamp = (s: unknown, n: number) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const holeNum = (v: unknown) => { const n = Number(v); return Number.isInteger(n) && n >= 1 && n <= 18 ? n : null; };
/** Validate/normalize anything (LLM output or a user edit) into the stored shape. */
export function normalizeStructured(x: any): Structured {
  const cat = (c: unknown): Category => (CATEGORIES as readonly string[]).includes(String(c)) ? (c as Category) : "otro";
  return {
    summary: clamp(x?.summary, 600),
    mistakes: (Array.isArray(x?.mistakes) ? x.mistakes : []).slice(0, 30).map((m: any) => (typeof m === "string" ? { category: "otro" as Category, hole: null, text: clamp(m, 300) } : { category: cat(m?.category), hole: holeNum(m?.hole), text: clamp(m?.text, 300) })).filter((m: Mistake) => m.text),
    positives: (Array.isArray(x?.positives) ? x.positives : []).slice(0, 20).map((p: any) => (typeof p === "string" ? { hole: null, text: clamp(p, 300) } : { hole: holeNum(p?.hole), text: clamp(p?.text, 300) })).filter((p: Positive) => p.text),
  };
}

const NUM: Record<string, number> = { uno: 1, primero: 1, primer: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17, dieciocho: 18 };
const fold = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
export function findHole(sentence: string): number | null {
  const t = fold(sentence), words = Object.keys(NUM).join("|");
  const val = (x: string) => (/^\d+$/.test(x) ? +x : NUM[x]);
  const m = new RegExp(`\\bhoyo\\s+(?:(?:numero|nro\\.?|n)\\s+)?(\\d{1,2}|${words})\\b`).exec(t)
    || /\b(?:en el|del) (\d{1,2})\b(?!\s*(?:metros|yardas|yardas|golpes|putts?|%|m\b))/.exec(t);
  const v = m ? val(m[1]) : null;
  return v && v >= 1 && v <= 18 ? v : null;
}
/** Every hole mentioned in a sentence ("en el hoyo 3 y en el 12" -> [3, 12]). */
export function findHoles(sentence: string): number[] {
  const first = findHole(sentence); if (!first) return [];
  const t = fold(sentence), out = new Set<number>([first]);
  for (const m of t.matchAll(/\b(?:hoyos?|en el|del|y (?:en )?el|y)\s+(\d{1,2})\b(?!\s*(?:metros|yardas|golpes|putts?|%|m\b))/g)) { const v = +m[1]; if (v >= 1 && v <= 18) out.add(v); }
  return [...out];
}
const KW: [Category, RegExp][] = [
  ["putt", /\b(putt?s?|putter|putee|emboc|green lento|green rapido|lectura|tres putts|3 putts)/],
  ["bunker", /\b(bunker|bunquer|arena|trampa)/],
  ["juego_corto", /\b(chip|pitch|flop|lob|alrededor del green|juego corto|wedge|sw\b|sand)/],
  ["salida", /\b(drive|driver|salida|tee\b|desde el tee|madera|fairway|slice|gancho|hook|ob\b|fuera de limites|out of bounds)/],
  ["approach", /\b(approach|aproach|hierro|hibrido|segundo tiro|tercer tiro|al green|green en regulacion|gir|corto al green|largo al green)/],
  ["estrategia", /\b(cabeza|mental|concentr|apur|decision|estrategia|nervio|ansie|enoj|calent|confian|paciencia)/],
];
const NEG = /\b(mal|error|erre|falle|perdi|pifi|tope|toppe|gordo|fat|slice|gancho|hook|shank|socket|ob\b|fuera de limites|agua|doble|triple|bogey|corto|largo|no emboque|tres putts|3 putts|me fui|me apure|desastre|horrible|regale)/;
const POS = /\b(bien|buen|birdie|aguila|eagle|emboque|salve|excelente|genial|solido|clave|par\b|recupere|mejor)/;

/** Rule-based fallback (no AI): one item per sentence, category by keywords, hole from "hoyo N". */
export function tagByRules(transcript: string): Structured {
  // split on sentences, on "pero/aunque/después/luego", and where a new hole starts ("…OB y en el 12 hice tres putts")
  const sentences = transcript.replace(/\s+/g, " ").split(/(?<=[.!?;])\s+|\s+(?:pero|aunque|despues|después|luego)\s+|,?\s+y\s+(?=en el (?:hoyo )?\d)|,\s*(?=en el (?:hoyo )?\d)/i).map(s => s.trim()).filter(s => s.length > 3);
  const mistakes: Mistake[] = [], positives: Positive[] = [];
  let carry: number[] = [], last: { kind: "neg" | "pos"; items: (Mistake | Positive)[] } | null = null;
  const bare = (t: string) => !NEG.test(t) && !POS.test(t);
  sentences.forEach((s, i) => {
    const t = fold(s), own = findHoles(s), holes = [...new Set([...carry, ...own])], hole = holes[0] ?? null;
    const neg = NEG.test(t), pos = POS.test(t);
    if (neg) { const category = KW.find(([, re]) => re.test(t))?.[0] ?? "otro"; const items = (holes.length ? holes : [null]).map(h => ({ category, hole: h, text: clamp(s, 300) })); mistakes.push(...items); last = { kind: "neg", items }; carry = []; }
    else if (pos) { const p = { hole, text: clamp(s, 300) }; positives.push(p); last = { kind: "pos", items: [p] }; carry = []; }
    else if (own.length && t.split(" ").length <= 4) {
      // bare hole clause: "…en el hoyo 3 y en el 12." -> same thing in hole 12; "en el 3 y en el 12 hice tres putts" -> carries forward
      const next = sentences[i + 1] ? fold(sentences[i + 1]) : null;
      if (next && !bare(next)) carry = holes;
      else if (last?.kind === "neg") { const base = last.items[0] as Mistake; for (const h of own) if (!mistakes.some(m => m.hole === h && m.text === base.text)) mistakes.push({ ...base, hole: h }); carry = []; }
      else carry = [];
    } else carry = [];
  });
  const first = sentences.slice(0, 2).join(" ");
  return { summary: clamp(first, 280), mistakes, positives };
}

export type RecapRow = { round_key: string; date: string; mistakes: Mistake[] };
/** Recurring mistakes across the last N recapped rounds: "putt mencionado en 6 de 10". */
export function recurring(rows: RecapRow[], lastN = 10) {
  const recent = rows.slice().sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, lastN);
  const of = recent.length;
  const by = new Map<Category, { rounds: Set<string>; mentions: number; holes: Map<number, number>; examples: { date: string; hole: number | null; text: string }[] }>();
  for (const r of recent) for (const m of r.mistakes || []) {
    const e = by.get(m.category) || { rounds: new Set<string>(), mentions: 0, holes: new Map<number, number>(), examples: [] as { date: string; hole: number | null; text: string }[] };
    e.rounds.add(r.round_key); e.mentions++; if (m.hole) e.holes.set(m.hole, (e.holes.get(m.hole) || 0) + 1);
    if (e.examples.length < 3) e.examples.push({ date: r.date, hole: m.hole, text: m.text });
    by.set(m.category, e);
  }
  const items = [...by.entries()].map(([category, e]) => ({
    category, label: CATEGORY_LABEL[category], rounds: e.rounds.size, of, share: of ? Math.round((e.rounds.size / of) * 100) / 100 : 0, mentions: e.mentions,
    holes: [...e.holes.entries()].sort((a, b) => b[1] - a[1]).map(([hole, n]) => ({ hole, mentions: n })),
    text: `${CATEGORY_LABEL[category]}: en ${e.rounds.size} de ${of} rondas`, examples: e.examples,
  })).sort((a, b) => b.rounds - a.rounds || b.mentions - a.mentions);
  return { rounds_considered: of, last_n: lastN, items };
}

/** Recap sources. ios_on_device = transcribed + structured on the iPhone; web_mic = computer microphone, transcribed by the browser
 * (Web Speech API) and structured in the browser with tagByRules. The server stores both as-is. */
export const CLIENT_SOURCES = ["ios_on_device", "web_mic", "manual"] as const;
export const DEVICE_SOURCES = ["ios_on_device", "web_mic"] as const;
/** Fields an app sends when it already structured the recap. Returns null when only free text came in (-> keyword tagger). */
export function clientStructured(b: any): { data: Structured; source: string; model: string | null; duration: number | null } | null {
  const has = b && (b.summary != null || Array.isArray(b.mistakes) || Array.isArray(b.positives) || (DEVICE_SOURCES as readonly string[]).includes(String(b.source)));
  if (!has) return null;
  const source = (CLIENT_SOURCES as readonly string[]).includes(String(b.source)) ? String(b.source) : "manual";
  const model = b.model ? String(b.model).replace(/[^\w .:+\/-]/g, "").slice(0, 80) || null : (source === "ios_on_device" ? "apple-on-device" : source === "web_mic" ? "web-speech-api" : null);
  const d = Number(b.duration_s);
  return { data: normalizeStructured(b), source, model, duration: Number.isFinite(d) && d > 0 && d < 3600 ? Math.round(d) : null };
}
