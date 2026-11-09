import { handle, json, HttpError } from "@/lib/http";
import { requireEditor } from "@/lib/admin";
import { courseEvidence, TRACE_IMAGERY } from "@/lib/trace-review";

export const GET = handle(async (req: Request, ctx: { params: Promise<{ club: string; course: string }> }) => {
  await requireEditor(req);
  const { club, course } = await ctx.params;
  const found = courseEvidence(club, decodeURIComponent(course));
  if (!found) throw new HttpError(404, "Esa cancha no está en el lote de Argentina que ya tenemos en el repo.");
  return json({ imagery: TRACE_IMAGERY, course: found, schema: "0046 preparada, no aplicada" });
});
