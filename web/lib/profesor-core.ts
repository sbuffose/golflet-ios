/** Profesor profile validation (pure). */
import { HttpError } from "./http-error";
import { cleanText } from "./club-requests-core";
export const DAYS = ["lun", "mar", "mie", "jue", "vie", "sab", "dom"] as const;
export const SLOTS = ["m", "t", "n"] as const;              // mañana, tarde, noche
export const FORMATS = ["individual", "grupal", "en_cancha", "driving", "online"] as const;
export const FORMAT_LABEL: Record<string, string> = { individual: "Individual", grupal: "Grupal", en_cancha: "En la cancha", driving: "Driving range", online: "Online (videos)" };
export const LEVELS = [[-10, 0], [0, 9], [9, 18], [18, 28], [28, 54]] as const;   // hcp bands a profesor can teach
export const LEVEL_LABEL = (l: readonly number[]) => (l[0] < 0 ? "Hándicap 0 o menos" : l[1] >= 54 ? `Hándicap ${l[0]}+` : `Hándicap ${l[0]} a ${l[1]}`);

export function cleanAvailability(a: any) {
  const out: Record<string, string[]> = {};
  if (a && typeof a === "object") for (const d of DAYS) { const v = Array.isArray(a[d]) ? a[d] : []; const s = SLOTS.filter(x => v.includes(x)); if (s.length) out[d] = s; }
  return out;
}
export function cleanProfile(b: any, cur: any = {}) {
  const has = (k: string) => b && Object.prototype.hasOwnProperty.call(b, k);
  const o: any = {};
  if (has("display_name")) { const n = cleanText(b.display_name, 80); if (n.length < 2) throw new HttpError(400, "Escribí tu nombre."); o.display_name = n; }
  if (has("bio")) o.bio = cleanText(b.bio, 1500, true) || null;
  if (has("method")) o.method = cleanText(b.method, 1500, true) || null;
  if (has("locations")) {
    if (!Array.isArray(b.locations)) throw new HttpError(400, "locations tiene que ser una lista");
    const l = [...new Set(b.locations.map((x: any) => cleanText(x, 60)).filter((x: string) => x.length >= 2))].slice(0, 8);
    o.locations = l;
  }
  if (has("availability")) o.availability = cleanAvailability(b.availability);
  if (has("levels")) {
    if (!Array.isArray(b.levels)) throw new HttpError(400, "levels tiene que ser una lista");
    o.levels = LEVELS.filter(L => b.levels.some((x: any) => Array.isArray(x) && x[0] === L[0] && x[1] === L[1])).map(L => [...L]);
  }
  for (const k of ["price_min", "price_max"]) if (has(k)) {
    const v = b[k] === null || b[k] === "" ? null : Math.round(Number(String(b[k]).replace(/\./g, "")));
    if (v != null && (!Number.isFinite(v) || v < 0 || v > 5_000_000)) throw new HttpError(400, "Revisá el precio por clase (en pesos).");
    o[k] = v;
  }
  const pmin = o.price_min !== undefined ? o.price_min : cur.price_min, pmax = o.price_max !== undefined ? o.price_max : cur.price_max;
  if (pmin != null && pmax != null && pmin > pmax) throw new HttpError(400, "El precio mínimo no puede ser mayor que el máximo.");
  if (has("formats")) { if (!Array.isArray(b.formats)) throw new HttpError(400, "formats tiene que ser una lista"); o.formats = FORMATS.filter(f => b.formats.includes(f)); }
  if (has("phone")) o.phone = cleanText(b.phone, 30) || null;
  return o;
}

/* ---------- t111u: "Encontrar un profesor" (pure) ---------- */
export const PLAY_FREQ: Record<string, string> = { lt1m: "Menos de 1 por mes", "1_2m": "1 o 2 por mes", semanal: "Semanal", "2sem": "2 o más por semana" };
export const CLASS_FREQ: Record<string, string> = { suelta: "Clase suelta", semanal: "Semanal", quincenal: "Quincenal", mensual: "Mensual" };
/** ARS per class. */
export const BUDGETS: Record<string, { label: string; min: number; max: number | null }> = {
  b1: { label: "Hasta $20.000", min: 0, max: 20000 }, b2: { label: "$20.000 a $35.000", min: 20000, max: 35000 },
  b3: { label: "$35.000 a $50.000", min: 35000, max: 50000 }, b4: { label: "Más de $50.000", min: 50000, max: null },
};
const DAY_LABEL: Record<string, string> = { lun: "lunes", mar: "martes", mie: "miércoles", jue: "jueves", vie: "viernes", sab: "sábados", dom: "domingos" };
const SLOT_LABEL: Record<string, string> = { m: "a la mañana", t: "a la tarde", n: "a la noche" };
const keyLoc = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();

