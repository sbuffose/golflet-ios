import { handle, json, HttpError } from "@/lib/http";
import { adminBody, audit, requireEditor } from "@/lib/admin";
import { q } from "@/lib/db";
import { slug } from "@/lib/viewmaster-parse";

/** DELETE { hole } → mark a "Golfistics moved a point you corrected" flag as reviewed (the manual correction stays). */
export const DELETE = handle(async (req: Request, ctx: { params: Promise<{ courseId: string }> }) => {
  const u = await requireEditor(req); const { courseId } = await ctx.params; const b = await adminBody(req);
  const m = /^(\d{1,5})-[a-z0-9-]{1,80}$/.exec(courseId); if (!m) throw new HttpError(404, "Cancha no encontrada");
  const r = (await q(`select vm_course, review from vm_course where club_code=$1`, [m[1]])).find((x: any) => slug(m[1], x.vm_course) === courseId);
  if (!r) throw new HttpError(404, "Cancha no encontrada");
  const review = { ...(r.review || {}) }; delete review[String(Number(b.hole))];
  await q(`update vm_course set review=$3 where club_code=$1 and vm_course=$2`, [m[1], r.vm_course, Object.keys(review).length ? JSON.stringify(review) : null]);
  await audit(u, "green.review_done", { type: "gps_course", id: courseId }, `Revisado el hoyo ${Number(b.hole)} de ${r.vm_course}`);
  return json({ ok: true });
});
