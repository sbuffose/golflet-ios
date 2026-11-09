/** PRIVATE metrics (t136u/t137u): performance + counts by tee-time hour band and by playing partners.
 *  STRICTLY owner-only: these functions take the session user's id and nothing else. They are imported ONLY by
 *  app/api/me/private-metrics/** (enforced by tests/private-metrics.test.ts). Never used by groups, profesores, shared links or admin. */
import { q } from "./db";
import { visibleRoundIds } from "./data";
import { nowAR } from "./tee-times-core";
import { privateMetrics, partnerKey, companionKey, hourBand, BANDS, type PastTee, type ScoreTally } from "./private-metrics-core";
import { tallyHoles } from "./weather-core";
import { HttpError } from "./http-error";

/** Link each club tee time to the round played that day (same user, same date; course name breaks ties). Idempotent. */
export async function matchTeeTimes(userId: string) {
  const keep = [...await visibleRoundIds(userId)]; if (!keep.length) return 0;
  const tees = await q(`select id, date::text date, course_label from tee_time where user_id=$1 and source='club' and gone_at is null and round_id is null`, [userId]);
  if (!tees.length) return 0;
  const rounds = await q(`select id, date::text date, course from round where id = any($1::uuid[])`, [keep]);
  const n = (s: string | null) => (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  let linked = 0;
  for (const t of tees) {
    let c = rounds.filter((r: any) => r.date === t.date);
    if (c.length > 1 && t.course_label) c = c.filter((r: any) => n(r.course).includes(n(t.course_label)) || n(t.course_label).includes(n(r.course)));
    if (c.length === 1) { await q(`update tee_time set round_id=$2 where id=$1 and user_id=$3`, [t.id, c[0].id, userId]); linked++; }
  }
  return linked;
}
async function pastTees(userId: string): Promise<PastTee[]> {
  await matchTeeTimes(userId);
  const now = nowAR();
  const rows = await q(`select t.id, t.date::text date, t.time, t.club_name, t.course_label, t.companions, t.round_id, r.holes,
              coalesce((r.data->>'is_9_holes')::boolean, false) nine,
              case when coalesce((r.data->>'valid_card')::boolean, true) then nullif(r.data->>'differential_computed','')::float8 end differential, nullif(r.data->>'gross','')::int gross
            from tee_time t left join round r on r.id=t.round_id
            where t.user_id=$1 and t.source='club' and t.gone_at is null and (t.date < $2::date or (t.date = $2::date and t.time < $3))
            order by t.date desc, t.time desc`, [userId, now.date, now.time]);
  return rows.map((t: any) => {
    const tally = tallyHoles(t.holes, !!t.nine);
    const scores: ScoreTally | null = tally ? { eagles: tally.eagles, birdies: tally.birdies, pars: tally.pars, bogeys: tally.bogeys, doubles: tally.doubles, holes: tally.holes } : null;
    return { ...t, scores };
  });
}
export async function myPrivateMetrics(userId: string) {
  const m = privateMetrics(await pastTees(userId));
  return { private: true, ...m, empty: m.played === 0, note: m.played === 0 ? "Se arma a medida que juegues: usamos tus salidas reservadas en el club desde que vinculaste tu cuenta." : null };
}
const row = (t: PastTee) => ({ tee_time_id: t.id, date: t.date, time: t.time, club_name: t.club_name, course_label: t.course_label, band: hourBand(t.time), round_id: t.round_id, differential: t.differential, gross: t.gross,
  companions: (t.companions || []).map((c: any) => typeof c === "string" ? c : c?.name).filter(Boolean) });
export async function myBand(userId: string, band: string) {
  const b = BANDS.find(([k]) => k === band); if (!b) throw new HttpError(404, "Franja no encontrada");
  const all = await pastTees(userId), m = privateMetrics(all);
  return { private: true, band: m.bands.find(x => x.key === band), overall_avg_diff: m.overall_avg_diff, tee_times: all.filter(t => hourBand(t.time) === band).map(row) };
}
export async function myPartner(userId: string, key: string) {
  const raw = decodeURIComponent(key || "");
  const k = raw.startsWith("id:") ? raw : partnerKey(raw);
  if (!k || k.length > 160) throw new HttpError(404, "Compañero no encontrado");
  const all = await pastTees(userId), m = privateMetrics(all), p = m.partners.find(x => x.key === k);
  if (!p) throw new HttpError(404, "Compañero no encontrado");
  return { private: true, partner: p, overall_avg_diff: m.overall_avg_diff, tee_times: all.filter(t => (t.companions || []).some((c: any) => companionKey(c)?.key === p.key)).map(row) };
}
