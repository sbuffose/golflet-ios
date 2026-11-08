import { handle, json } from "@/lib/http";
import { requireAdmin } from "@/lib/admin";
import { listClubRequests } from "@/lib/club-requests";

/** Admin: "Pedidos de club", newest first. ?status=nuevo|resuelto */
export const GET = handle(async (req: Request) => {
  await requireAdmin(req); const s = new URL(req.url).searchParams.get("status");
  return json({ requests: await listClubRequests(s === "nuevo" || s === "resuelto" ? s : null) });
});
