import { handle, json, requireUser, HttpError } from "@/lib/http";
import { addSamples, setDiscarded } from "@/lib/shot-samples";
import { q } from "@/lib/db";
import { ownRound } from "@/lib/rounds";
import { linkLiveRounds, LIVE_COLS, shotsWithDistances } from "@/lib/live";

/** GPS shots logged with Golflet for a synced Golfistics round (via live_round.round_id). */
export const GET = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser(req); const { id } = await ctx.params;
  await ownRound(user.id, id); await linkLiveRounds(user.id).catch(() => 0);
  const lives = await q(`select ${LIVE_COLS} from live_round l where l.user_id=$1 and l.round_id=$2 order by l.started_at`, [user.id, id]);
  const out = []; for (const l of lives) out.push({ live_round: l, shots: await shotsWithDistances(l) });
  return json({ live_rounds: out });
});

/** t104u: batch shot samples from iOS Jugar. {id} = live_round id or synced round id. Idempotent by client_id.
 *  POST { course_id?, samples:[{ client_id, kind: full|approach|putt_start, hole, club?, start_lat?, start_lng?, end_lat, end_lng, accuracy_m?, putts?, taken_at? }] } */
export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser(req); const { id } = await ctx.params; let b: any; try { b = await req.json(); } catch { throw new HttpError(400, "JSON inválido"); }
  const r = await addSamples(user.id, id, b); return json(r, r.saved ? 201 : 200);
});
/** PATCH { ids?|client_ids?, discarded: boolean } → discard/restore (discarded samples never count for distances). */
export const PATCH = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser(req); const { id } = await ctx.params; let b: any; try { b = await req.json(); } catch { throw new HttpError(400, "JSON inválido"); }
  return json(await setDiscarded(user.id, id, b));
});
