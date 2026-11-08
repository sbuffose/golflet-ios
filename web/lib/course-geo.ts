import { q } from "./db";
import { HttpError } from "./http";
import { getAllCanchas, getClubCourses, getVmCourse, greenWarnings, matchOurCourse, slug, type VmHole } from "./viewmaster";
import { clubNames, namingFields } from "./course-names";
import { applyGreenOverride, applyHolesOverride, parTotal } from "./course-override";
import { greenDistances, haversine, validLatLng, type LatLng } from "./geo";

type OurCourse = { club_id: number; club_name: string; code: string; name: string; par: number | null; holes: any[] };

async function ourCoursesByCode(codes: string[]): Promise<OurCourse[]> {
  if (!codes.length) return [];
  const rows = await q(`select c.id as club_id, c.name as club_name, c.code, co.name, co.par, co.holes, co.holes_override from club c join course co on co.club_id=c.id where c.code = any($1)`, [codes]);
  return rows.map((r: any) => { const holes = applyHolesOverride(r.holes, r.holes_override); return { club_id: r.club_id, club_name: r.club_name, code: r.code, name: r.name, holes, par: r.holes_override ? parTotal(holes) ?? r.par : r.par }; });
}
export async function userClubCodes(userId: string): Promise<{ code: string; club_id: number; club_name: string }[]> {
  return q(`select distinct c.code, c.id as club_id, c.name as club_name from club_account a join club c on c.id=a.club_id where a.user_id=$1 and c.code is not null order by c.id`, [userId]);
}

async function rowsForCodes(clubs: { code: string; club_id: number; club_name: string }[], codes: string[]) {
  const ours = await ourCoursesByCode(codes);
  const names = await clubNames(codes);
  const out = [];
  for (const code of codes) {
    let vms: string[] = [];
    try { vms = await getClubCourses(code); } catch { vms = []; }
    const mine = ours.filter(o => o.code === code);
    const cached = vms.length ? await q(`select vm_course, jsonb_array_length(holes) as n, (osm is not null) as has_osm, fetched_at from vm_course where club_code=$1 and vm_course = any($2)`, [code, vms]) : [];
    const src = { ...names.get(code), golflet: names.get(code)?.golflet || mine[0]?.club_name || clubs.find(c => c.code === code)?.club_name || null };
    for (const vm of vms) {
      const our = matchOurCourse(vm, mine.map(m => m.name));
      const c = cached.find((x: any) => x.vm_course === vm);
      const n = namingFields(code, vm, vms, src, our);
      // `label` and `club_name` are the human-readable names older iOS builds already show; `course` stays our card name (null = not linked).
      out.push({ course_id: slug(code, vm), ...n, vm_course: vm, course: our || n.course_label, course_key: our && mine[0] ? `${mine[0].club_id}:${our}` : null, label: n.course_label,
        holes_cached: c ? Number(c.n) : 0, has_osm: !!c?.has_osm, last_read_at: c?.fetched_at ?? null, mine: clubs.some(c => c.code === code) });
    }
  }
  return out;
}

/** ViewMaster courses of the user's clubs (+ an optional extra club code), mapped to our course names. */
export async function listCourses(userId: string, extraClub?: string | null) {
  const clubs = await userClubCodes(userId);
  const codes = [...new Set([...clubs.map(c => c.code), ...(extraClub ? [extraClub] : [])])];
  return rowsForCodes(clubs, codes);
}

/** One club, one course. Does not walk the rest of the catalog. */
export async function courseByKey(userId: string, clubId: string, courseName: string) {
  const clubs = await userClubCodes(userId);
  const club = clubs.find(c => String(c.club_id) === clubId);
  if (!club?.code) return [];
  const rows = await rowsForCodes(clubs, [club.code]);
  const key = `${clubId}:${courseName}`;
  return rows.filter(row => row.course_key === key);
}

/** Nearby ViewMaster courses (any club) sorted by distance from lat/lng. */
export async function nearbyCourses(pos: LatLng, limit = 10) {
  const all = await getAllCanchas();
  const near = all.map(c => ({ c, d: Math.round(haversine(pos, c) / 100) / 10 })).sort((a, b) => a.d - b.d).slice(0, limit);
  const codes = [...new Set(near.map(x => x.c.club_code))];
  const [names, ours] = await Promise.all([clubNames(codes), ourCoursesByCode(codes)]);
  return near.map(({ c, d }) => {
    const siblings = all.filter(x => x.club_code === c.club_code).map(x => x.vm_course);
    const mine = ours.filter(o => o.code === c.club_code), our = mine.length ? matchOurCourse(c.vm_course, mine.map(m => m.name)) : null;
    const n = namingFields(c.club_code, c.vm_course, siblings, { ...names.get(c.club_code), golfistics: c.club }, our);
    return { course_id: slug(c.club_code, c.vm_course), ...n, vm_course: c.vm_course, course: n.course_label, label: n.course_label, distance_km: d };
  });
}

