import { handle, json, requireUser } from "@/lib/http";
import { paceTable, resolveRef } from "@/lib/pace";
/** GET ?course_id= | ?club_id=&course= → { values: { medal: { 1:{min_per_hole,total_18_min,scope,source}, … }, … } } (scope: course | club | default). */
export const GET = handle(async (req: Request) => {
  await requireUser(req); const r = await resolveRef(new URL(req.url).searchParams);
  return json(await paceTable(r.clubId, r.course));
});
