import { handle, json } from "@/lib/http";
import { requireAdmin, audit } from "@/lib/admin";
import { convertLead } from "@/lib/profesor-admin";
/** Admin: "Profesores interesados" → pending profesor record (name, phone, place, AAG matrícula from the application). */
export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const u = await requireAdmin(req); const { id } = await ctx.params; const r = await convertLead(id, u.email || u.id);
  await audit(u as any, "lead.convert", { type: "contact_lead", id }, "Convirtió un profesor interesado en profesor pendiente");
  return json(r, 201);
});
