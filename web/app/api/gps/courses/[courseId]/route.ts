import { handle, json, requireUser } from "@/lib/http";
import { courseGeometry, distancesFrom, resolveCourseId } from "@/lib/course-geo";

/** Full geometry of a course; optional ?lat=&lng=[&hole=] adds server-computed distances (the app normally computes them on device). */
export const GET = handle(async (req: Request, ctx: { params: Promise<{ courseId: string }> }) => {
  await requireUser(req); const { courseId } = await ctx.params; const u = new URL(req.url);
  const { club_code, vm_course } = await resolveCourseId(decodeURIComponent(courseId));
  const course = await courseGeometry(club_code, vm_course);
  const hole = Number(u.searchParams.get("hole")) || null;
  const distances = u.searchParams.has("lat") ? distancesFrom(course, u.searchParams.get("lat"), u.searchParams.get("lng"), hole) : undefined;
  return Response.json({ course, distances }, { headers: { "Cache-Control": "private, max-age=300" } });   // short: the 06:00 daily read and admin corrections must reach the phone the same morning
});
