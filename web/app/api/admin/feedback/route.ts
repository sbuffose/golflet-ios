import { handle, json } from "@/lib/http";
import { requireAdmin } from "@/lib/admin";
import { listFeedback } from "@/lib/feedback";
/** Admin: ?status=nuevo|leido|archivado → { feedback } newest first (anonymous: no sender fields exist). */
export const GET = handle(async (req: Request) => {
  await requireAdmin(req); const s = new URL(req.url).searchParams.get("status");
  return json({ feedback: await listFeedback(s && ["nuevo", "leido", "archivado"].includes(s) ? s : null) });
});
