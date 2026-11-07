import { handle, json, requireUser } from "@/lib/http";
import { ownLive } from "@/lib/live";
import { liveHoles } from "@/lib/game-metrics";

/** GET -> { holes: [{ hole, par, green:{front,center,back}|null, putts, pin }] } for the 18 holes of a live round. */
export const GET = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser(req); const { id } = await ctx.params; const l = await ownLive(user.id, id);
  return json({ holes: await liveHoles(l, user.id) });
});
