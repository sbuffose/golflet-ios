import { handle, json } from "@/lib/http";
import { adminBody, audit, requireEditor } from "@/lib/admin";
import { unpublish } from "@/lib/strategy";

/** { holes: [n…] | "all", overview?: bool } -> hides from players (drafts are kept). */
export const POST = handle(async (req: Request, ctx: { params: Promise<{ courseId: string }> }) => {
  const user = await requireEditor(req); const { courseId } = await ctx.params; const b = await adminBody(req);
  const r = await unpublish(courseId, b);
  await audit(user, "strategy.unpublish", { type: "course", id: courseId }, `Despublicó ${b?.holes === "all" ? "toda la cancha" : Array.isArray(b?.holes) && b.holes.length ? "hoyos " + b.holes.join(", ") : "el resumen"}`, { holes: b?.holes ?? null, overview: b?.overview === true });
  return json(r);
});
