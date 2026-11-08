import { handle, json } from "@/lib/http";
import { requireAdmin, audit } from "@/lib/admin";
import { setClubRequestStatus } from "@/lib/club-requests";

/** Admin: PATCH { status: "resuelto" | "nuevo" } */
export const PATCH = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const u = await requireAdmin(req); const { id } = await ctx.params; const b = await req.json().catch(() => ({}));
  const r = await setClubRequestStatus(id, String(b?.status ?? ""), u.email || u.id);
  await audit(u as any, "club_request.status", { type: "club_request", id }, `Pedido de club marcado como ${r.status}`);
  return json({ request: r });
});
