import { handle, json } from "@/lib/http";
import { adminBody, audit, requireEditor } from "@/lib/admin";
import { checkHole, prefill } from "@/lib/strategy";

export const maxDuration = 60;
/** { holes?: [n…] (default all), replace?: bool (replace earlier map hazards; manual ones are kept) } -> hazards added to drafts. */
export const POST = handle(async (req: Request, ctx: { params: Promise<{ courseId: string }> }) => {
  const user = await requireEditor(req); const { courseId } = await ctx.params; const b = await adminBody(req);
  const holes = Array.isArray(b?.holes) ? b.holes.map(checkHole) : null;
  const r: any = await prefill(courseId, user.id, holes, b?.replace === true);
  await audit(user, "strategy.prefill", { type: "course", id: courseId }, `Precargó peligros desde el mapa (${r?.total_added ?? 0} agregados, borrador)`, { holes, total_added: r?.total_added ?? 0 });
  return json(r);
});
