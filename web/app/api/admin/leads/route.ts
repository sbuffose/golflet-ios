import { handle, json } from "@/lib/http";
import { requireAdmin } from "@/lib/admin";
import { listLeads } from "@/lib/leads";
/** Admin: ?kind=profesor|marca|contacto[&status=nuevo|contactado|descartado|convertido] → { leads } newest first. */
export const GET = handle(async (req: Request) => {
  await requireAdmin(req); const u = new URL(req.url), s = u.searchParams.get("status");
  return json({ leads: await listLeads(u.searchParams.get("kind") || "", s && ["nuevo", "contactado", "descartado", "convertido"].includes(s) ? s : null) });
});
