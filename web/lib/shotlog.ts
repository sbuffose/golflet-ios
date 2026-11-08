/** t202u/t204u: confirmed shot log (paper libreta read on the phone, or GPS auto-detected shots) — owner only, never shared. API_v5 §66–67. */
import { q } from "./db";
import { HttpError } from "./http-error";
import { cleanLogHole, clubEstimates, logStats, type LogHole } from "./shotlog-core";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export async function saveShotLog(userId: string, b: any) {
  const club = String(b?.club_code || ""), course = String(b?.course || ""), date = String(b?.date || ""), source = ["gps", "watch", "garmin"].includes(b?.source) ? String(b.source) : "libreta";
  if (!/^\d{1,5}$/.test(club) || !course || course.length > 60) throw new HttpError(400, "Cancha inválida");
  if (!DATE_RE.test(date)) throw new HttpError(400, "Fecha inválida");
  const holes = Array.isArray(b?.holes) ? b.holes : []; if (!holes.length || holes.length > 18) throw new HttpError(400, "Mandá entre 1 y 18 hoyos confirmados");
  let clean: LogHole[]; try { clean = holes.map(cleanLogHole); } catch (e: any) { throw new HttpError(400, e.message); }
  let planId: string | null = null;
  if (b?.plan_id) { const [p] = await q(`select id from round_plan where id=$1 and user_id=$2`, [String(b.plan_id), userId]).catch(() => []); planId = p?.id ?? null; }
  for (const h of clean) await q(`insert into shot_log (user_id, club_code, course, date, plan_id, hole, source, data) values ($1,$2,$3,$4,$5,$6,$7,$8)
      on conflict (user_id, club_code, course, date, hole, source) do update set data=excluded.data, plan_id=coalesce(excluded.plan_id, shot_log.plan_id), confirmed_at=now()`,
    [userId, club, course, date, planId, h.hole, source, JSON.stringify(h)]);
  return { saved: clean.length, ...(await shotLogSummary(userId, { club_code: club, course })) };
}
export async function listShotLog(userId: string, o: { club_code?: string; course?: string; date?: string } = {}) {
  const rows = await q(`select club_code, course, date::text date, hole, source, data, confirmed_at from shot_log where user_id=$1
      and ($2::text is null or club_code=$2) and ($3::text is null or lower(course)=lower($3)) and ($4::date is null or date=$4) order by date desc, hole limit 1000`,
    [userId, o.club_code ?? null, o.course ?? null, o.date && DATE_RE.test(o.date) ? o.date : null]);
  return rows;
}
export async function shotLogSummary(userId: string, o: { club_code?: string; course?: string } = {}) {
  const rows = await listShotLog(userId, o), holes = rows.map((r: any) => r.data as LogHole);
  return { stats: logStats(holes), club_estimates: clubEstimates(holes), rounds: new Set(rows.map((r: any) => `${r.club_code}|${r.course}|${r.date}`)).size,
    note: "Distancias por palo estimadas desde las marcas (X en la libreta o paradas del GPS): son aproximadas." };
}
export async function deleteShotLog(userId: string, o: { club_code: string; course: string; date: string; source?: string }) {
  if (!DATE_RE.test(o.date)) throw new HttpError(400, "Fecha inválida");
  const r = await q(`delete from shot_log where user_id=$1 and club_code=$2 and lower(course)=lower($3) and date=$4 and ($5::text is null or source=$5) returning hole`, [userId, o.club_code, o.course, o.date, o.source ?? null]);
  return { deleted: r.length };
}
