/** Profesores, player side (phase A): link/unlink, two permissions (default OFF), invite link. Every change audited in profesor_event.
 *  A profesor only ever sees players with can_view_metrics = true, and within that player's share_pref (see profesorCanSee). */
import { q } from "./db";
import { HttpError } from "./http-error";
import { newToken, validToken, BASE_URL } from "./group-share";

export const PERMS = ["can_view_metrics", "can_hear_audio"] as const;
type Perm = (typeof PERMS)[number];
const LINKS_PER_DAY = 20, INVITES_PER_DAY = 10;

export async function event(actor: string, action: string, player: string | null, profesor: string | null, detail: string | null = null) {
  await q(`insert into profesor_event (actor_id, action, player_id, profesor_id, detail) values ($1,$2,$3,$4,$5)`, [actor, action, player, profesor, detail]);
}
async function rate(actor: string, actions: string[], max: number) {
  const [{ n }] = await q(`select count(*)::int n from profesor_event where actor_id=$1 and action = any($2) and created_at > now() - interval '24 hours'`, [actor, actions]);
  if (n >= max) throw new HttpError(429, "Hiciste muchos cambios hoy. Probá de nuevo mañana.");
}
const cardOf = (r: any) => ({ profesor_id: r.user_id, name: r.display_name, verified: !!r.verified, pending: r.account_status === "pending", locations: r.locations || [], bio: r.bio ? String(r.bio).slice(0, 160) : null,
  price_min: r.price_min ?? null, price_max: r.price_max ?? null, formats: r.formats || [] });

/** Linkable profesor (visible profile; pending accounts included: they see nothing until they activate). */
export async function isProfesor(userId: string) { const [r] = await q(`select 1 from profesor_profile where user_id=$1 and active`, [userId]); return !!r; }
/** Active (signed-in capable) profesor account. */
export async function isActiveProfesor(userId: string) { const [r] = await q(`select 1 from profesor_profile where user_id=$1 and account_status='active'`, [userId]); return !!r; }

export async function myProfesores(playerId: string) {
  const rows = await q(`select p.*, l.can_view_metrics, l.can_hear_audio, l.source, l.created_at linked_at,
      (select count(*)::int from profesor_content c where c.player_id=l.player_id and c.profesor_id=l.profesor_id and c.seen_at is null) new_content,
      (select count(*)::int from profesor_session x where x.player_id=l.player_id and x.profesor_id=l.profesor_id) sessions
    from player_profesor l join profesor_profile p on p.user_id=l.profesor_id
                        where l.player_id=$1 order by l.created_at`, [playerId]);
  return rows.map((r: any) => ({ ...cardOf(r), can_view_metrics: r.can_view_metrics, can_hear_audio: r.can_hear_audio, source: r.source, linked_at: r.linked_at, active: r.active, new_content: r.new_content, sessions: r.sessions }));
}

/** Name (accent/case-insensitive, ≥ 2 chars) or exact matrícula. Only active profiles; never the player. */
export async function searchProfesores(playerId: string, qs: string) {
  const s = String(qs || "").normalize("NFC").replace(/[%_\\]/g, "").trim().slice(0, 60);
  if (s.length < 2) return [];
  const rows = await q(`select p.*, exists(select 1 from player_profesor l where l.player_id=$1 and l.profesor_id=p.user_id) linked from profesor_profile p
     where p.active and p.user_id<>$1 and (translate(lower(p.display_name),'áéíóúüñ','aeiouun') like '%'||translate(lower($2),'áéíóúüñ','aeiouun')||'%' or p.matricula=$2)
     order by p.verified desc, (translate(lower(p.display_name),'áéíóúüñ','aeiouun') like translate(lower($2),'áéíóúüñ','aeiouun')||'%') desc, lower(p.display_name) limit 12`, [playerId, s]);
  return rows.map((r: any) => ({ ...cardOf(r), linked: r.linked }));
}

export async function linkProfesor(playerId: string, profesorId: unknown, source: "search" | "link" | "match" = "search") {
  if (typeof profesorId !== "string" || !profesorId || profesorId === playerId) throw new HttpError(400, "Elegí un profesor");
  if (!(await isProfesor(profesorId))) throw new HttpError(404, "Ese profesor no existe");
  await rate(playerId, ["link"], LINKS_PER_DAY);
  const r = await q(`insert into player_profesor (player_id, profesor_id, source) values ($1,$2,$3) on conflict do nothing returning player_id`, [playerId, profesorId, source]);
  if (r.length) await event(playerId, "link", playerId, profesorId, source);
  return (await myProfesores(playerId)).find(p => p.profesor_id === profesorId);
}

