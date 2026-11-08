/** Pace of play (t142u). Estimates per club/course × modality × players; alert rule lives in pace-core. */
import { q } from "./db";
import { HttpError } from "./http-error";
import { PACE_MODS, cleanMod, cleanPlayers, timeline, paceCheck, alertText, type PaceMod } from "./pace-core";

type Row = { club_id: number | null; course: string | null; modality: PaceMod; players: number; min_per_hole: number; source: string; updated_at: string; updated_by: string | null };
async function rowsFor(clubId: number | null, course: string | null): Promise<Row[]> {
  return q(`select club_id, course, modality, players, min_per_hole, source, updated_at, updated_by from pace_estimate
            where club_id is null or (club_id = $1 and (course is null or course = $2))`, [clubId, course]);
}
const scopeOf = (r: Row) => r.club_id == null ? "default" : r.course == null ? "club" : "course";
const rank = (r: Row) => r.club_id == null ? 0 : r.course == null ? 1 : 2;
function pick(rows: Row[], m: PaceMod, p: number) {
  return rows.filter(r => r.modality === m && r.players === p).sort((a, b) => rank(b) - rank(a))[0] ?? null;
}
export async function coursePars(clubId: number | null, course: string | null): Promise<(number | null)[]> {
  if (clubId == null || !course) return [];
  const [c] = await q(`select holes from course where club_id=$1 and name=$2`, [clubId, course]);
  const hs = (c?.holes || []) as any[]; return hs.length >= 9 ? hs.map(h => (typeof h.par === "number" ? h.par : null)) : [];
}
/** Full matrix for one course (every modality × players) with where each value comes from. */
export async function paceTable(clubId: number | null, course: string | null) {
  const rows = await rowsFor(clubId, course);
  const values: Record<string, Record<string, any>> = {};
  for (const m of PACE_MODS) { values[m] = {}; for (let p = 1; p <= 4; p++) { const r = pick(rows, m, p); values[m][p] = r ? { min_per_hole: r.min_per_hole, total_18_min: Math.round(r.min_per_hole * 18), scope: scopeOf(r), source: r.source } : null; } }
  return { club_id: clubId, course, estimate: true, values };
}
export async function paceFor(clubId: number | null, course: string | null, modality: unknown, players: unknown) {
  const m = cleanMod(modality ?? "medal"), p = cleanPlayers(players ?? 4);
  if (!m) throw new HttpError(400, "modality: medal | stableford | match | fourball");
  if (!p) throw new HttpError(400, "players: 1 a 4");
  const r = pick(await rowsFor(clubId, course), m, p); if (!r) throw new HttpError(404, "Sin estimación");
  const pars = await coursePars(clubId, course), tl = timeline(r.min_per_hole, pars);
  return { club_id: clubId, course, modality: m, players: p, estimate: true, source: r.source, scope: scopeOf(r), min_per_hole: r.min_per_hole,
    total_min: tl[tl.length - 1].expected_end_min, par_weighted: pars.length > 0, holes: tl, note: "Estimación de Golflet, no es el ritmo oficial del club." };
}
/** Admin: set (or clear with null → inherit) values for a scope. */
export async function setPace(clubId: number | null, course: string | null, values: any, by: string) {
  if (clubId != null && !(await q(`select 1 from club where id=$1`, [clubId])).length) throw new HttpError(404, "Club no encontrado");
  if (clubId != null && course && !(await q(`select 1 from course where club_id=$1 and name=$2`, [clubId, course])).length) throw new HttpError(404, "Cancha no encontrada");
  if (clubId == null && course) throw new HttpError(400, "Los valores por defecto no llevan cancha");
  let n = 0;
  for (const m of PACE_MODS) for (let p = 1; p <= 4; p++) {
    if (!values?.[m] || !(String(p) in values[m])) continue;
    const v = values[m][p];
    if (v === null || v === "") {
      if (clubId == null) throw new HttpError(400, "Los valores por defecto no se pueden borrar");
      await q(`delete from pace_estimate where coalesce(club_id,0)=coalesce($1::int,0) and coalesce(course,'')=coalesce($2::text,'') and modality=$3 and players=$4`, [clubId, course, m, p]); n++; continue;
    }
    const x = Number(String(v).replace(",", ".")); if (!(x >= 4 && x <= 30)) throw new HttpError(400, `Minutos por hoyo entre 4 y 30 (${m}, ${p} jugadores)`);
    await q(`insert into pace_estimate (club_id, course, modality, players, min_per_hole, updated_by, updated_at) values ($1,$2,$3,$4,$5,$6,now())
             on conflict (coalesce(club_id,0), coalesce(course,''), modality, players) do update set min_per_hole=excluded.min_per_hole, updated_by=excluded.updated_by, updated_at=now()`,
      [clubId, course, m, p, Math.round(x * 10) / 10, by]); n++;
  }
  return n;
}
export async function adminCourses() {
  return q(`select c.id club_id, c.name club_name, co.name course, (co.holes is not null and jsonb_array_length(co.holes) >= 9) has_pars,
              (select count(*)::int from pace_estimate p where p.club_id=c.id and (p.course=co.name or p.course is null)) overrides
            from club c join course co on co.club_id=c.id order by c.name, co.name`);
}
export async function paceAlertEnabled(userId: string) {
  const [r] = await q(`select pace_alert from user_pref where user_id=$1`, [userId]); return r ? !!r.pace_alert : true;
}
export async function setPaceAlert(userId: string, on: boolean) {
  await q(`insert into user_pref (user_id, pace_alert, updated_at) values ($1,$2,now()) on conflict (user_id) do update set pace_alert=excluded.pace_alert, updated_at=now()`, [userId, on]);
  return on;
}
/** Live round: estimate + timeline + hole-10 check. `now` is overridable for tests only (server time otherwise). */
export async function livePace(userId: string, liveId: string, now = new Date()) {
  if (!/^[0-9a-f-]{36}$/i.test(liveId)) throw new HttpError(404, "Ronda no encontrada");
  const [l] = await q(`select id, club_id, course, started_at, ended_at, current_hole, players, modality, pace_alert_at from live_round where id=$1 and user_id=$2`, [liveId, userId]);
  if (!l) throw new HttpError(404, "Ronda no encontrada");
  const est = await paceFor(l.club_id, l.course, l.modality || "medal", l.players || 4);
  const enabled = await paceAlertEnabled(userId);
  const check = paceCheck({ startedAt: new Date(l.started_at), now, currentHole: l.current_hole, tl: est.holes, enabled, alreadyAt: l.pace_alert_at ? new Date(l.pace_alert_at) : null });
  return { live_round_id: l.id, players: l.players ?? null, modality: l.modality ?? null, assumed: { players: l.players == null, modality: l.modality == null }, ended: !!l.ended_at,
    estimate: est, check: { ...check, due: check.due && !l.ended_at }, message: check.due && !l.ended_at && check.behind_min != null ? alertText(check.behind_min) : null };
}
/** Mark the hole-10 alert as shown (once per round). Idempotent. */
export async function markAlerted(userId: string, liveId: string) {
  const [r] = await q(`update live_round set pace_alert_at=coalesce(pace_alert_at, now()) where id=$1 and user_id=$2 returning pace_alert_at`, [liveId, userId]);
  if (!r) throw new HttpError(404, "Ronda no encontrada"); return r.pace_alert_at;
}
/** Resolve a course reference: { course_id: "118-jockey-azul" } (same id as the live round / GPS API) or { club_id, course }. */
export async function resolveRef(s: URLSearchParams): Promise<{ clubId: number | null; course: string | null }> {
  const cid = s.get("course_id");
  if (cid) {
    const { resolveCourseId } = await import("./course-geo"); const { matchOurCourse } = await import("./viewmaster");
    const { club_code, vm_course } = await resolveCourseId(cid);
    const ours = await q(`select c.id as club_id, co.name from club c join course co on co.club_id=c.id where c.code=$1`, [club_code]);
    const course = matchOurCourse(vm_course!, ours.map((o: any) => o.name)) || null;
    const clubId = ours[0]?.club_id ?? (await q(`select id from club where code=$1`, [club_code]))[0]?.id ?? null;
    return { clubId, course };
  }
  const c = s.get("club_id"); const clubId = c == null || c === "" ? null : Number(c);
  if (clubId != null && !Number.isInteger(clubId)) throw new HttpError(400, "club_id inválido");
  return { clubId, course: s.get("course") || null };
}
