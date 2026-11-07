import { handle, json, requireUser } from "@/lib/http";
import { markAlerted } from "@/lib/pace";
/** POST → { pace_alert_at } — call after showing the hole-10 alert, so it is shown once per round. Idempotent. */
export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const u = await requireUser(req); const { id } = await ctx.params;
  return json({ pace_alert_at: await markAlerted(u.id, id) });
});
