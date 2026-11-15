import { handle, json, requireUser, HttpError } from "@/lib/http";
import { courseByKey, listCourses, nearbyCourses } from "@/lib/course-geo";
import { matchCatalog, namedCatalog, type CatalogHit } from "@/lib/course-search";
import { clubNames } from "@/lib/course-names";
import { getAllCanchas } from "@/lib/viewmaster";
import { boundedCourseKey } from "@/lib/quick-stats";
import { validLatLng } from "@/lib/geo";

const publicCourse = (h: CatalogHit) => ({
  course_id: h.course_id, club_code: h.club_code, club_name: h.club_name, course_label: h.course_label,
  label: h.course_label, vm_course: h.vm_course, lat: h.lat ?? null, lng: h.lng ?? null, mine: false,
});

/** Cached ViewMaster list with directory and Golflet names. Throws if the catalog cannot be read. */
async function preloadedCatalog() {
  const all = await getAllCanchas();
  const names = await clubNames([...new Set(all.map(r => r.club_code))]);
  return { all, names, catalog: namedCatalog(all, names).map(publicCourse) };
}

/** GET -> courses of the user's clubs; ?club=<CodigoClub> adds another club; ?lat=&lng= -> {nearby:[...]} too.
 *  ?q= searches the ViewMaster catalog (any club) and does not change memberships.
 *  ?course_key=clubId:name reads that one club and does not list the catalog. */
export const GET = handle(async (req: Request) => {
  const user = await requireUser(req); const u = new URL(req.url);
  if (u.searchParams.has("course_key")) {
    const parsed = boundedCourseKey(u.searchParams.get("course_key"));
    return json({ courses: parsed ? await courseByKey(user.id, parsed.clubId, parsed.name) : [] });
  }
  const q = (u.searchParams.get("q") || "").trim();
  if (u.searchParams.has("q")) {
    if (q.length > 80) throw new HttpError(400, "Búsqueda demasiado larga");
    const { all, names, catalog } = await preloadedCatalog();
    const found = matchCatalog(all, q, 12, names);
    return json({
      courses: found.hits.map(publicCourse),
      coverage: { catalog: found.catalog, clubs: found.clubs, shown: found.hits.length, truncated: found.truncated },
      reason: found.reason,
      catalog,
    });
  }
  const club = u.searchParams.get("club"); if (club && !/^\d{1,5}$/.test(club)) throw new HttpError(400, "Club inválido");
  const courses = await listCourses(user.id, club);
  const pos = u.searchParams.has("lat") ? validLatLng(u.searchParams.get("lat"), u.searchParams.get("lng")) : null;
  let catalog: ReturnType<typeof publicCourse>[] = [];
  try { catalog = (await preloadedCatalog()).catalog; } catch { catalog = []; }
  return json({ courses, nearby: pos ? await nearbyCourses(pos, 10) : undefined, catalog });
});
