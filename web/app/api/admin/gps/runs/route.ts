import { handle, json } from "@/lib/http";
import { requireEditor } from "@/lib/admin";
import { q } from "@/lib/db";

/** GET ?course=<id>&status=failed&days=2 → run history (newest first, max 200). */
export const GET = handle(async (req: Request) => {
  await requireEditor(req);
  const u = new URL(req.url), course = u.searchParams.get("course"), status = u.searchParams.get("status"), days = Math.min(90, Math.max(1, Number(u.searchParams.get("days")) || 30));
  const runs = await q(`select id, course_id, club_code, vm_course, trigger, actor_email, started_at, finished_at, status, changed_holes, conflicts, detail, message from gps_read_run
    where started_at > now() - make_interval(days => $1::int) and ($2::text is null or course_id=$2) and ($3::text is null or status=$3) order by started_at desc limit 200`, [days, course, status]);
  return json({ runs });
});
