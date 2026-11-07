import { handle, json, requireUser } from "@/lib/http";
import { memberProfile } from "@/lib/group-period";
/** GET → a member's profile inside a group, filtered by what that member shares ("Qué comparto"). locked:true = only name/color. */
export const GET = handle(async (req: Request, ctx: { params: Promise<{ id: string; memberId: string }> }) => {
  const u = await requireUser(req); const { id, memberId } = await ctx.params;
  return json(await memberProfile(id, u.id, memberId));
});
