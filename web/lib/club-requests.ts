import { q } from "./db";
import { HttpError } from "./http-error";
import { parseClubRequest, MAX_PER_DAY } from "./club-requests-core";

export async function createClubRequest(user: { id: string; name?: string | null }, body: any) {
  const r = parseClubRequest(body);
  const [{ n }] = await q(`select count(*)::int n from club_requests where user_id=$1 and created_at > now() - interval '24 hours'`, [user.id]);
  if (n >= MAX_PER_DAY) throw new HttpError(429, "Ya mandaste varios pedidos hoy. Probá de nuevo mañana.");
  const [a] = await q(`select matricula, player_name from club_account where user_id=$1 order by created_at limit 1`, [user.id]);
  const [row] = await q(`insert into club_requests (user_id, matricula, nombre, club, mensaje) values ($1,$2,$3,$4,$5) returning id, club, mensaje, status, created_at`,
    [user.id, a?.matricula ?? null, (user.name || a?.player_name || null), r.club, r.mensaje]);
  return { request: row, message: "Gracias, lo vamos a revisar", notified_by_email: false };
}
export async function myClubRequests(userId: string) {
  return q(`select id, club, mensaje, status, created_at, resolved_at from club_requests where user_id=$1 order by created_at desc limit 20`, [userId]);
}
export async function listClubRequests(status: string | null) {
  return q(`select id, user_id, matricula, nombre, club, mensaje, status, created_at, resolved_at, resolved_by from club_requests
            where ($1::text is null or status=$1) order by created_at desc limit 500`, [status]);
}
export async function setClubRequestStatus(id: string, status: string, by: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new HttpError(404, "Pedido no encontrado");
  if (!["nuevo", "resuelto"].includes(status)) throw new HttpError(400, "Estado: nuevo | resuelto");
  const [r] = await q(`update club_requests set status=$2, resolved_at=case when $2='resuelto' then now() else null end, resolved_by=case when $2='resuelto' then $3 else null end where id=$1 returning id, status, resolved_at`, [id, status, by]);
  if (!r) throw new HttpError(404, "Pedido no encontrado");
  return r;
}
