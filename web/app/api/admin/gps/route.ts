import { handle, json } from "@/lib/http";
import { requireEditor } from "@/lib/admin";
import { listGps } from "@/lib/admin-content";

export const GET = handle(async (req: Request) => { await requireEditor(req); return json({ courses: await listGps() }); });
