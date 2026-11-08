import { handle, json } from "@/lib/http";
import { requireAdmin } from "@/lib/admin";
import { adminReports } from "@/lib/pins";
/** Admin only. GET ?status=open|cleared|moved|dismissed → "Bandera mal registrada" reports (reporter only as a short tag). */
export const GET = handle(async (req: Request) => {
  await requireAdmin(req); const st = new URL(req.url).searchParams.get("status");
  return json(await adminReports(st && ["open", "cleared", "moved", "dismissed"].includes(st) ? st : null));
});
