import { handle, json, HttpError } from "@/lib/http";
import { adminBody, audit, requireEditor } from "@/lib/admin";
import { courseEvidence } from "@/lib/trace-review";
import { saveTrace } from "@/lib/course-trace";

/** Preview when confirm is false. Guardar writes only after 0046. Cancel never calls this. */
export const PUT = handle(async (req: Request, ctx: { params: Promise<{ club: string; course: string; hole: string }> }) => {
  const u = await requireEditor(req);
  const { club, course, hole } = await ctx.params;
  const n = Number(hole);
  const found = courseEvidence(club, decodeURIComponent(course));
  if (!found || n < 1 || n > 18) throw new HttpError(404, "Hoyo no encontrado en este lote.");
  const body = await adminBody(req);
  const saved = await saveTrace(u.id, found, n, body);
  if (saved.saved) await audit(u, "trace.save", { type: "course_trace", id: `${found.club_code}:${found.course}:${n}` }, `Trazado ${saved.preview.status} del hoyo ${n} de ${found.course}`);
  return json(saved);
});
