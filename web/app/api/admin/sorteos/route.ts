import { handle, json } from "@/lib/http";
import { requireAdmin, audit } from "@/lib/admin";
import { adminList, adminCreate } from "@/lib/sorteos";
/** Admin only: list; POST { title, prize, description?, sponsor?, bases, starts_at?, ends_at } → borrador. */
export const GET = handle(async (req: Request) => { await requireAdmin(req); return json(await adminList()); });
export const POST = handle(async (req: Request) => {
  const u = await requireAdmin(req); const r = await adminCreate(u.email || u.id, await req.json().catch(() => null));
  await audit(u as any, "sorteo.create", { type: "sorteo", id: r.sorteo.id }, `Sorteo creado: ${r.sorteo.title}`); return json(r, 201);
});
