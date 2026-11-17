import { handle, json, requireUser, HttpError } from "@/lib/http";
import { q } from "@/lib/db";
import { body } from "@/lib/accounts";
import { resolveCourseId } from "@/lib/course-geo";
import { matchOurCourse } from "@/lib/viewmaster";
import { ReconstructSchemaError, createManualRound, listOfficialChoices } from "@/lib/reconstruct";
import { isUndefinedColumn } from "@/lib/scorecard-lease";

/** Rounds the player already has, so a reconstruction can point at one without copying it. */
export const GET = handle(async (req: Request) => {
  const user = await requireUser(req);
  const rounds = await listOfficialChoices(user.id);
  const manualSql = (flag: boolean) => `select id, date::text as date, course, tee, club_code, vm_course, round_id, current_hole,
      ${flag ? "official" : "(round_id is not null)"} as official,
      (select count(*)::int from shot s where s.live_round_id = live_round.id) as shots
    from live_round
    where user_id=$1 and origin='manual' order by date desc limit 80`;
  let manual: any[] = [];
  try { manual = await q(manualSql(true), [user.id]); }
  catch (e) {
    if (!isUndefinedColumn(e, "official") && !isUndefinedColumn(e, "origin")) throw e;
    if (isUndefinedColumn(e, "origin")) manual = [];
    else manual = await q(manualSql(false), [user.id]);
  }
  return json({
    rounds,
    reconstructions: manual.map((r: any) => ({
      id: String(r.id), date: String(r.date).slice(0, 10), course: r.course, tee: r.tee || "",
      club_code: r.club_code, vm_course: r.vm_course, round_id: r.round_id, current_hole: Number(r.current_hole) || 1,
      official: r.official !== false, tracked: Number(r.shots) > 0,
    })),
  });
});

/** Start a reconstruction. Does not write the official round row. */
export const POST = handle(async (req: Request) => {
  const user = await requireUser(req);
  const b = await body<any>(req);
  if (!b.course_id) throw new HttpError(400, "Elegí la cancha");
  const { club_code, vm_course } = await resolveCourseId(String(b.course_id));
  const ours = await q(`select c.id as club_id, co.name from club c join course co on co.club_id=c.id where c.code=$1`, [club_code]);
  const course = matchOurCourse(vm_course, ours.map((o: any) => o.name)) || vm_course;
  const clubId = ours[0]?.club_id ?? (await q(`select id from club where code=$1`, [club_code]))[0]?.id ?? null;
  try {
    const live = await createManualRound({
      userId: user.id, date: String(b.date || ""), clubCode: club_code, vmCourse: vm_course,
      course, clubId, roundId: b.round_id ? String(b.round_id) : null, tee: b.tee ? String(b.tee) : null,
    });
    return json({ live_round: live }, 201);
  } catch (e) {
    if (e instanceof ReconstructSchemaError) return json({ error: e.message }, 503);
    throw e;
  }
});