/** Toggle permissions. Only the player changes them (the profesor can never grant themselves anything). */
export async function setPerms(playerId: string, profesorId: string, body: any) {
  const [cur] = await q(`select can_view_metrics, can_hear_audio from player_profesor where player_id=$1 and profesor_id=$2`, [playerId, profesorId]);
  if (!cur) throw new HttpError(404, "Ese profesor no está en tu lista");
  const next: Record<Perm, boolean> = { ...cur };
  for (const k of PERMS) if (k in (body || {})) { if (typeof body[k] !== "boolean") throw new HttpError(400, `${k} tiene que ser true o false`); next[k] = body[k]; }
  await q(`update player_profesor set can_view_metrics=$3, can_hear_audio=$4, updated_at=now() where player_id=$1 and profesor_id=$2`, [playerId, profesorId, next.can_view_metrics, next.can_hear_audio]);
  for (const k of PERMS) if (next[k] !== cur[k]) await event(playerId, next[k] ? "grant" : "revoke", playerId, profesorId, k);
  return (await myProfesores(playerId)).find(p => p.profesor_id === profesorId);
}

export async function unlinkProfesor(playerId: string, profesorId: string) {
  const r = await q(`delete from player_profesor where player_id=$1 and profesor_id=$2 returning profesor_id`, [playerId, profesorId]);
  if (!r.length) throw new HttpError(404, "Ese profesor no está en tu lista");
  await event(playerId, "unlink", playerId, profesorId);
  return { removed: profesorId };
}

/** Share link for a profesor who isn't on Golflet yet (or the player can't find). 14 days, single use. */
export async function createInvite(playerId: string) {
  await rate(playerId, ["invite"], INVITES_PER_DAY);
  const token = newToken();
  const [r] = await q(`insert into profesor_invite (token, player_id) values ($1,$2) returning expires_at`, [token, playerId]);
  await event(playerId, "invite", playerId, null);
  const url = `${BASE_URL}/p/${token}`;
  return { token, url, expires_at: r.expires_at, wa_text: `Te invito a ser mi profesor en Golflet: ${url}` };
}
export async function previewInvite(token: string, viewerId: string | null) {
  if (!validToken(token)) throw new HttpError(404, "Link inválido");
  const [i] = await q(`select i.*, u.name from profesor_invite i join "user" u on u.id=i.player_id where token=$1`, [token]);
  if (!i) throw new HttpError(404, "Link inválido");
  const state = i.used_by ? "used" : new Date(i.expires_at) < new Date() ? "expired" : "open";
  return { player_first_name: String(i.name || "").split(/\s+/)[0] || null, state, expires_at: i.expires_at, signed_in: !!viewerId, is_profesor: viewerId ? await isActiveProfesor(viewerId) : false };
}
export async function acceptInvite(token: string, profesorId: string) {
  if (!validToken(token)) throw new HttpError(404, "Link inválido");
  if (!(await isActiveProfesor(profesorId))) throw new HttpError(403, "Primero activá tu cuenta de profesor");
  const [i] = await q(`update profesor_invite set used_by=$2, used_at=now() where token=$1 and used_by is null and expires_at > now() and player_id<>$2 returning player_id`, [token, profesorId]);
  if (!i) throw new HttpError(410, "Este link ya se usó o venció");
  await q(`insert into player_profesor (player_id, profesor_id, source) values ($1,$2,'link') on conflict do nothing`, [i.player_id, profesorId]);
  await event(profesorId, "invite.accept", i.player_id, profesorId);
  return { linked: true };
}

/** Server-side gate for every profesor read of a player's data. Voice notes need can_hear_audio; notes and strategy: never. */
export async function profesorCanSee(profesorId: string, playerId: string, what: "metrics" | "audio") {
  const [l] = await q(`select can_view_metrics, can_hear_audio from player_profesor l join profesor_profile p on p.user_id=l.profesor_id and p.active where l.player_id=$1 and l.profesor_id=$2`, [playerId, profesorId]);
  return !!l && (what === "metrics" ? l.can_view_metrics : l.can_hear_audio);
}
