import { handle, json } from "@/lib/http";
import { requireEditor } from "@/lib/admin";
import { q } from "@/lib/db";
import { listCourses } from "@/lib/course-geo";

/** Courses the admin can edit (their clubs' GPS courses + any with strategy) and their progress. */
export const GET = handle(async (req: Request) => {
  const user = await requireEditor(req);
  const courses = await listCourses(user.id);
  // every club with cached GPS geometry, not only the editor's own clubs
  const mine = new Set(courses.map((c: any) => c.club_code));
  for (const { club_code } of await q(`select distinct club_code from vm_course order by 1`)) if (!mine.has(club_code)) courses.push(...(await listCourses(user.id, club_code)).filter((c: any) => c.club_code === club_code));
  const st = await q(`select c.course_id, c.published_at, (c.published is not null) as overview_published, coalesce(c.draft->>'overview','')<>'' as overview_draft,
      (select count(*)::int from hole_strategy h where h.course_id=c.course_id and h.published is not null) as published_holes,
      (select count(*)::int from hole_strategy h where h.course_id=c.course_id and h.draft <> '{}'::jsonb) as draft_holes,
      greatest(c.updated_at, (select max(updated_at) from hole_strategy h where h.course_id=c.course_id)) as updated_at
    from course_strategy c`);
  const ids = new Set(courses.map((c: any) => c.course_id));
  const all = [...courses, ...st.filter((s: any) => !ids.has(s.course_id)).map((s: any) => ({ course_id: s.course_id, label: s.course_id, club_name: null, holes_cached: null }))];
  return json({ courses: all.map((c: any) => { const s = st.find((x: any) => x.course_id === c.course_id);
    return { course_id: c.course_id, label: c.label, club_name: c.club_name, course_key: c.course_key ?? null, holes_cached: c.holes_cached, has_osm: !!c.has_osm,
      published_holes: s?.published_holes ?? 0, draft_holes: s?.draft_holes ?? 0, overview_published: !!s?.overview_published, updated_at: s?.updated_at ?? null }; }) });
});
