import { handle, json } from "@/lib/http";
import { adminBody, audit, requireEditor } from "@/lib/admin";
import { publish } from "@/lib/strategy";

/** { holes: [n…] | "all", overview?: bool } -> copies drafts to published. Empty drafts are skipped. */
export const POST = handle(async (req: Request, ctx: { params: Promise<{ courseId: string }> }) => {
  const user = await requireEditor(req); const { courseId } = await ctx.params;
  const r = await publish(courseId, user.id, await adminBody(req));
  if (r.published_holes.length || r.overview_published) await audit(user, "strategy.publish", { type: "course", id: courseId },
    `Publicó ${r.published_holes.length ? "hoyos " + r.published_holes.join(", ") : ""}${r.published_holes.length && r.overview_published ? " y " : ""}${r.overview_published ? "el resumen" : ""}`, r);
  return json(r);
});
