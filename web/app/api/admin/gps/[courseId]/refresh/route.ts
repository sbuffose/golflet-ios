import { handle, json } from "@/lib/http";
import { adminBody, requireEditor } from "@/lib/admin";
import { refreshGps } from "@/lib/admin-content";

export const maxDuration = 30;
/** Re-read greens from Golfistics' public read-only endpoint (overrides are kept). */
export const POST = handle(async (req: Request, ctx: { params: Promise<{ courseId: string }> }) => {
  const u = await requireEditor(req); const { courseId } = await ctx.params; await adminBody(req);
  return json(await refreshGps(u, courseId));
});
