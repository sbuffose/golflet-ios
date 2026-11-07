import { handle, json, requireUser } from "@/lib/http";
import { saveHoleShots } from "@/lib/plans";

/** t179u: PUT {shots:[{club, source:'libreto'|'gps', to:[lng,lat], adjusted?}]} → the planned shots for one hole (ends on the green; no putts). */
export const PUT = handle(async (req: Request, ctx: { params: Promise<{ id: string; hole: string }> }) => {
  const u = await requireUser(req); const { id, hole } = await ctx.params; const b = await req.json().catch(() => ({}));
  return json(await saveHoleShots(u.id, id, Number(hole), b?.shots));
});