/** course_id slug ("118-jockey-azul") -> {club_code, vm_course}. */
export async function resolveCourseId(courseId: string): Promise<{ club_code: string; vm_course: string }> {
  const m = /^(\d{1,5})-[a-z0-9-]+$/.exec(courseId || ""); if (!m) throw new HttpError(404, "Cancha no encontrada");
  const code = m[1];
  const vms = await getClubCourses(code);
  const vm = vms.find(v => slug(code, v) === courseId); if (!vm) throw new HttpError(404, "Cancha no encontrada");
  return { club_code: code, vm_course: vm };
}

/** Full geometry for every hole: green front/center/back (Golfistics) + par/hcp/yards (our course card) + tee/line/hazards (OSM, when mapped). */
export async function courseGeometry(clubCode: string, vmCourse: string) {
  const raw = await getVmCourse(clubCode, vmCourse);
  const [ov] = await q(`select green_override, override_at from vm_course where club_code=$1 and vm_course=$2`, [clubCode, vmCourse]);
  const row = { ...raw, holes: applyGreenOverride(raw.holes as VmHole[], ov?.green_override) };
  const ours = await ourCoursesByCode([clubCode]);
  const ourName = matchOurCourse(vmCourse, ours.map(o => o.name));
  const our = ours.find(o => o.name === ourName) || null;
  let siblings: string[] = [vmCourse]; try { siblings = await getClubCourses(clubCode); } catch { /* keep single */ }
  const nm = namingFields(clubCode, vmCourse, siblings.length ? siblings : [vmCourse], { ...(await clubNames([clubCode])).get(clubCode), golflet: ours[0]?.club_name ?? null }, ourName);
  const osm = row.osm?.holes || {};
  const holes = (row.holes as VmHole[]).map(h => {
    const card = our?.holes?.find((x: any) => x.hole === h.hole);
    const x = osm[String(h.hole)] || null;
    return { hole: h.hole, par: card?.par ?? null, hcp: card?.hcp ?? null, yards: card?.yards ?? {},
      green: { front: h.front, center: h.center, back: h.back },
      tee: x?.tee ?? null, line: x?.line ?? null, hazards: x?.hazards ?? [] };
  });
  return {
    course_id: slug(clubCode, vmCourse), ...nm, vm_course: vmCourse,
    last_read_at: row.fetched_at ?? null, greens_updated_at: [row.fetched_at, ov?.override_at].filter(Boolean).map((d: any) => new Date(d)).sort((a, b) => +b - +a)[0] ?? null,
    course: ourName || nm.course_label, course_key: our ? `${our.club_id}:${our.name}` : null, par: our?.par ?? null,
    hole_count: holes.length, complete: holes.length >= 18 && [...Array(18)].every((_, i) => holes.some(h => h.hole === i + 1)),
    holes, warnings: greenWarnings(row.holes),
    sources: { greens: "golfistics_viewmaster", greens_fetched_at: row.fetched_at, extras: row.osm ? "openstreetmap" : null, extras_fetched_at: row.osm?.fetched_at ?? null,
      attribution: row.osm ? "Greens: sistema del club. Tees y obstáculos: © OpenStreetMap contributors (ODbL)." : "Greens: sistema del club." },
  };
}

export function distancesFrom(geo: Awaited<ReturnType<typeof courseGeometry>>, lat: unknown, lng: unknown, hole?: number | null) {
  const pos = validLatLng(lat, lng); if (!pos) throw new HttpError(400, "Posición inválida");
  const hs = hole ? geo.holes.filter(h => h.hole === hole) : geo.holes;
  return hs.map(h => ({ hole: h.hole, ...greenDistances(pos, h.green),
    hazards: h.hazards.map((z: any) => ({ type: z.type, distance_m: Math.round(haversine(pos, z)), distance_yd: Math.round(haversine(pos, z) / 0.9144) })) }));
}
