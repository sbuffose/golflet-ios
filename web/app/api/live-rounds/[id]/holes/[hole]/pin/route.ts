import { handle, json, requireUser, HttpError } from "@/lib/http";
import { body } from "@/lib/accounts";
import { ownLive } from "@/lib/live";
import { markDayPin } from "@/lib/pins";
import { liveHoles } from "@/lib/game-metrics";

type Ctx = { params: Promise<{ id: string; hole: string }> };
/** POST { lat, lng, accuracy_m?, zone: 'front'|'middle'|'back' } → "Estoy en la bandera": sets today's pin for this hole for everyone (first player of the day),
 *  or corrects it if you set it. 409 if the club or another player already set it. Also saves it as your own pin for this round. */
export const POST = handle(async (req: Request, ctx: Ctx) => {
  const user = await requireUser(req); const { id, hole: hs } = await ctx.params; const l = await ownLive(user.id, id);
  const hole = Number(hs); if (!Number.isInteger(hole) || hole < 1 || hole > 18) throw new HttpError(400, "Hoyo inválido");
  await markDayPin(user.id, l, hole, await body<any>(req));
  return json({ hole: (await liveHoles(l, user.id))[hole - 1] }, 201);
});
