import { handle, json } from "@/lib/http";
import { adminBody, audit, requireEditor } from "@/lib/admin";
import { adminCourse, saveOverview } from "@/lib/strategy";

export const maxDuration = 60;
type Ctx = { params: Promise<{ courseId: string }> };
/** Geometry + draft + published + status for all holes. */
export const GET = handle(async (req: Request, ctx: Ctx) => {
  const user = await requireEditor(req); const { courseId } = await ctx.params;
  return json(await adminCourse(courseId, user.id));
});
/** { overview } -> saves the course overview draft. */
export const PUT = handle(async (req: Request, ctx: Ctx) => {
  const user = await requireEditor(req); const { courseId } = await ctx.params;
  await saveOverview(courseId, user.id, await adminBody(req));
  await audit(user, "strategy.overview", { type: "course", id: courseId }, "Editó el resumen de la cancha (borrador)", null, 30);
  return json((await adminCourse(courseId, user.id)).overview);
});
