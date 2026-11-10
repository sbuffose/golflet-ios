/** PRIVATE metrics (t136u/t137u): performance + counts by tee-time hour band and by playing partners.
 *  STRICTLY owner-only: these functions take the session user's id and nothing else. They are imported ONLY by
 *  app/api/me/private-metrics/** (enforced by tests/private-metrics.test.ts). Never used by groups, profesores, shared links or admin. */
import { q } from "./db";
import { visibleRoundIds } from "./data";
import { privateMetrics, partnerKey, companionKey, hourBand, cardClock, clockHHMM, BANDS, type PastTee, type ScoreTally } from "./private-metrics-core";
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
async function playCards(userId: string): Promise<PastTee[]> {
  await matchTeeTimes(userId);
  const keep = [...await visibleRoundIds(userId)];
  if (!keep.length) return [];
  const rows = await q(`select r.id, r.date::text date, r.course, r.holes,
              r.data->>'club_played' club_played,
              nullif(r.data->>'tee_time','') card_time,
              nullif(r.data->>'start_time','') start_time,
              coalesce((r.data->>'is_9_holes')::boolean, false) nine,
              case when coalesce((r.data->>'valid_card')::boolean, true) then nullif(r.data->>'differential_computed','')::float8 end differential,
              nullif(r.data->>'gross','')::int gross,
              t.id tee_id, t.time tee_time, t.club_name, t.course_label, t.companions,
              case when l.origin is distinct from 'manual' then to_char(l.started_at at time zone 'America/Argentina/Buenos_Aires', 'HH24:MI') end track_time
            from round r
            left join lateral (
              select id, time, club_name, course_label, companions
              from tee_time
              where round_id=r.id and user_id=$2 and gone_at is null
              order by time limit 1
            ) t on true
            left join lateral (
              select started_at, origin from live_round
              where round_id=r.id and user_id=$2 and started_at is not null
              order by started_at limit 1
            ) l on true
            where r.id = any($1::uuid[])
            order by r.date desc`, [keep, userId]);
  return rows.map((t: any) => {
    const clock = cardClock({ reservation: t.tee_time, card: clockHHMM(t.card_time) || clockHHMM(t.start_time), track: t.track_time });
    const tally = tallyHoles(t.holes, !!t.nine);
    const scores: ScoreTally | null = tally ? { eagles: tally.eagles, birdies: tally.birdies, pars: tally.pars, bogeys: tally.bogeys, doubles: tally.doubles, holes: tally.holes } : null;
    return {
      id: String(t.id), date: t.date, time: clock.time || "", time_source: clock.source,
      club_name: t.club_name || null, course_label: t.course_label || t.course || null,
      companions: Array.isArray(t.companions) ? t.companions : [],
      round_id: String(t.id), differential: t.differential ?? null, gross: t.gross ?? null, scores,
    };
  });
}
export async function myPrivateMetrics(userId: string) {
  const cards = await playCards(userId);
  const m = privateMetrics(cards);
  const with_partners = cards.map(c => ({
    round_id: c.round_id,
    companions: (c.companions || []).map(person => companionKey(person as any)).filter((x): x is { key: string; name: string } => !!x),
  })).filter(c => c.companions.length);
  return { private: true, ...m, with_partners, empty: m.played === 0 && m.partners.length === 0, note: m.played === 0 ? "Ninguna tarjeta tiene un horario conocido. No invento uno." : null };
}
const row = (t: PastTee) => ({ tee_time_id: t.id, date: t.date, time: t.time, club_name: t.club_name, course_label: t.course_label, band: hourBand(t.time), round_id: t.round_id, differential: t.differential, gross: t.gross,
  companions: (t.companions || []).map((c: any) => typeof c === "string" ? c : c?.name).filter(Boolean) });
export async function myBand(userId: string, band: string) {
  const b = BANDS.find(([k]) => k === band); if (!b) throw new HttpError(404, "Franja no encontrada");
  const all = await playCards(userId), m = privateMetrics(all);
  return { private: true, band: m.bands.find(x => x.key === band), overall_avg_diff: m.overall_avg_diff, tee_times: all.filter(t => hourBand(t.time) === band).map(row) };
}
export async function myPartner(userId: string, key: string) {
  const raw = decodeURIComponent(key || "");
  const k = raw.startsWith("id:") ? raw : partnerKey(raw);
  if (!k || k.length > 160) throw new HttpError(404, "Compañero no encontrado");
  const all = await playCards(userId), m = privateMetrics(all), p = m.partners.find(x => x.key === k);
  if (!p) throw new HttpError(404, "Compañero no encontrado");
  return { private: true, partner: p, overall_avg_diff: m.overall_avg_diff, tee_times: all.filter(t => (t.companions || []).some((c: any) => companionKey(c)?.key === p.key)).map(row) };
}
