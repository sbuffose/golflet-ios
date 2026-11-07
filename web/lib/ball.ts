import { q } from "./db";
import { HttpError } from "./http-error";
import { BALLS, cleanBall } from "./ball-catalog";
export async function getBall(userId: string) {
  const [r] = await q(`select brand, model, custom, updated_at from player_ball where user_id=$1`, [userId]);
  return { ball: r ?? null, catalog: BALLS };
}
export async function setBall(userId: string, body: any) {
  let b; try { b = cleanBall(body); } catch (e: any) { throw new HttpError(400, e.message); }
  const [r] = await q(`insert into player_ball (user_id, brand, model, custom, updated_at) values ($1,$2,$3,$4,now())
    on conflict (user_id) do update set brand=excluded.brand, model=excluded.model, custom=excluded.custom, updated_at=now() returning brand, model, custom, updated_at`, [userId, b.brand, b.model, b.custom]);
  return { ball: r };
}
export async function clearBall(userId: string) { await q(`delete from player_ball where user_id=$1`, [userId]); return { ball: null }; }
/** For group views: only members sharing "Pelota". */
export async function ballsFor(userIds: string[]) {
  if (!userIds.length) return new Map<string, any>();
  const rows = await q(`select user_id, brand, model from player_ball where user_id = any($1::text[])`, [userIds]);
  return new Map(rows.map((r: any) => [r.user_id, { brand: r.brand, model: r.model }]));
}
