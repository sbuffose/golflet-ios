import { handle, json } from "@/lib/http";
import { adminBody, requireEditor } from "@/lib/admin";
import { setGreen } from "@/lib/admin-content";
import { checkHole } from "@/lib/strategy";

type Ctx = { params: Promise<{ courseId: string; hole: string }> };
/** { front?, center?, back? : {lat,lng} } — points equal to Golfistics are dropped; {} restores the hole. */
export const PUT = handle(async (req: Request, ctx: Ctx) => { const u = await requireEditor(req); const { courseId, hole } = await ctx.params; return json(await setGreen(u, courseId, checkHole(hole), await adminBody(req))); });
export const DELETE = handle(async (req: Request, ctx: Ctx) => {
  const u = await requireEditor(req); const { courseId, hole } = await ctx.params;
  if (!(req.headers.get("content-type") || "").includes("application/json")) return json({ error: "Mandá JSON" }, 415);
  return json(await setGreen(u, courseId, checkHole(hole), {}));
});
