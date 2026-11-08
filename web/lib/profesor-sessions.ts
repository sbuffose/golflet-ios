/** Phase D: class sessions + assigned content. Profesor writes only for students who share metrics with them; the student reads everything
 *  their (linked) profesores logged for them. Own-video upload is gated by the STUDENT's Premium (billing off → never) + storage config. Audited. */
import { q } from "./db";
import { HttpError } from "./http";
import { event, profesorCanSee } from "./profesores";
import { requireProfesor } from "./profesor-space";

const UUID = /^[0-9a-f-]{36}$/i;
const txt = (v: any, max: number, req = false, label = "") => { const s = String(v ?? "").replace(/<[^>]*>/g, "").replace(/\s+\n/g, "\n").trim().slice(0, max); if (req && !s) throw new HttpError(400, `Completá ${label}`); return s || null; };
export const PREMIUM_PRICE_ARS: number | null = null;   // TBD: billing is off

export async function isPremium(userId: string) {
  const [p] = await q(`select plan, premium_until from player_plan where user_id=$1`, [userId]);
  return !!p && p.plan === "premium" && (!p.premium_until || new Date(p.premium_until) > new Date());
}
export const storageConfigured = () => !!process.env.BLOB_READ_WRITE_TOKEN;

async function canWrite(profId: string, playerId: string) {
  await requireProfesor(profId);
  if (!(await profesorCanSee(profId, playerId, "metrics"))) throw new HttpError(404, "Este jugador no comparte sus métricas con vos");
}
const RATE = 60;
async function rateW(profId: string) {
  const [{ n }] = await q(`select count(*)::int n from profesor_event where actor_id=$1 and action in ('session.add','content.add') and created_at > now() - interval '24 hours'`, [profId]);
  if (n >= RATE) throw new HttpError(429, "Cargaste muchas cosas hoy. Probá de nuevo mañana.");
}

/* ---------- profesor side ---------- */
export async function addSession(profId: string, playerId: string, b: any) {
  await canWrite(profId, playerId); await rateW(profId);
  const date = String(b?.date || ""); if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || isNaN(Date.parse(date))) throw new HttpError(400, "Fecha inválida");
  if (Date.parse(date) > Date.now() + 86400_000) throw new HttpError(400, "La fecha no puede ser futura");
  const [r] = await q(`insert into profesor_session (profesor_id, player_id, date, worked_on, recommendations) values ($1,$2,$3,$4,$5) returning id, date::text date, worked_on, recommendations, created_at`,
    [profId, playerId, date, txt(b?.worked_on, 2000, true, "qué trabajaron"), txt(b?.recommendations, 2000)]);
  await event(profId, "session.add", playerId, profId); return r;
}
export async function deleteSession(profId: string, id: string) {
  await requireProfesor(profId); if (!UUID.test(id)) throw new HttpError(404, "Clase no encontrada");
  const [r] = await q(`delete from profesor_session where id=$1 and profesor_id=$2 returning player_id`, [id, profId]);
  if (!r) throw new HttpError(404, "Clase no encontrada"); await event(profId, "session.delete", r.player_id, profId);
}
export async function addContent(profId: string, playerId: string, b: any) {
  await canWrite(profId, playerId);
  const kind = b?.kind;
  if (kind === "video") return uploadGate(profId, playerId);
  if (kind !== "link" && kind !== "tip") throw new HttpError(400, "Tipo inválido");
  await rateW(profId);
  let url: string | null = null;
  if (kind === "link") { try { const u = new URL(String(b?.url || "")); if (u.protocol !== "https:") throw 0; url = u.toString().slice(0, 600); } catch { throw new HttpError(400, "Pegá un link que empiece con https://"); } }
  const body = txt(b?.body, 3000, kind === "tip", "el consejo");
  const [r] = await q(`insert into profesor_content (profesor_id, player_id, kind, title, body, url) values ($1,$2,$3,$4,$5,$6) returning id, kind, title, body, url, created_at, seen_at`,
    [profId, playerId, kind, txt(b?.title, 120, true, "un título"), body, url]);
  await event(profId, "content.add", playerId, profId, kind); return r;
}
export async function deleteContent(profId: string, id: string) {
  await requireProfesor(profId); if (!UUID.test(id)) throw new HttpError(404, "Contenido no encontrado");
  const [r] = await q(`delete from profesor_content where id=$1 and profesor_id=$2 returning player_id`, [id, profId]);
  if (!r) throw new HttpError(404, "Contenido no encontrado"); await event(profId, "content.delete", r.player_id, profId);
}
/** Own video for a student: only if THAT student has Premium (student pays) and private storage is configured. Billing is off today. */
export async function uploadGate(profId: string, playerId: string): Promise<never> {
  await canWrite(profId, playerId);
  if (!(await isPremium(playerId))) throw new HttpError(402, "Para subir videos propios, tu alumno necesita Golflet Premium (lo paga el alumno). Todavía no está disponible.");
  if (!storageConfigured()) throw new HttpError(503, "La subida de videos todavía no está habilitada.");
  throw new HttpError(501, "La subida de videos llega pronto.");
}
export async function studentPlan(profId: string, playerId: string) {
  await canWrite(profId, playerId);
  return { premium: await isPremium(playerId), video_upload: (await isPremium(playerId)) && storageConfigured(), price_ars: PREMIUM_PRICE_ARS, billing: false };
}
/** Profesor's library = what they already assigned to anyone (dedup by title+url/body), to reuse. */
export async function myLibrary(profId: string) {
  await requireProfesor(profId);
  return q(`select distinct on (kind, title, coalesce(url,''), coalesce(body,'')) kind, title, body, url, created_at from profesor_content where profesor_id=$1 and kind<>'video'
            order by kind, title, coalesce(url,''), coalesce(body,''), created_at desc limit 100`, [profId]);
}
export async function pairHistory(profId: string, playerId: string) {
  await canWrite(profId, playerId);
  const [sessions, content] = await Promise.all([
    q(`select id, date::text date, worked_on, recommendations, created_at from profesor_session where profesor_id=$1 and player_id=$2 order by date desc, created_at desc limit 100`, [profId, playerId]),
    q(`select id, kind, title, body, url, created_at, seen_at from profesor_content where profesor_id=$1 and player_id=$2 order by created_at desc limit 100`, [profId, playerId]),
  ]);
  return { sessions, content, plan: await studentPlan(profId, playerId) };
}

/* ---------- student side ---------- */
export async function myClasses(playerId: string, profId: string) {
  if (!profId) throw new HttpError(404, "Profesor no encontrado");
  const [sessions, content] = await Promise.all([
    q(`select id, date::text date, worked_on, recommendations from profesor_session where player_id=$1 and profesor_id=$2 order by date desc, created_at desc limit 100`, [playerId, profId]),
    q(`select id, kind, title, body, url, created_at, seen_at from profesor_content where player_id=$1 and profesor_id=$2 order by created_at desc limit 100`, [playerId, profId]),
  ]);
  return { sessions, content };
}
export async function markSeen(playerId: string, ids: unknown) {
  const list = (Array.isArray(ids) ? ids : []).map(String).filter(i => UUID.test(i)).slice(0, 100);
  if (list.length) await q(`update profesor_content set seen_at=now() where player_id=$1 and id = any($2::uuid[]) and seen_at is null`, [playerId, list]);
  return { ok: true };
}
export async function unseenCount(playerId: string) {
  const [r] = await q(`select count(*)::int n from profesor_content where player_id=$1 and seen_at is null`, [playerId]); return r.n;
}
