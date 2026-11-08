import { handle, json, HttpError } from "@/lib/http";
import { requireAdmin, audit } from "@/lib/admin";
import { linkLead } from "@/lib/profesor-admin";
/** Admin: "Vincular a profesor existente". POST { profesor_id, overwrite?: ("phone"|"aag_matricula")[], dry_run? } → { profesor, plan[{field,current,incoming,action}], applied }. */
export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const u = await requireAdmin(req); const { id } = await ctx.params; let b: any; try { b = await req.json(); } catch { throw new HttpError(400, "JSON inválido"); }
  const r = await linkLead(id, b, u.email || u.id);
  if (r.applied) await audit(u as any, "lead.link", { type: "contact_lead", id }, `Vinculó un profesor interesado a ${r.profesor.name} (${r.plan.filter(x => ["fill", "replace", "merge"].includes(x.action)).map(x => x.label).join(", ") || "sin cambios de datos"})`);
  return json(r, r.applied ? 201 : 200);
});
