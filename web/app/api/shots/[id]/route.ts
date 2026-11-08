import { handle, json, requireUser, HttpError } from "@/lib/http";
import { q } from "@/lib/db";
import { body } from "@/lib/accounts";
import { ownLive, shotsWithDistances } from "@/lib/live";
import { DIRECTIONS, INTENTS, LENGTHS, LIES, RESULTS } from "@/lib/shots-calc";
import { validLatLng } from "@/lib/geo";
import { ReconstructSchemaError, liveOrigin, updateManualShot } from "@/lib/reconstruct";

type Ctx = { params: Promise<{ id: string }> };
async function own(userId: string, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new HttpError(404, "No encontrado");
  const [s] = await q(`select id, live_round_id from shot where id=$1 and user_id=$2`, [id, userId]);
  if (!s) throw new HttpError(404, "No encontrado"); return s;
}
/** Usually: set the club after hitting { club }, then the quick result { direction, length, result, mishit }. Also { lie, intent, hole, shot_number, lat, lng, accuracy_m }. */
export const PATCH = handle(async (req: Request, ctx: Ctx) => {
  const user = await requireUser(req); const { id } = await ctx.params; const s = await own(user.id, id);
  const b = await body<any>(req);
  if (await liveOrigin(user.id, s.live_round_id) === "manual" && ("lat" in b || "lng" in b || "end_lat" in b || "end_lng" in b || "distance_m" in b || "penalty_strokes" in b)) {
    try { return json({ shot: await updateManualShot(user.id, id, b) }); }
    catch (e) { if (e instanceof ReconstructSchemaError) return json({ error: e.message }, 503); throw e; }
  }
  const sets: string[] = []; const vals: unknown[] = [id];
  const set = (col: string, v: unknown) => { vals.push(v); sets.push(`${col}=$${vals.length}`); };
  if ("club" in b) set("club", b.club == null || b.club === "" ? null : String(b.club).slice(0, 8));
  if ("lie" in b) { if (b.lie != null && !LIES.includes(b.lie)) throw new HttpError(400, "lie inválido"); set("lie", b.lie ?? null); }
  if ("result" in b) { if (b.result != null && !RESULTS.includes(b.result)) throw new HttpError(400, "result inválido"); set("result", b.result ?? null); }
  const pick = (k: string, list: readonly string[]) => { if (k in b) { if (b[k] != null && !list.includes(b[k])) throw new HttpError(400, `${k} inválido`); set(k, b[k] ?? null); } };
  pick("direction", DIRECTIONS); pick("length", LENGTHS); pick("intent", INTENTS);
  if ("mishit" in b) set("mishit", b.mishit === true);
  if ("hole" in b) { const h = Number(b.hole); if (!Number.isInteger(h) || h < 1 || h > 18) throw new HttpError(400, "Hoyo inválido"); set("hole", h); }
  if ("shot_number" in b) { const n = Number(b.shot_number); if (!Number.isInteger(n) || n < 1 || n > 20) throw new HttpError(400, "Golpe inválido"); set("shot_number", n); }
  if ("lat" in b || "lng" in b) { const p = validLatLng(b.lat, b.lng); if (!p) throw new HttpError(400, "Posición inválida"); set("lat", p.lat); set("lng", p.lng); }
  if ("accuracy_m" in b) set("accuracy_m", b.accuracy_m == null ? null : Math.max(0, Math.min(5000, Number(b.accuracy_m) || 0)));
  if (sets.length) await q(`update shot set ${sets.join(", ")}, updated_at=now() where id=$1`, vals);
  const l = await ownLive(user.id, s.live_round_id);
  const shots = await shotsWithDistances(l);
  return json({ shot: shots.find(x => x.id === id) || null, shots });
});
export const DELETE = handle(async (req: Request, ctx: Ctx) => {
  const user = await requireUser(req); const { id } = await ctx.params; const s = await own(user.id, id);
  await q(`delete from shot where id=$1`, [id]);
  return json({ ok: true, shots: await shotsWithDistances(await ownLive(user.id, s.live_round_id)) });
});
