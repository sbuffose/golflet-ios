/** t260u/t261u «Armar partido»: the player's own friendly matches + history. Private per account; read-only toward the club (nothing is sent anywhere). */
import { q } from "./db";
import { HttpError } from "./http-error";
import { evaluate, aggregate, myOutcome, DEFAULT_ALLOWANCE, HOLES, normName, type MatchDef, type Scores, type StoredMatch } from "./match-core";
import { getTeeTime, courseTeeData, playerHI, officialTees } from "./tee-times";
import type { TeeInfo } from "./match-core";
import { buildData } from "./data";

const D = /^\d{4}-\d{2}-\d{2}$/, ID = /^[0-9a-f-]{36}$/i, PID = /^(me|[cnm]:[\p{L}\p{N} .'-]{1,60})$/u;
const bad = (m = "Datos inválidos") => { throw new HttpError(400, m); };
const clean = (s: unknown, n = 60) => String(s ?? "").replace(/[\u0000-\u001f<>]/g, "").replace(/\s+/g, " ").trim().slice(0, n);

/** Validates and normalises a match definition (players 2–8; fourball = 4 in two pairs; mano a mano = 2). */
export function cleanDef(b: any): MatchDef {
  const modality = b?.modality; if (!["fourball", "single", "metralleta"].includes(modality)) bad("Modalidad inválida");
  const scoring = b?.scoring === "gross" ? "gross" : b?.scoring === "hcp" ? "hcp" : bad("Elegí hándicap o gross");
  const allowance = b?.allowance == null ? DEFAULT_ALLOWANCE[modality as keyof typeof DEFAULT_ALLOWANCE] : Number(b.allowance);
  if (!Number.isFinite(allowance) || allowance < 0 || allowance > 100) bad("El porcentaje va de 0 a 100");
  const raw = Array.isArray(b?.players) ? b.players : bad("Faltan jugadores"); const seen = new Set<string>();
  const players = raw.map((p: any) => { const id = clean(p?.id, 64), name = clean(p?.name); if (!PID.test(id) || !name || seen.has(id)) bad("Jugador inválido"); seen.add(id);
    const hcp = p?.hcp == null || p.hcp === "" ? null : Number(p.hcp); if (hcp != null && (!Number.isFinite(hcp) || hcp < -10 || hcp > 54)) bad(`HCP inválido para ${name}`);
    const tee = clean(p?.tee, 30) || null, gender = p?.gender === "D" ? "D" : p?.gender === "C" ? "C" : null;
    return { id, name, hcp: hcp == null ? null : Math.round(hcp * 10) / 10, ...(p?.manual ? { manual: true } : {}), ...(tee ? { tee } : {}), ...(gender ? { gender } : {}) }; });
  const n = players.length;
  if (modality === "fourball" && n !== 4) bad("El fourball es de 4 jugadores"); if (modality === "single" && n !== 2) bad("El mano a mano es de 2 jugadores");
  if (modality === "metralleta" && (n < 3 || n > 8)) bad("La metralleta es de 3 a 8 jugadores");
  if (scoring === "hcp" && players.some((p: any) => p.hcp == null)) bad("Con hándicap, todos necesitan su HCP");
  let sides: string[][] | undefined;
  if (modality === "fourball") { sides = Array.isArray(b?.sides) ? b.sides.map((s: any) => (Array.isArray(s) ? s.map((x: any) => clean(x, 64)) : [])) : [];
    const flat = sides!.flat(); if (sides!.length !== 2 || sides!.some(s => s.length !== 2) || new Set(flat).size !== 4 || flat.some(x => !seen.has(x))) bad("Armá las dos parejas"); }
  const si = Array.from({ length: HOLES }, (_, i) => { const v = Number(b?.si?.[i]); return Number.isInteger(v) && v >= 1 && v <= 18 ? v : null; });
  const start_hole = [1, 10].includes(Number(b?.start_hole)) ? Number(b.start_hole) : 1;
  const tees = cleanTees(b?.tees), pars = Array.isArray(b?.pars) ? Array.from({ length: HOLES }, (_, i) => { const v = Number(b.pars[i]); return Number.isInteger(v) && v >= 3 && v <= 6 ? v : null; }) : undefined;
  return { modality, scoring, allowance: Math.round(allowance * 10) / 10, players, ...(sides ? { sides } : {}), si, start_hole, ...(tees.length ? { tees } : {}), ...(pars ? { pars } : {}) } as MatchDef;
}
const num = (v: unknown, lo: number, hi: number) => { const n = Number(v); return v != null && v !== "" && Number.isFinite(n) && n >= lo && n <= hi ? n : null; };
function cleanTees(a: any): TeeInfo[] {
  if (!Array.isArray(a)) return []; const seen = new Set<string>();
  return a.slice(0, 16).map((t: any) => ({ tee: clean(t?.tee, 30), gender: t?.gender === "D" ? "D" : "C", slope: num(t?.slope, 55, 155), course_rating: num(t?.course_rating, 25, 85), par: num(t?.par, 27, 80) }))
    .filter(t => t.tee && !seen.has(`${t.tee.toLowerCase()}|${t.gender}`) && (seen.add(`${t.tee.toLowerCase()}|${t.gender}`), true));
}
/** t265u: the course's tees (slope, rating, par) from the club's cards + the club calculator's rows (with gender), never invented. */
async function teeCatalog(t: any, td: any): Promise<TeeInfo[]> {
  const out: TeeInfo[] = [], key = (x: TeeInfo) => `${x.tee.toLowerCase()}|${x.gender || "C"}`;
  for (const [tee, v] of Object.entries<any>(td?.tees || {})) out.push({ tee, gender: v?.gender === "D" ? "D" : "C", slope: num(v?.slope, 55, 155), course_rating: num(v?.course_rating, 25, 85), par: num(td?.par, 27, 80) });
  const off: any[] = await officialTees(t.club_account_id ?? null, t.course_label ?? null).catch(() => null) || [];
  for (const o of off) { const x: TeeInfo = { tee: String(o.tee), gender: o.gender === "D" || o.gender === "Damas" ? "D" : "C", slope: num(o.slope, 55, 155), course_rating: num(o.course_rating, 25, 85), par: num(o.par ?? td?.par, 27, 80) };
    const i = out.findIndex(y => key(y) === key(x)); if (i < 0) out.push(x); else out[i] = { ...out[i], slope: out[i].slope ?? x.slope, course_rating: out[i].course_rating ?? x.course_rating, par: out[i].par ?? x.par }; }
  return cleanTees(out);
}
/** The tee the player plays most at this course (their OWN club cards, last 20). Read-only. */
async function usualTee(userId: string, courseKey: string | null): Promise<string | null> {
  if (!courseKey) return null; const k = courseKey.indexOf(":"), clubId = courseKey.slice(0, k), course = courseKey.slice(k + 1);
  const rows = await q<any>(`select r.data->>'tee' tee from round r join club_account a on a.id = r.club_account_id where a.user_id = $1 and a.club_id::text = $2 and lower(r.course) = lower($3) and coalesce(r.data->>'tee','') <> '' order by r.date desc limit 20`, [userId, clubId, course]).catch(() => []);
  const n = new Map<string, number>(); for (const r of rows) { const v = String(r.tee).trim(); n.set(v, (n.get(v) || 0) + 1); }
  return [...n.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}
export function cleanScores(s: any, def: MatchDef): Scores {
  const out: Scores = {};
  for (const p of def.players) { const a = Array.isArray(s?.[p.id]) ? s[p.id] : []; out[p.id] = Array.from({ length: HOLES }, (_, i) => { const v = a[i]; if (v == null || v === "") return null; const n = Number(v); if (!Number.isInteger(n) || n < 0 || n > 20) bad("Score inválido"); return n; }); }
  // t262u/t269u marks: «hoyo dado» (conc) + closed holes (done). The old per-player «dada» flag (t262u) is dropped: a conceded putt is just part of the number.
  const m = s?._m && typeof s._m === "object" ? s._m : {};
  const cin = Array.isArray(m.conc) && def.modality !== "metralleta" ? m.conc : [], conc = Array.from({ length: HOLES }, (_, i) => (cin[i] === 0 || cin[i] === 1 ? cin[i] : null) as 0 | 1 | null);
  const done = Array.from({ length: HOLES }, (_, i) => Array.isArray(m.done) && m.done[i] === true);   // t266u: holes closed with partial scores
  if (conc.some(x => x != null) || done.some(Boolean)) (out as any)._m = { conc, done };
  return out;
}
const row = (r: any) => ({ id: r.id, date: r.date, course_label: r.course_label, tee_time_id: r.tee_time_id, status: r.status, def: r.def, scores: r.scores, result: r.result, finished_at: r.finished_at, updated_at: r.updated_at });
const COLS = `id, to_char(date, 'YYYY-MM-DD') date, course_label, tee_time_id, status, def, scores, result, finished_at, updated_at`;

/** Setup for «Armar partido» from a booking: me + the partners on the line (HCP shown = index), the course stroke index. */
export async function matchSetup(userId: string, teeId: string) {
  const t: any = await getTeeTime(userId, teeId);
  const [td, hi, D0] = await Promise.all([t.club_key ? courseTeeData(t.club_key, t.course_id).catch(() => null) : null, playerHI(userId).catch(() => null), buildData(userId).catch(() => null) as any]);
  const meName = clean(D0?.player?.name || "Yo");
  const comps = (Array.isArray(t.companions) ? t.companions : []).map((c: any) => ({ name: clean(typeof c === "string" ? c : c?.name), hcp: c && typeof c === "object" && c.hcp != null && isFinite(+c.hcp) ? +c.hcp : null, club_id: c?.player_id ?? c?.matricula ?? null })).filter((c: any) => c.name);
  const si = Array.from({ length: HOLES }, (_, i) => { const h = (td?.holes || []).find((x: any) => x.hole === i + 1); const v = Number(h?.hcp); return Number.isInteger(v) && v >= 1 && v <= 18 ? v : null; });
  const pars = Array.from({ length: HOLES }, (_, i) => { const v = Number((td?.holes || []).find((x: any) => x.hole === i + 1)?.par); return Number.isInteger(v) && v >= 3 && v <= 6 ? v : null; });
  const tees = await teeCatalog(t, td), ut = await usualTee(userId, td?.golflet_course_key ?? null);
  const match = (name: string | null) => name ? tees.find(x => x.tee.toLowerCase() === name.toLowerCase())?.tee ?? null : null;
  const COL: Record<string, string> = { colorada: "rojo", roja: "rojo", azul: "azul", negra: "negro", blanca: "blanco", amarilla: "amarillo", verde: "verde" };
  const fromLabel = (() => { const w = normName(String(t.course_label || "")).split(" "); for (const x of w) { const m = match(COL[x] || x); if (m) return m; } return null; })();
  const defTee = match(ut) ?? fromLabel ?? tees[0]?.tee ?? null, tee_source = match(ut) ? "tu salida habitual (tus tarjetas)" : fromLabel ? "el color de la cancha de la reserva" : defTee ? "la primera salida de la cancha" : null;
  const genders = new Set(tees.map(x => x.gender || "C"));
  return { tees, pars, default_tee: defTee, tee_source, genders: [...genders],
    hcp_rule: "Hándicap de cancha WHS por salida: Índice × Slope/113 + (Course Rating − Par), redondeado. Sin datos de la salida → el índice.", tee_time: { id: t.id, date: t.date, time: t.time, course_label: t.display_name || t.club_name, start_hole: t.start_hole === 10 ? 10 : 1, modality: t.modality, event_name: t.event_name },
    players: [{ id: "me", name: meName, hcp: hi, me: true, tee: defTee, gender: "C" }, ...comps.map((c: any) => ({ id: c.club_id ? `c:${c.club_id}` : `n:${normName(c.name)}`, name: c.name, hcp: c.hcp, tee: defTee, gender: "C" }))],
    si, si_source: si.some(v => v != null) ? "tarjeta del club" : null, hcp_base: tees.length ? "Hándicap de cancha según la salida de cada uno (índice de la reserva × slope/113 + CR − par)" : "Hándicap Index (no tenemos slope ni course rating de esta cancha)" };
}
export async function listMatches(userId: string) {
  const rs = await q<any>(`select ${COLS} from golf_match where user_id = $1 and deleted_at is null order by date desc, created_at desc limit 300`, [userId]);
  const done: StoredMatch[] = rs.filter(r => r.status === "done" && r.result).map(r => ({ id: r.id, date: r.date, course_label: r.course_label, def: r.def, result: r.result }));
  return { matches: rs.map(r => ({ id: r.id, date: r.date, course_label: r.course_label, status: r.status, modality: r.def?.modality, scoring: r.def?.scoring, allowance: r.def?.allowance, players: (r.def?.players || []).map((p: any) => ({ id: p.id, name: p.name })), sides: r.def?.sides, summary: r.result?.summary ?? null, mine: myOutcome(r.result), win_side: r.result?.main?.result ?? null })), history: aggregate(done) };
}
export async function getMatch(userId: string, id: string) {
  if (!ID.test(id)) throw new HttpError(404, "Partido no encontrado");
  const [r] = await q<any>(`select ${COLS} from golf_match where id = $1 and user_id = $2 and deleted_at is null`, [id, userId]);
  if (!r) throw new HttpError(404, "Partido no encontrado"); return row(r);
}
/** Create or update (upsert by the client's id). Finished matches are read-only (409). `finish: true` closes it. */
export async function putMatch(userId: string, id: string, b: any) {
  if (!ID.test(id)) bad("Id inválido");
  const [cur] = await q<any>(`select status, def, user_id from golf_match where id = $1`, [id]);
  if (cur && cur.user_id !== userId) throw new HttpError(404, "Partido no encontrado");
  if (cur && cur.status !== "open") throw new HttpError(409, cur.status === "done" ? "El partido ya terminó: quedó registrado y no se puede cambiar" : "Partido abandonado");
  const date = clean(b?.date, 10); if (!D.test(date) || isNaN(Date.parse(date + "T12:00:00Z"))) bad("Fecha inválida");
  const tee = ID.test(String(b?.tee_time_id || "")) ? String(b.tee_time_id) : null, def = cleanDef(b?.def);
  // t265u: slope / rating / par / S.I. come from OUR club data, not from the client: on create from the booking, then kept from the stored match
  if (cur?.def) { if (cur.def.tees) def.tees = cur.def.tees; else delete def.tees; if (cur.def.pars) def.pars = cur.def.pars; if (Array.isArray(cur.def.si)) def.si = cur.def.si; }
  else if (tee) { const t: any = await getTeeTime(userId, tee).catch(() => null), td = t?.club_key ? await courseTeeData(t.club_key, t.course_id).catch(() => null) : null;
    const tees = t ? await teeCatalog(t, td) : []; if (tees.length) def.tees = tees; else delete def.tees; }
  else delete def.tees;
  const scores = cleanScores(b?.scores, def), result = evaluate(def, scores);
  const done = !!b?.finish || result.finished;
  await q(`insert into golf_match (id, user_id, date, course_label, tee_time_id, modality, scoring, allowance, def, scores, result, status, finished_at)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, case when $12 = 'done' then now() end)
    on conflict (id) do update set date = excluded.date, course_label = excluded.course_label, modality = excluded.modality, scoring = excluded.scoring, allowance = excluded.allowance,
      def = excluded.def, scores = excluded.scores, result = excluded.result, status = excluded.status, finished_at = excluded.finished_at, updated_at = now()
    where golf_match.user_id = $2 and golf_match.status = 'open'`,
    [id, userId, date, clean(b?.course_label, 120) || null, tee, def.modality, def.scoring, def.allowance, JSON.stringify(def), JSON.stringify(scores), JSON.stringify(result), done ? "done" : "open"]);
  return getMatch(userId, id);
}
/** Abandon an open match (soft delete). Finished matches stay. */
export async function abandonMatch(userId: string, id: string) {
  if (!ID.test(id)) throw new HttpError(404, "Partido no encontrado");
  const rs = await q<any>(`update golf_match set status = 'abandoned', deleted_at = now(), updated_at = now() where id = $1 and user_id = $2 and status = 'open' returning id`, [id, userId]);
  if (!rs.length) throw new HttpError(409, "Solo se puede abandonar un partido en curso");
  return { ok: true };
}
