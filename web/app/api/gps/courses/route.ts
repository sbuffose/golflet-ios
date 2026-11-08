import { handle, json, requireUser, HttpError } from "@/lib/http";
import { courseByKey, listCourses, nearbyCourses } from "@/lib/course-geo";
import { boundedCourseKey } from "@/lib/quick-stats";
import { validLatLng } from "@/lib/geo";

/** GET -> courses of the user's clubs; ?club=<CodigoClub> adds another club; ?lat=&lng= -> {nearby:[...]} too.
 *  ?course_key=clubId:name reads that one club and does not list the catalog. */
export const GET = handle(async (req: Request) => {
  const user = await requireUser(req); const u = new URL(req.url);
  if (u.searchParams.has("course_key")) {
    const parsed = boundedCourseKey(u.searchParams.get("course_key"));
    return json({ courses: parsed ? await courseByKey(user.id, parsed.clubId, parsed.name) : [] });
  }
  const club = u.searchParams.get("club"); if (club && !/^\d{1,5}$/.test(club)) throw new HttpError(400, "Club inválido");
  const courses = await listCourses(user.id, club);
  const pos = u.searchParams.has("lat") ? validLatLng(u.searchParams.get("lat"), u.searchParams.get("lng")) : null;
  return json({ courses, nearby: pos ? await nearbyCourses(pos, 10) : undefined });
});
