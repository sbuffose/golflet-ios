import { handle, json, requireUser, HttpError } from "@/lib/http";
import { q } from "@/lib/db";
import { body } from "@/lib/accounts";
import { linkLiveRounds, LIVE_COLS } from "@/lib/live";
import { resolveCourseId } from "@/lib/course-geo";
import { matchOurCourse } from "@/lib/viewmaster";
import { cleanMod, cleanPlayers, paceModality } from "@/lib/pace-core";

export const GET = handle(async (req: Request) => {
  const user = await requireUser(req);
  await linkLiveRounds(user.id).catch(() => 0);
  const rows = await q(`select ${LIVE_COLS}, (select count(*)::int from shot s where s.live_round_id=l.id) as shots,
      (select id from round_recap rr where rr.live_round_id=l.id) as recap_id
    from live_round l where l.user_id=$1 order by l.date desc, l.started_at desc limit 100`, [user.id]);
  return json({ live_rounds: rows });
});

/** Start a Golflet round: { course_id? ("118-jockey-azul"), date? (YYYY-MM-DD, default today AR), tee?, current_hole?, players? (1-4), modality? (medal|stableford|match|fourball or club text) }. course_id is optional (recap-only round). */
export const POST = handle(async (req: Request) => {
  const user = await requireUser(req); const b = await body<any>(req);
  let club_code: string | null = null, vm_course: string | null = null, club_id: number | null = null, course: string | null = null;
  if (b.course_id) {
    ({ club_code, vm_course } = await resolveCourseId(String(b.course_id)));
    const ours = await q(`select c.id as club_id, co.name from club c join course co on co.club_id=c.id where c.code=$1`, [club_code]);
    course = matchOurCourse(vm_course!, ours.map(o => o.name));
    club_id = ours[0]?.club_id ?? (await q(`select id from club where code=$1`, [club_code]))[0]?.id ?? null;
    if (!course) course = vm_course;
  }
  const today = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
  const date = b.date ? String(b.date) : today;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new HttpError(400, "Fecha inválida");
  const hole = b.current_hole == null ? 1 : Number(b.current_hole);
  if (!Number.isInteger(hole) || hole < 1 || hole > 18) throw new HttpError(400, "Hoyo inválido");
  const players = b.players == null ? null : cleanPlayers(b.players); if (b.players != null && players == null) throw new HttpError(400, "players: 1 a 4");
  const modality = b.modality == null || b.modality === "" ? null : (cleanMod(b.modality) ?? paceModality(String(b.modality)));
  const [l] = await q(`insert into live_round (user_id, club_code, vm_course, club_id, course, date, tee, current_hole, players, modality) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id`,
    [user.id, club_code, vm_course, club_id, course, date, b.tee ? String(b.tee).slice(0, 20) : null, hole, players, modality]);
  await linkLiveRounds(user.id).catch(() => 0);
  const [row] = await q(`select ${LIVE_COLS} from live_round l where l.id=$1`, [l.id]);
  return json({ live_round: row }, 201);
});
