import { handle, json } from "@/lib/http";
import { requireEditor, audit, adminBody } from "@/lib/admin";
import { adminCourses, paceTable, setPace } from "@/lib/pace";
/** Admin/editor: GET → { courses, defaults }. PUT { club_id|null, course|null, values:{ medal:{ "4": 13.9 | null (inherit) }, … } } (audited). */
export const GET = handle(async (req: Request) => { await requireEditor(req); return json({ courses: await adminCourses(), defaults: await paceTable(null, null) }); });
export const PUT = handle(async (req: Request) => {
  const u = await requireEditor(req); const b = await adminBody(req);
  const clubId = b?.club_id == null ? null : Number(b.club_id), course = b?.course ? String(b.course) : null;
  const n = await setPace(clubId, course, b?.values, u.email || u.id);
  await audit(u as any, "pace.set", { type: "pace", id: clubId == null ? "default" : `${clubId}:${course ?? "*"}` }, `Ritmo de juego ${clubId == null ? "por defecto" : course ? course : "club"}: ${n} valores`, b?.values);
  return json({ updated: n, table: await paceTable(clubId, course) });
});
