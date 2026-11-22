import { handle, json, requireUser } from "@/lib/http";
import { courseGeometry, distancesFrom, resolveCourseId } from "@/lib/course-geo";
import { isJockeyAzul } from "@/lib/azul-osm";
import { AZUL_NINE_SWAP_FROM, azulCurrentLayout, relabelAzulHoles } from "@/lib/azul-layout";

/** Full geometry of a course; optional ?lat=&lng=[&hole=] adds server-computed distances (the app normally computes them on device). */
export const GET = handle(async (req: Request, ctx: { params: Promise<{ courseId: string }> }) => {
  await requireUser(req); const { courseId } = await ctx.params; const u = new URL(req.url);
  const { club_code, vm_course } = await resolveCourseId(decodeURIComponent(courseId));
  const playedOn = u.searchParams.get("played_on"), layout = u.searchParams.get("layout");
  const stored = await courseGeometry(club_code, vm_course);
  const current = isJockeyAzul(stored.club_code, stored.course || stored.vm_course) && azulCurrentLayout(playedOn, layout);
  const course = current
    ? { ...stored, layout: "current", layout_from: AZUL_NINE_SWAP_FROM, holes: relabelAzulHoles(stored.holes || [], playedOn, "current") }
    : stored;
  const hole = Number(u.searchParams.get("hole")) || null;
  const distances = u.searchParams.has("lat") ? distancesFrom(course, u.searchParams.get("lat"), u.searchParams.get("lng"), hole) : undefined;
  return Response.json({ course, distances }, { headers: { "Cache-Control": "private, max-age=300" } });   // short: the 06:00 daily read and admin corrections must reach the phone the same morning
});
