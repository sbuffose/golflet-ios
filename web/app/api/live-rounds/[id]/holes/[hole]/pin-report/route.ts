import { handle, json, requireUser, HttpError } from "@/lib/http";
import { body } from "@/lib/accounts";
import { ownLive } from "@/lib/live";
import { reportDayPin } from "@/lib/pins";
import { liveHoles } from "@/lib/game-metrics";

type Ctx = { params: Promise<{ id: string; hole: string }> };
/** POST { lat, lng, accuracy_m? } → "Bandera mal registrada" for another player's pin of today. One per player per hole per day (429). Notifies Golflet admins. */
export const POST = handle(async (req: Request, ctx: Ctx) => {
  const user = await requireUser(req); const { id, hole: hs } = await ctx.params; const l = await ownLive(user.id, id);
  const hole = Number(hs); if (!Number.isInteger(hole) || hole < 1 || hole > 18) throw new HttpError(400, "Hoyo inválido");
  await reportDayPin(user.id, l, hole, await body<any>(req));
  return json({ ok: true, hole: (await liveHoles(l, user.id))[hole - 1] }, 201);
});
