import { handle, requireUser } from "@/lib/http";
import { greenGeometry } from "@/lib/shot-samples";
/** Green geometry we really have: front/center/back (Golfistics) + nearby OSM hazards. outline = null (not stored; never invented). */
export const GET = handle(async (req: Request, ctx: { params: Promise<{ courseId: string; n: string }> }) => {
  await requireUser(req); const { courseId, n } = await ctx.params;
  return Response.json(await greenGeometry(decodeURIComponent(courseId), Number(n)), { headers: { "Cache-Control": "private, max-age=300" } });
});
