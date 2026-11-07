import { handle, json } from "@/lib/http";
import { requireAdmin } from "@/lib/admin";
import { listAudit } from "@/lib/admin-content";

export const GET = handle(async (req: Request) => { await requireAdmin(req); return json(await listAudit(new URL(req.url).searchParams)); });
