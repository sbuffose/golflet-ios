import { handle, json } from "@/lib/http";
import { requireAdmin } from "@/lib/admin";
import { listRoles, revokeRole } from "@/lib/admin-content";

export const DELETE = handle(async (req: Request, ctx: { params: Promise<{ userId: string }> }) => {
  const u = await requireAdmin(req); const { userId } = await ctx.params;
  if (!(req.headers.get("content-type") || "").includes("application/json")) return json({ error: "Mandá JSON" }, 415);
  const r = await revokeRole(u, userId);
  return json({ ...r, roles: await listRoles() });
});
