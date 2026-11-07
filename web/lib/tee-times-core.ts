/** Pure validation/formatting for tee times (no DB). Times are local to Argentina (UTC-3, no DST). */
import { HttpError } from "./http-error";

export const MAX_COMPANIONS = 7, MAX_UPCOMING = 100;
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/, TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
/** "now" in Argentina as YYYY-MM-DD + HH:MM. */
export function nowAR(now = new Date()) {
  const t = new Date(now.getTime() - 3 * 3600_000).toISOString();
  return { date: t.slice(0, 10), time: t.slice(11, 16) };
}
export const isFuture = (date: string, time: string, now = new Date()) => { const n = nowAR(now); return date > n.date || (date === n.date && time >= n.time); };

export type TeeInput = { date: string; time: string; club_key: string; course_id: number | null; companions: string[]; tee: string | null };
export function parseTeeInput(b: any, prev?: TeeInput | null, now = new Date()): TeeInput {
  if (!b || typeof b !== "object") throw new HttpError(400, "Cuerpo inválido");
  const date = b.date ?? prev?.date, time = b.time ?? prev?.time, club_key = b.club_key ?? prev?.club_key;
  if (typeof date !== "string" || !DATE_RE.test(date) || isNaN(Date.parse(date + "T00:00:00Z")) || new Date(date + "T00:00:00Z").toISOString().slice(0, 10) !== date) throw new HttpError(400, "Fecha inválida (AAAA-MM-DD)");
  if (typeof time !== "string" || !TIME_RE.test(time)) throw new HttpError(400, "Hora inválida (HH:MM)");
  if (typeof club_key !== "string" || !/^[a-z0-9-]{2,60}$/.test(club_key)) throw new HttpError(400, "Elegí una cancha");
  const changedWhen = !prev || date !== prev.date || time !== prev.time;
  if (changedWhen && !isFuture(date, time, now)) throw new HttpError(400, "Esa fecha y hora ya pasaron");
  const max = new Date(now.getTime() + 400 * 86400_000).toISOString().slice(0, 10); if (date > max) throw new HttpError(400, "Como máximo un año para adelante");
  const cid = "course_id" in b ? b.course_id : prev?.course_id ?? null;
  if (cid != null && !(Number.isInteger(cid) && cid > 0)) throw new HttpError(400, "Recorrido inválido");
  const rawC = "companions" in b ? b.companions : prev?.companions ?? [];
  if (!Array.isArray(rawC)) throw new HttpError(400, "companions debe ser una lista de nombres");
  const seen = new Set<string>(), companions: string[] = [];
  for (const c of rawC) { const s = String(c ?? "").replace(/[\u0000-\u001f<>]/g, "").replace(/\s+/g, " ").trim().slice(0, 60); if (!s || seen.has(s.toLowerCase())) continue; seen.add(s.toLowerCase()); companions.push(s); }
  if (companions.length > MAX_COMPANIONS) throw new HttpError(400, `Hasta ${MAX_COMPANIONS} acompañantes`);
  const rawT = "tee" in b ? b.tee : prev?.tee ?? null;
  const tee = rawT == null || String(rawT).trim() === "" ? null : String(rawT).replace(/[\u0000-\u001f<>]/g, "").replace(/\s+/g, " ").trim().slice(0, 30);
  return { date, time, club_key, course_id: cid ?? null, companions, tee };
}

/** WHS: course handicap = HI × slope/113 + (course rating − par); playing handicap = round(CH × 0.95) (individual stroke play).
 * Never invents slope or rating: missing pieces → estimated (slope only) or null. Strokes per hole from the stroke index (hole hcp). */
export type TeeData = { slope?: number | null; course_rating?: number | null; gender?: string | null };
export function teeHandicaps(hi: number | null, par: number | null, tees: Record<string, TeeData>, holes: { hole: number; hcp?: number | null }[] = [], selected?: string | null) {
  const ALLOW = 0.95;
  return Object.entries(tees || {}).map(([tee, t]) => {
    const slope = Number.isFinite(t?.slope as number) ? Number(t.slope) : null, cr = Number.isFinite(t?.course_rating as number) ? Number(t.course_rating) : null;
    const missing = [...(hi == null ? ["hi"] : []), ...(slope == null ? ["slope"] : []), ...(cr == null ? ["course_rating"] : []), ...(par == null ? ["par"] : [])];
    let ch: number | null = null;
    if (hi != null && slope != null) ch = hi * slope / 113 + (cr != null && par != null ? cr - par : 0);
    const course_handicap = ch == null ? null : Math.round(ch), playing_handicap = ch == null ? null : Math.round(ch * ALLOW);
    const idx = holes.filter(h => Number.isInteger(h.hcp) && h.hcp! >= 1 && h.hcp! <= 18);
    const strokes_by_hole = playing_handicap != null && idx.length === 18 ? idx.slice().sort((a, b) => a.hole - b.hole).map(h => {
      const ph = playing_handicap; if (ph < 0) return { hole: h.hole, strokes: h.hcp! > 18 + ph ? -1 : 0 };    // plus handicap gives strokes back on the easiest holes
      return { hole: h.hole, strokes: Math.floor(ph / 18) + (h.hcp! <= ph % 18 ? 1 : 0) }; }) : null;
    return { tee, gender: t?.gender ?? null, slope, course_rating: cr, par, course_handicap, playing_handicap, allowance: ALLOW,
      estimated: ch != null && missing.length > 0, missing, strokes_by_hole, selected: !!selected && selected.toLowerCase() === tee.toLowerCase() };
  }).sort((a, b) => (b.course_rating ?? 0) - (a.course_rating ?? 0));
}
