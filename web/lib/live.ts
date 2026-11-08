/** Golflet rounds (GPS shot logging and/or voice recap), shots and links to synced Golfistics rounds. */
import { q } from "./db";
import { HttpError } from "./http";
import { visibleRoundIds } from "./data";
import { computeDistances, DEFAULT_CLUBS, type ClubDef, type Greens, type ShotIn } from "./shots-calc";
import { gpsShotSql } from "./gps-shot";
import { isUndefinedColumn } from "./scorecard-lease";

export const LIVE_COLS = `l.id, l.club_code, l.vm_course, l.club_id, l.course, l.date::text as date, l.tee, l.started_at, l.ended_at, l.current_hole, l.round_id, l.updated_at, l.players, l.modality, l.pace_alert_at`;
export async function listLiveRounds(userId: string) {
  const listed = (origin: boolean) => `select ${LIVE_COLS}, (select count(*)::int from shot s where s.live_round_id=l.id and ${gpsShotSql("s")}) as shots,
      (select id from round_recap rr where rr.live_round_id=l.id) as recap_id
    from live_round l where l.user_id=$1 ${origin ? "and coalesce(l.origin, 'live') = 'live'" : ""}
    order by l.date desc, l.started_at desc limit 100`;
  try { return await q(listed(true), [userId]); }
  catch (e) {
    if (!isUndefinedColumn(e, "origin")) throw e;
    return q(listed(false), [userId]);
  }
}

export async function ownLive(userId: string, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new HttpError(404, "No encontrado");
  const [l] = await q(`select ${LIVE_COLS} from live_round l where l.id=$1 and l.user_id=$2`, [id, userId]);
  if (!l) throw new HttpError(404, "No encontrado");
  return l;
}

/** Attach unlinked Golflet rounds to the synced Golfistics card of the same date + club + course (the kept copy after dedupe). */
export async function linkLiveRounds(userId: string): Promise<number> {
  let open: any[];
  try {
    open = await q(`select id, date::text as date, club_id, course from live_round where user_id=$1 and round_id is null and club_id is not null and course is not null and coalesce(origin,'live')='live'`, [userId]);
  } catch (e) {
    const err = e as { code?: string; message?: string };
    if (err?.code !== "42703" || !/origin/i.test(String(err?.message || ""))) throw e;
    open = await q(`select id, date::text as date, club_id, course from live_round where user_id=$1 and round_id is null and club_id is not null and course is not null`, [userId]);
  }
  if (!open.length) return 0;
  const keep = await visibleRoundIds(userId); let n = 0;
  for (const l of open) {
    const cands = await q(`select r.id from round r join club_account a on a.id=r.club_account_id where a.user_id=$1 and r.date=$2 and a.club_id=$3 and lower(r.course)=lower($4)
      and not coalesce((r.data->>'other_course')::boolean, false) order by jsonb_array_length(r.holes) desc`, [userId, l.date, l.club_id, l.course]);
    const pick = cands.find(c => keep.has(c.id)) || cands[0];
    if (pick) { await q(`update live_round set round_id=$2, updated_at=now() where id=$1 and round_id is null`, [l.id, pick.id]); n++; }
  }
  return n;
}

export async function greensFor(clubCode: string | null, vmCourse: string | null): Promise<Greens> {
  if (!clubCode || !vmCourse) return {};
  const [r] = await q(`select holes from vm_course where club_code=$1 and vm_course=$2`, [clubCode, vmCourse]);
  const g: Greens = {}; for (const h of r?.holes || []) g[h.hole] = { center: h.center, front: h.front, back: h.back };
  return g;
}
export const SHOT_COLS = `s.id, s.client_id, s.hole, s.shot_number, s.lat, s.lng, s.accuracy_m, s.taken_at, s.club, s.lie, s.result, s.direction, s.length, s.mishit, s.intent, s.source`;
export async function shotsWithDistances(live: any) {
  const rows = await q<ShotIn>(`select ${SHOT_COLS} from shot s where s.live_round_id=$1 and ${gpsShotSql("s")} order by s.hole, s.shot_number, s.taken_at`, [live.id]);
  return computeDistances(rows, await greensFor(live.club_code, live.vm_course));
}
export async function userClubs(userId: string): Promise<ClubDef[]> {
  const [r] = await q(`select clubs from player_clubs where user_id=$1`, [userId]);
  return r?.clubs || DEFAULT_CLUBS;
}
export type ShotFilter = { sinceDays?: number; from?: string | null; to?: string | null; courseKey?: string | null; courseId?: { club_code: string; vm_course: string } | null };
export async function allUserShots(userId: string, f: ShotFilter | number = {}) {
  const o: ShotFilter = typeof f === "number" ? { sinceDays: f } : f;
  const where = ["l.user_id=$1"], vals: unknown[] = [userId];
  const add = (sql: string, v: unknown) => { vals.push(v); where.push(sql.replace("?", `$${vals.length}`)); };
  if (o.sinceDays) add("l.date >= current_date - ?::int", Math.floor(o.sinceDays));
  if (o.from) add("l.date >= ?::date", o.from);
  if (o.to) add("l.date <= ?::date", o.to);
  if (o.courseKey) { const [cid, ...rest] = o.courseKey.split(":"); add("l.club_id = ?::int", Number(cid) || -1); add("lower(l.course) = lower(?)", rest.join(":")); }
  if (o.courseId) { add("l.club_code = ?", o.courseId.club_code); add("l.vm_course = ?", o.courseId.vm_course); }
  const lives = await q(`select ${LIVE_COLS} from live_round l where ${where.join(" and ")} order by l.date desc`, vals);
  const out = [];
  for (const l of lives) out.push(...(await shotsWithDistances(l)).map(s => ({ ...s, live_round_id: l.id, date: l.date })));
  return out;
}
