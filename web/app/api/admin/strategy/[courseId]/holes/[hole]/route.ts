import { handle, json } from "@/lib/http";
import { adminBody, audit, requireEditor } from "@/lib/admin";
import { adminCourse, checkHole, discardHole, saveHole } from "@/lib/strategy";

type Ctx = { params: Promise<{ courseId: string; hole: string }> };
const one = async (courseId: string, hole: number, userId: string) => (await adminCourse(courseId, userId)).holes.find(h => h.hole === hole) ?? null;
/** Save the hole draft (whole object). Never publishes. */
export const PUT = handle(async (req: Request, ctx: Ctx) => {
  const user = await requireEditor(req); const { courseId, hole } = await ctx.params; const n = checkHole(hole);
  await saveHole(courseId, n, user.id, await adminBody(req));
  await audit(user, "strategy.draft", { type: "course", id: courseId }, `Editó el borrador del hoyo ${n}`, { hole: n }, 30);
  return json({ hole: await one(courseId, n, user.id) });
});
/** Discard unpublished changes (draft = published, or empty). */
export const DELETE = handle(async (req: Request, ctx: Ctx) => {
  const user = await requireEditor(req); const { courseId, hole } = await ctx.params; const n = checkHole(hole);
  await discardHole(courseId, n, user.id);
  await audit(user, "strategy.discard", { type: "course", id: courseId }, `Descartó los cambios del hoyo ${n}`, { hole: n });
  return json({ hole: await one(courseId, n, user.id) });
});
