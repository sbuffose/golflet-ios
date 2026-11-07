/** Course strategy storage: drafts edited by admins, published copies read by players. */
import { q } from "./db";
import { HttpError } from "./http";
import { courseGeometry, resolveCourseId } from "./course-geo";
import { holeStatus, isEmptyHole, mergeHazards, normalizeHole, normalizeOverview, prefillHazards, publicHole, type HoleStrategy } from "./strategy-parse";
import { jockeyFallback } from "./jockey-plans";
import { mdpFallback } from "./mdp-plans";

const COURSE_ID = /^\d{1,5}-[a-z0-9-]{1,80}$/;
export function checkCourseId(id: string) { if (!COURSE_ID.test(id || "")) throw new HttpError(404, "Cancha no encontrada"); return id; }
export function checkHole(h: unknown) { const n = Number(h); if (!Number.isInteger(n) || n < 1 || n > 18) throw new HttpError(400, "Hoyo inválido (1–18)"); return n; }

/** Players: published only. By GPS course id or by our course key ("1:Azul"). */
export async function publishedStrategy(by: { course_id?: string | null; course_key?: string | null }) {
  const [c] = by.course_id ? await q(`select * from course_strategy where course_id=$1`, [checkCourseId(by.course_id)])
    : by.course_key ? await q(`select * from course_strategy where course_key=$1 order by updated_at desc limit 1`, [String(by.course_key).slice(0, 120)]) : [];
  const courseId = c?.course_id || by.course_id || null;
  const holes = courseId ? await q(`select hole, published, published_at from hole_strategy where course_id=$1 and published is not null order by hole`, [courseId]) : [];
  const out = {
    course_id: courseId, course_key: c?.course_key ?? by.course_key ?? null,
    overview: c?.published?.overview || null, overview_published_at: c?.published_at ?? null,
    holes: holes.map((h: any) => ({ ...publicHole(h.hole, h.published), published_at: h.published_at })),
    published_holes: holes.map((h: any) => h.hole),
  };
  if (!out.holes.length) {
    const lookup = out.course_key || by.course_key || out.course_id || by.course_id;
    const fb = jockeyFallback(lookup) || mdpFallback(lookup);
    if (fb) return { ...fb, course_id: out.course_id || fb.course_id, course_key: out.course_key || fb.course_key };
  }
  return out;
}
export async function publishedCourses() {
  return q(`select c.course_id, c.course_key, (c.published is not null and coalesce(c.published->>'overview','')<>'') as has_overview,
      (select count(*)::int from hole_strategy h where h.course_id=c.course_id and h.published is not null) as published_holes
    from course_strategy c where c.published is not null or exists (select 1 from hole_strategy h where h.course_id=c.course_id and h.published is not null) order by c.course_id`);
}

async function ensureCourse(courseId: string, userId: string) {
  const { club_code, vm_course } = await resolveCourseId(courseId);
  const geo = await courseGeometry(club_code, vm_course);
  await q(`insert into course_strategy (course_id, course_key, updated_by) values ($1,$2,$3) on conflict (course_id) do update set course_key=coalesce(excluded.course_key, course_strategy.course_key)`, [courseId, geo.course_key, userId]);
  return geo;
}

/** Admin: geometry + drafts + published + status for the 18 holes. */
export async function adminCourse(courseId: string, userId: string) {
  checkCourseId(courseId);
  const geo = await ensureCourse(courseId, userId);
  const [c] = await q(`select cs.*, u.name as updated_by_name, p.name as published_by_name from course_strategy cs left join "user" u on u.id=cs.updated_by left join "user" p on p.id=cs.published_by where course_id=$1`, [courseId]);
  const rows = await q(`select h.*, u.name as updated_by_name from hole_strategy h left join "user" u on u.id=h.updated_by where course_id=$1`, [courseId]);
  const od = normalizeOverview(c.draft), op = c.published ? normalizeOverview(c.published) : null;
  return {
    course: { course_id: courseId, course_key: geo.course_key, club_name: geo.club_name, course: geo.course, vm_course: geo.vm_course, par: geo.par, attribution: geo.sources.attribution },
    overview: { draft: od.overview, published: op?.overview ?? null, status: !op ? (od.overview ? "draft" : "none") : op.overview === od.overview ? "published" : "changed",
      updated_at: c.updated_at, updated_by: c.updated_by_name ?? null, published_at: c.published_at, published_by: c.published_by_name ?? null },
    holes: geo.holes.map(g => {
      const r = rows.find((x: any) => x.hole === g.hole);
      return { hole: g.hole, par: g.par, hcp: g.hcp, yards: g.yards, geo: { green: g.green, tee: g.tee, line: g.line, hazards: g.hazards },
        draft: normalizeHole(r?.draft || {}), published: r?.published ? normalizeHole(r.published) : null, status: holeStatus(r?.draft, r?.published),
        updated_at: r?.updated_at ?? null, updated_by: r?.updated_by_name ?? null, published_at: r?.published_at ?? null };
    }),
  };
}

