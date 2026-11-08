import { handle, json } from "@/lib/http";
import { requireAdmin } from "@/lib/admin";
import { adminVideos } from "@/lib/explainers";
/** Admin only: every explainer with its per-network URLs (null = not set). */
export const GET = handle(async (req: Request) => { await requireAdmin(req); return json(await adminVideos()); });
