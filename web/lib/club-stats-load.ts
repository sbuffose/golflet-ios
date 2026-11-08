import { q } from "./db";
import { HttpError } from "./http";
import { allUserShots, userClubs, type ShotFilter } from "./live";
import { resolveCourseId } from "./course-geo";
import type { Sample } from "./club-stats";

/** Filters: ?course=<course_key "1:Azul"> | ?course_id=<"118-jockey-azul">, ?from=YYYY-MM-DD, ?to=YYYY-MM-DD, ?days=N */
export async function loadClubData(userId: string, u: URL) {
  const p = (k: string) => u.searchParams.get(k);
  const date = (k: string) => { const v = p(k); if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new HttpError(400, `${k} inválido`); return v; };
  const f: ShotFilter = { from: date("from"), to: date("to"), courseKey: p("course") && p("course") !== "all" ? p("course")!.slice(0, 120) : null,
    sinceDays: Number(p("days")) > 0 ? Math.min(3650, Number(p("days"))) : undefined };
  if (p("course_id")) f.courseId = await resolveCourseId(p("course_id")!);
  const shots = await allUserShots(userId, f);
  // launch-monitor samples have no course: included unless a course filter is set
  const vals: unknown[] = [userId]; const w = ["user_id=$1"];
  if (f.from) { vals.push(f.from); w.push(`taken_at >= $${vals.length}::date`); }
  if (f.to) { vals.push(f.to); w.push(`taken_at < ($${vals.length}::date + 1)`); }
  if (f.sinceDays) { vals.push(f.sinceDays); w.push(`taken_at >= now() - ($${vals.length}::int * interval '1 day')`); }
  const samples: Sample[] = f.courseKey || f.courseId ? [] : await q(`select club, source, carry_m, total_m, side_m, mishit, taken_at from club_sample where ${w.join(" and ")}`, vals);
  return { shots, samples, clubs: await userClubs(userId), filters: { course: f.courseKey ?? null, course_id: p("course_id"), from: f.from ?? null, to: f.to ?? null, days: f.sinceDays ?? null } };
}