export function cleanAnswers(b: any, cur: any = {}, allowedLocs: string[] = []) {
  const o: any = { availability: cur.availability || {}, hcp: cur.hcp ?? null, play_freq: cur.play_freq ?? null, locations: cur.locations || [], budget: cur.budget ?? null, class_freq: cur.class_freq ?? null };
  if (b && "availability" in b) o.availability = cleanAvailability(b.availability);
  if (b && "hcp" in b) { const n = b.hcp === null || b.hcp === "" ? null : Number(String(b.hcp).replace(",", ".")); if (n !== null && (!Number.isFinite(n) || n < -10 || n > 54)) throw new Error("El hándicap va de -10 a 54"); o.hcp = n === null ? null : Math.round(n * 10) / 10; }
  if (b && "play_freq" in b) { if (b.play_freq !== null && !(b.play_freq in PLAY_FREQ)) throw new Error("Frecuencia de juego inválida"); o.play_freq = b.play_freq; }
  if (b && "budget" in b) { if (b.budget !== null && !(b.budget in BUDGETS)) throw new Error("Presupuesto inválido"); o.budget = b.budget; }
  if (b && "class_freq" in b) { if (b.class_freq !== null && !(b.class_freq in CLASS_FREQ)) throw new Error("Frecuencia de clases inválida"); o.class_freq = b.class_freq; }
  if (b && "locations" in b) { const ok = new Map(allowedLocs.map(l => [keyLoc(l), l])); o.locations = [...new Set((Array.isArray(b.locations) ? b.locations : []).map((x: any) => ok.get(keyLoc(String(x)))).filter(Boolean))].slice(0, 12); }
  return o;
}

/** Score 0-100 + "por qué" reasons. Location is required when the player chose places (no overlap → null = excluded). */
export function scoreMatch(a: any, p: any): { score: number; reasons: string[] } | null {
  const reasons: string[] = []; let score = 0;
  // availability (40)
  const want: [string, string][] = Object.entries(a.availability || {}).flatMap(([d, ss]: any) => (ss as string[]).map(s => [d, s] as [string, string]));
  if (want.length) {
    const hits = want.filter(([d, s]) => (p.availability?.[d] || []).includes(s));
    if (hits.length) { score += 40 * hits.length / want.length; const [d, s] = hits[0]; reasons.push(`Da clases ${DAY_LABEL[d]} ${SLOT_LABEL[s]}${hits.length > 1 ? ` y ${hits.length - 1} horario${hits.length > 2 ? "s" : ""} más que te sirve${hits.length > 2 ? "n" : ""}` : ""}`); }
  } else score += 20;
  // location (30, required if chosen)
  if ((a.locations || []).length) {
    const mine = new Set((a.locations as string[]).map(keyLoc)); const hit = (p.locations || []).find((l: string) => mine.has(keyLoc(l)));
    if (!hit) return null; score += 30; reasons.push(`Da clases en ${hit}`);
  } else score += 15;
  // level (20)
  if (a.hcp != null && (p.levels || []).length) {
    if ((p.levels as number[][]).some(([lo, hi]) => a.hcp >= lo && a.hcp <= hi)) { score += 20; reasons.push(`Enseña a jugadores de tu nivel (hándicap ${String(a.hcp).replace(".", ",")})`); }
  } else score += 10;
  // budget (10)
  const bd = a.budget ? BUDGETS[a.budget] : null;
  if (bd && (p.price_min != null || p.price_max != null)) {
    const lo = p.price_min ?? p.price_max, hi = p.price_max ?? p.price_min;
    if (lo <= (bd.max ?? Infinity) && hi >= bd.min) { score += 10; reasons.push("Su precio entra en tu presupuesto"); }
  } else score += 5;
  return { score: Math.round(score), reasons };
}
