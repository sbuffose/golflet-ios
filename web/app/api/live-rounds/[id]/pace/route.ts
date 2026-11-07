import { handle, json, requireUser } from "@/lib/http";
import { livePace } from "@/lib/pace";
/** GET → { estimate (timeline), check: { check_hole:10, threshold_min:10, enabled, at_check_hole, elapsed_min, expected_min_at_check, behind_min, due, already_alerted_at }, message }. Own rounds only. */
export const GET = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const u = await requireUser(req); const { id } = await ctx.params;
  return json(await livePace(u.id, id));
});
