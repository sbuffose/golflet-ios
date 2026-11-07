/** t74u sorteos: admin-run giveaways; a player enters only after accepting the current bases y condiciones. Server-enforced + audited. */
import { randomInt } from "node:crypto";
import { q } from "./db";
import { HttpError } from "./http-error";
import { cleanSorteo, effStatus, pickIndex } from "./sorteos-core";

const COLS = `s.id, s.title, s.prize, s.description, s.sponsor, s.starts_at, s.ends_at, s.status, s.bases_version, s.drawn_at, s.created_at`;
const okId = (id: string) => { if (!/^[0-9a-f-]{36}$/i.test(id)) throw new HttpError(404, "Sorteo no encontrado"); };
const bad = (f: () => any) => { try { return f(); } catch (e: any) { throw new HttpError(400, e.message); } };

/* ---------- player ---------- */
export async function listForPlayer(userId: string) {
  const rows = await q(`select ${COLS}, (e.user_id is not null) entered, e.accepted_at, (s.winner_user_id = $1) won, (select count(*)::int from sorteo_entry x where x.sorteo_id=s.id) entries
    from sorteo s left join sorteo_entry e on e.sorteo_id=s.id and e.user_id=$1
    where s.status in ('abierto','cerrado','sorteado') and (s.status <> 'sorteado' or e.user_id is not null or s.drawn_at > now() - interval '30 days')
    order by s.ends_at desc limit 50`, [userId]);
  const out = rows.map((r: any) => ({ ...r, status: effStatus(r) }));
  return { sorteos: out, open: out.filter((r: any) => r.status === "abierto").length };
}
export async function getForPlayer(userId: string, id: string) {
  okId(id);
  const [r] = await q(`select ${COLS}, s.bases, (e.user_id is not null) entered, e.accepted_at, e.bases_version accepted_version, (s.winner_user_id = $2) won,
      (select count(*)::int from sorteo_entry x where x.sorteo_id=s.id) entries
    from sorteo s left join sorteo_entry e on e.sorteo_id=s.id and e.user_id=$2 where s.id=$1 and s.status in ('abierto','cerrado','sorteado')`, [id, userId]);
  if (!r) throw new HttpError(404, "Sorteo no encontrado");
  return { sorteo: { ...r, status: effStatus(r) } };
}
export async function enter(user: { id: string }, id: string, body: any) {
  okId(id);
  if (body?.acepto_bases !== true) throw new HttpError(400, "Para participar tenés que aceptar las bases y condiciones.");
  const [s] = await q(`select id, status, starts_at, ends_at, bases_version from sorteo where id=$1`, [id]);
  if (!s) throw new HttpError(404, "Sorteo no encontrado");
  const st = effStatus(s); if (st !== "abierto") throw new HttpError(409, st === "proximo" ? "Este sorteo todavía no empezó." : "Este sorteo ya cerró.");
  if (body?.bases_version && body.bases_version !== s.bases_version) throw new HttpError(409, "Las bases cambiaron. Leelas de nuevo antes de participar.");
  await q(`insert into sorteo_entry (sorteo_id, user_id, bases_version) values ($1,$2,$3) on conflict (sorteo_id, user_id) do nothing`, [id, user.id, s.bases_version]);
  await q(`insert into admin_audit (actor_id, action, target_type, target_id, summary) values ($1,'sorteo.enter','sorteo',$2,$3)`, [user.id, id, `Participa (bases ${s.bases_version})`]).catch(() => {});
  return getForPlayer(user.id, id);
}
export async function leave(user: { id: string }, id: string) {
  okId(id);
  const [s] = await q(`select status, starts_at, ends_at from sorteo where id=$1`, [id]); if (!s) throw new HttpError(404, "Sorteo no encontrado");
  if (effStatus(s) !== "abierto") throw new HttpError(409, "El sorteo ya cerró: no podés salir.");
  await q(`delete from sorteo_entry where sorteo_id=$1 and user_id=$2`, [id, user.id]);
  await q(`insert into admin_audit (actor_id, action, target_type, target_id, summary) values ($1,'sorteo.leave','sorteo',$2,'Deja de participar')`, [user.id, id]).catch(() => {});
  return getForPlayer(user.id, id);
}

