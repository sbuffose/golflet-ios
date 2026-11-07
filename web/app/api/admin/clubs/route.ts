import { handle, json } from "@/lib/http";
import { requireAdmin } from "@/lib/admin";
import { listClubs } from "@/lib/admin-content";

export const GET = handle(async (req: Request) => { await requireAdmin(req); return json({ clubs: await listClubs() }); });
