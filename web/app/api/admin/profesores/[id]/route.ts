import { handle, json, HttpError } from "@/lib/http";
import { requireAdmin, audit } from "@/lib/admin";
import { setProfesorFlags } from "@/lib/profesor-admin";
/** Admin only: PATCH { verified?, active? } (verified badge; active = visible to players). Audited. */
export const PATCH = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const u = await requireAdmin(req); const { id } = await ctx.params; let b: any; try { b = await req.json(); } catch { throw new HttpError(400, "JSON inválido"); }
  const r = await setProfesorFlags(id, b, u.email || u.id);
  await audit(u as any, "profesor.flags", { type: "profesor", id }, `Profesor: verificado=${r.verified ? "sí" : "no"}, visible=${r.active ? "sí" : "no"}`);
  return json({ profesor: r });
});