/* ---------- admin ---------- */
export async function adminList() {
  const rows = await q(`select ${COLS}, (select count(*)::int from sorteo_entry x where x.sorteo_id=s.id) entries, u.name winner_name
    from sorteo s left join "user" u on u.id=s.winner_user_id order by s.created_at desc limit 200`);
  return { sorteos: rows.map((r: any) => ({ ...r, eff_status: effStatus(r) })) };
}
export async function adminGet(id: string) {
  okId(id);
  const [s] = await q(`select s.*, u.name winner_name, u.email winner_email from sorteo s left join "user" u on u.id=s.winner_user_id where s.id=$1`, [id]);
  if (!s) throw new HttpError(404, "Sorteo no encontrado");
  const entries = await q(`select e.user_id, e.accepted_at, e.bases_version, coalesce(nullif(u.name,''), 'Jugador') name,
      (select matricula from club_account a where a.user_id=e.user_id order by created_at limit 1) matricula
    from sorteo_entry e join "user" u on u.id=e.user_id where e.sorteo_id=$1 order by e.accepted_at`, [id]);
  return { sorteo: { ...s, eff_status: effStatus(s) }, entries };
}
export async function adminCreate(by: string, body: any) {
  const o = bad(() => cleanSorteo(body));
  const [r] = await q(`insert into sorteo (title, prize, description, sponsor, bases, bases_version, starts_at, ends_at, created_by) values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id`,
    [o.title, o.prize, o.description, o.sponsor, o.bases, o.bases_version, o.starts_at, o.ends_at, by]);
  return adminGet(r.id);
}
export async function adminUpdate(id: string, body: any) {
  okId(id);
  const [s] = await q(`select status, (select count(*)::int from sorteo_entry where sorteo_id=$1) n from sorteo where id=$1`, [id]);
  if (!s) throw new HttpError(404, "Sorteo no encontrado");
  if (["sorteado", "cancelado"].includes(s.status)) throw new HttpError(409, "Este sorteo ya terminó: no se puede editar.");
  const o = bad(() => cleanSorteo(body, true));
  if (o.bases !== undefined && s.n > 0) throw new HttpError(409, "Ya hay participantes que aceptaron estas bases: no se pueden cambiar.");
  if (body?.status !== undefined) {
    const to = String(body.status), ok: Record<string, string[]> = { borrador: ["abierto", "cancelado"], abierto: ["cerrado", "cancelado"], cerrado: ["abierto", "cancelado"] };
    if (!(ok[s.status] || []).includes(to)) throw new HttpError(409, `No se puede pasar de ${s.status} a ${to}.`);
    o.status = to;
  }
  const keys = Object.keys(o); if (!keys.length) throw new HttpError(400, "Nada para cambiar.");
  await q(`update sorteo set ${keys.map((k, i) => `${k}=$${i + 2}`).join(", ")}, updated_at=now() where id=$1`, [id, ...keys.map(k => o[k])]);
  return adminGet(id);
}
/** Winner = crypto.randomInt over entries ordered by acceptance time; only once closed (by status or end date). */
export async function adminDraw(id: string, by: string) {
  okId(id);
  const [s] = await q(`select status, starts_at, ends_at from sorteo where id=$1 for update`, [id]); if (!s) throw new HttpError(404, "Sorteo no encontrado");
  if (s.status === "sorteado") throw new HttpError(409, "Ya se sorteó.");
  if (effStatus(s) !== "cerrado") throw new HttpError(409, "Primero cerrá el sorteo (o esperá a la fecha de cierre).");
  const es = await q(`select user_id from sorteo_entry where sorteo_id=$1 order by accepted_at, user_id`, [id]);
  if (!es.length) throw new HttpError(409, "No hay participantes.");
  const i = pickIndex(es.length, n => randomInt(n));
  const [r] = await q(`update sorteo set status='sorteado', winner_user_id=$2, drawn_at=now(), drawn_by=$3, draw_info=$4, updated_at=now() where id=$1 and status <> 'sorteado' returning id`,
    [id, es[i].user_id, by, JSON.stringify({ entries: es.length, index: i, method: "crypto.randomInt sobre participantes ordenados por fecha de aceptación" })]);
  if (!r) throw new HttpError(409, "Ya se sorteó.");
  return adminGet(id);
}
