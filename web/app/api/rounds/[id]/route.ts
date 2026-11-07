import { handle, json, requireUser } from "@/lib/http";
import { ownRound } from "@/lib/rounds";

export const GET = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser(req); const { id } = await ctx.params;
  return json({ round: await ownRound(user.id, id) });
});
