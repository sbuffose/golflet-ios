import { handle, json } from "@/lib/http";
import { requireAdmin } from "@/lib/admin";
import { detail } from "@/lib/admin-metrics";

export const maxDuration = 60;
/** The list behind a dashboard number, with filters (see API_v5.md §5). */
export const GET = handle(async (req: Request, ctx: { params: Promise<{ metric: string }> }) => {
  await requireAdmin(req); const { metric } = await ctx.params;
  return json(await detail(metric, new URL(req.url).searchParams));
});
