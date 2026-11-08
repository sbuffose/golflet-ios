import { handle, json } from "@/lib/http";
import { requireAdmin, audit } from "@/lib/admin";
import { setFeedbackStatus } from "@/lib/feedback";
/** Admin: PATCH { status: nuevo|leido|archivado } (audited). */
export const PATCH = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const u = await requireAdmin(req); const { id } = await ctx.params; const b = await req.json().catch(() => ({}));
  const r = await setFeedbackStatus(id, String(b?.status ?? ""), u.email || u.id);
  await audit(u as any, "feedback.status", { type: "feedback", id }, `Feedback marcado como ${r.status}`);
  return json({ feedback: r });
});
