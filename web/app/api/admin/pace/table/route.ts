import { handle, json } from "@/lib/http";
import { requireEditor } from "@/lib/admin";
import { paceTable, coursePars } from "@/lib/pace";
import { q } from "@/lib/db";
/** Admin/editor: GET ?club_id=&course= → table for that scope + the scope's own overrides (to tell inherited from set). */
export const GET = handle(async (req: Request) => {
  await requireEditor(req); const s = new URL(req.url).searchParams; const c = s.get("club_id"), clubId = c ? Number(c) : null, course = s.get("course") || null;
  const own = await q(`select modality, players, min_per_hole, updated_by, updated_at from pace_estimate where coalesce(club_id,0)=coalesce($1::int,0) and coalesce(course,'')=coalesce($2::text,'')`, [clubId, course]);
  const [club] = clubId ? await q(`select name from club where id=$1`, [clubId]) : [null];
  return json({ ...(await paceTable(clubId, course)), club_name: club?.name ?? null, own, has_pars: (await coursePars(clubId, course)).length > 0 });
});
