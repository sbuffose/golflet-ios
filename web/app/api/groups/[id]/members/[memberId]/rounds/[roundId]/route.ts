import { handle, json, requireUser } from "@/lib/http";
import { memberCard } from "@/lib/group-period";
/** GET → one scorecard of a member (needs their "Mis tarjetas hoyo por hoyo" + "Rondas y scores"; 403 otherwise). */
export const GET = handle(async (req: Request, ctx: { params: Promise<{ id: string; memberId: string; roundId: string }> }) => {
  const u = await requireUser(req); const { id, memberId, roundId } = await ctx.params;
  return json(await memberCard(id, u.id, memberId, roundId));
});
