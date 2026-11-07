import { handle, json } from "@/lib/http";
import { requireAdmin, audit } from "@/lib/admin";
import { adminGet, adminUpdate } from "@/lib/sorteos";
/** Admin only: detail with entries; PATCH fields and/or { status } (borrador→abierto→cerrado, any→cancelado). Bases are locked once someone entered. */
export const GET = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => { await requireAdmin(req); return json(await adminGet((await ctx.params).id)); });
export const PATCH = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const u = await requireAdmin(req); const { id } = await ctx.params; const b = await req.json().catch(() => ({}));
  const r = await adminUpdate(id, b); await audit(u as any, "sorteo.update", { type: "sorteo", id }, b?.status ? `Sorteo → ${b.status}` : "Sorteo editado", { fields: Object.keys(b || {}) }); return json(r);
});
