import { handle, json } from "@/lib/http";
import { requireAdmin, audit } from "@/lib/admin";
import { adminDraw } from "@/lib/sorteos";
/** Admin only: draws the winner (crypto random) once closed. One time only. */
export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const u = await requireAdmin(req); const { id } = await ctx.params; const r = await adminDraw(id, u.email || u.id);
  await audit(u as any, "sorteo.draw", { type: "sorteo", id }, `Sorteo sorteado entre ${r.sorteo.draw_info?.entries} participantes`); return json(r);
});
