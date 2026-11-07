import { handle, json } from "@/lib/http";
import { requireAdmin } from "@/lib/admin";
import { userDetail } from "@/lib/admin-content";

export const GET = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  await requireAdmin(req); const { id } = await ctx.params;
  return json(await userDetail(id));
});
