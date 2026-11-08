import { handle, json } from "@/lib/http";
import { requireAdmin, audit } from "@/lib/admin";
import { setLeadStatus } from "@/lib/leads";
/** Admin: PATCH { status: nuevo|contactado|descartado } (audited). */
export const PATCH = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const u = await requireAdmin(req); const { id } = await ctx.params; const b = await req.json().catch(() => ({}));
  const r = await setLeadStatus(id, String(b?.status ?? ""), u.email || u.id);
  await audit(u as any, "lead.status", { type: "contact_lead", id }, `Contacto (${r.kind}) marcado como ${r.status}`);
  return json({ lead: r });
});
