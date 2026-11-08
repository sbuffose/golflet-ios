import { handle, json, requireUser, HttpError } from "@/lib/http";
import { q } from "@/lib/db";
import { body } from "@/lib/accounts";
import { ownLive, shotsWithDistances } from "@/lib/live";
import { parseShot } from "@/lib/shot-input";
import { ReconstructSchemaError, liveOrigin, saveManualShot } from "@/lib/reconstruct";

/**
 * Log one shot { hole, lat, lng, accuracy_m?, taken_at?, club?, lie?, result?, direction?, length?, intent?, mishit?, shot_number?, client_id? } or a batch { shots:[...] } (offline queue).
 * shot_number defaults to the next on that hole. client_id makes retries idempotent. Returns the round's shots with distances.
 */
export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser(req); const { id } = await ctx.params; const l = await ownLive(user.id, id);
  const b = await body<any>(req);
  if (await liveOrigin(user.id, id) === "manual") {
    const list = Array.isArray(b.shots) ? b.shots : [b];
    if (!list.length || list.length > 40) throw new HttpError(400, "Entre 1 y 40 golpes");
    try {
      const shots = [];
      for (const shot of list) shots.push(await saveManualShot(user.id, id, shot));
      return json({ shots }, 201);
    } catch (e) {
      if (e instanceof ReconstructSchemaError) return json({ error: e.message }, 503);
      throw e;
    }
  }
  const list = Array.isArray(b.shots) ? b.shots : [b];
  if (!list.length || list.length > 200) throw new HttpError(400, "Entre 1 y 200 golpes");
  const parsed = list.map(parseShot);
  const created: string[] = [];
  for (const s of parsed) {
    if (s.client_id) { const [d] = await q(`select id from shot where user_id=$1 and client_id=$2`, [user.id, s.client_id]); if (d) { created.push(d.id); continue; } }
    const [r] = await q(`insert into shot (live_round_id, user_id, client_id, hole, shot_number, lat, lng, accuracy_m, taken_at, club, lie, result, direction, length, intent, mishit)
      values ($1,$2,$3,$4, coalesce($5, (select coalesce(max(shot_number),0)+1 from shot where live_round_id=$1 and hole=$4)), $6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
      on conflict (user_id, client_id) where client_id is not null do update set updated_at=now() returning id`,
      [id, user.id, s.client_id, s.hole, s.shot_number, s.lat, s.lng, s.accuracy_m, s.taken_at, s.club, s.lie, s.result, s.direction, s.length, s.intent, s.mishit]);
    created.push(r.id);
  }
  const last = parsed[parsed.length - 1];
  await q(`update live_round set current_hole=$2, updated_at=now() where id=$1`, [id, last.hole]);
  return json({ created_ids: created, shots: await shotsWithDistances({ ...l, current_hole: last.hole }) }, 201);
});
export const GET = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser(req); const { id } = await ctx.params; const l = await ownLive(user.id, id);
  return json({ shots: await shotsWithDistances(l) });
});