export async function saveOverview(courseId: string, userId: string, b: any) {
  checkCourseId(courseId); await ensureCourse(courseId, userId);
  await q(`update course_strategy set draft=$2, updated_by=$3, updated_at=now() where course_id=$1`, [courseId, JSON.stringify(normalizeOverview(b)), userId]);
}
export async function saveHole(courseId: string, hole: number, userId: string, b: any): Promise<HoleStrategy> {
  checkCourseId(courseId); await ensureCourse(courseId, userId);
  const d = normalizeHole(b);
  await q(`insert into hole_strategy (course_id, hole, draft, updated_by) values ($1,$2,$3,$4) on conflict (course_id, hole) do update set draft=excluded.draft, updated_by=excluded.updated_by, updated_at=now()`,
    [courseId, hole, JSON.stringify(d), userId]);
  return d;
}
/** Revert a hole's draft to what is published (or empty). */
export async function discardHole(courseId: string, hole: number, userId: string) {
  await q(`update hole_strategy set draft=coalesce(published, '{}'::jsonb), updated_by=$3, updated_at=now() where course_id=$1 and hole=$2`, [checkCourseId(courseId), hole, userId]);
}

/** Prefill hazards (as draft) from cached map data. Never publishes. */
export async function prefill(courseId: string, userId: string, holes: number[] | null, replaceMap: boolean) {
  const geo = await ensureCourse(checkCourseId(courseId), userId);
  const rows = await q(`select hole, draft from hole_strategy where course_id=$1`, [courseId]);
  const result: { hole: number; added: number; found: number }[] = [];
  for (const g of geo.holes) {
    if (holes && !holes.includes(g.hole)) continue;
    const fresh = prefillHazards(g as any);
    const cur = normalizeHole(rows.find((r: any) => r.hole === g.hole)?.draft || {});
    const m = mergeHazards(cur.hazards, fresh, replaceMap);
    if (m.added || replaceMap) await saveHole(courseId, g.hole, userId, { ...cur, hazards: m.hazards });
    result.push({ hole: g.hole, added: m.added, found: fresh.length });
  }
  return { holes: result, total_added: result.reduce((s, r) => s + r.added, 0), source: geo.sources.extras ? "openstreetmap + golfistics" : "golfistics (solo greens)" };
}

export async function publish(courseId: string, userId: string, b: { holes?: unknown; overview?: unknown }) {
  checkCourseId(courseId);
  const holes = b.holes === "all" ? null : Array.isArray(b.holes) ? b.holes.map(checkHole) : [];
  const rows = await q(`select hole, draft from hole_strategy where course_id=$1`, [courseId]);
  const done: number[] = [], skipped: number[] = [];
  for (const r of rows) {
    if (holes && !holes.includes(r.hole)) continue;
    if (isEmptyHole(normalizeHole(r.draft))) { skipped.push(r.hole); continue; }
    await q(`update hole_strategy set published=draft, published_by=$3, published_at=now() where course_id=$1 and hole=$2`, [courseId, r.hole, userId]); done.push(r.hole);
  }
  if (holes) for (const h of holes) if (!rows.some((r: any) => r.hole === h)) skipped.push(h);
  let overview = false;
  if (b.overview === true || b.holes === "all") {
    const [c] = await q(`select draft from course_strategy where course_id=$1`, [courseId]);
    if (c && normalizeOverview(c.draft).overview) { await q(`update course_strategy set published=draft, published_by=$2, published_at=now() where course_id=$1`, [courseId, userId]); overview = true; }
  }
  return { published_holes: done.sort((a, b) => a - b), skipped_empty: skipped.sort((a, b) => a - b), overview_published: overview };
}
export async function unpublish(courseId: string, b: { holes?: unknown; overview?: unknown }) {
  checkCourseId(courseId);
  const holes = b.holes === "all" ? null : Array.isArray(b.holes) ? b.holes.map(checkHole) : [];
  if (holes === null) await q(`update hole_strategy set published=null, published_at=null where course_id=$1`, [courseId]);
  else if (holes.length) await q(`update hole_strategy set published=null, published_at=null where course_id=$1 and hole = any($2)`, [courseId, holes]);
  if (b.overview === true || b.holes === "all") await q(`update course_strategy set published=null, published_at=null where course_id=$1`, [courseId]);
  return { ok: true };
}
