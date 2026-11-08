import { handle, json, HttpError } from "@/lib/http";
import { adminBody, audit, requireEditor } from "@/lib/admin";
import { q } from "@/lib/db";
import { slug } from "@/lib/viewmaster-parse";

/** PUT { enabled } → "Lectura diaria 6:00" for one course (admin + editor). */
export const PUT = handle(async (req: Request, ctx: { params: Promise<{ courseId: string }> }) => {
  const u = await requireEditor(req); const { courseId } = await ctx.params; const b = await adminBody(req);
  const m = /^(\d{1,5})-[a-z0-9-]{1,80}$/.exec(courseId); if (!m) throw new HttpError(404, "Cancha no encontrada");
  const r = (await q(`select vm_course from vm_course where club_code=$1`, [m[1]])).find((x: any) => slug(m[1], x.vm_course) === courseId);
  if (!r) throw new HttpError(404, "Cancha no encontrada");
  await q(`update vm_course set daily_read=$3, daily_read_by=$4 where club_code=$1 and vm_course=$2`, [m[1], r.vm_course, !!b.enabled, u.id]);
  await audit(u, "green.daily_toggle", { type: "gps_course", id: courseId }, `Lectura diaria 6:00 ${b.enabled ? "activada" : "desactivada"} para ${r.vm_course}`);
  return json({ ok: true, daily_read: !!b.enabled });
});
