/** t183u Modo torneo: the player's competition state for today (live GPS round and/or the day's club booking). API_v5 §62. */
import { q } from "./db";
import { nowAR } from "./tee-times-core";
import { isCompetitionCard } from "./competition";
import { torneoState, isTorneoBooking, inRoundWindow } from "./torneo-core";

/** v36 columns read through to_jsonb so this works before and after the migration (missing → automático, sin regla local). */
const TCOLS = `l.id, l.date::text as date, l.ended_at, l.round_id, (to_jsonb(l)->>'tournament_mode')::boolean as tournament_mode, coalesce((to_jsonb(l)->>'no_distance_rule')::boolean, false) as no_distance_rule`;
/** For a live round (owner-checked by the caller). */
export async function torneoForLive(userId: string, l0: any) {
  const [l] = await q(`select ${TCOLS} from live_round l where l.id=$1`, [l0.id]);
  const now = nowAR(), date = String(l.date).slice(0, 10);
  const bk = await q(`select source, modality, event_name from tee_time where user_id=$1 and date=$2 and gone_at is null`, [userId, date]);
  let card = false;
  if (l.round_id) { const [r] = await q(`select data from round where id=$1`, [l.round_id]); card = !!r && isCompetitionCard(r.data || {}); }
  return torneoState({ manual: l.tournament_mode ?? null, club_booking: bk.some(isTorneoBooking), competition_card: card, no_distance_rule: !!l.no_distance_rule,
    in_round: !l.ended_at && date === now.date });
}
/** For a plan on `date` at `teeTime`: active when the player's open live round today has torneo on, or (no live round) during the
 *  booking window of a competition booking that day. */
export async function torneoForPlan(userId: string, date: string, teeTime: string) {
  const now = nowAR();
  const [l] = await q(`select ${TCOLS} from live_round l
                       where l.user_id=$1 and l.date=$2 and l.ended_at is null order by l.started_at desc limit 1`, [userId, now.date]);
  if (l && date === now.date) return torneoForLive(userId, l);
  const bk = await q(`select source, modality, event_name from tee_time where user_id=$1 and date=$2 and gone_at is null`, [userId, date]);
  return torneoState({ manual: null, club_booking: bk.some(isTorneoBooking), competition_card: false, no_distance_rule: false, in_round: inRoundWindow(date, teeTime, now) });
}
/** Right now, regardless of plan: open live round today, else any competition booking today whose window is on. */
export async function torneoNow(userId: string) {
  const now = nowAR();
  const [l] = await q(`select ${TCOLS} from live_round l
                       where l.user_id=$1 and l.date=$2 and l.ended_at is null order by l.started_at desc limit 1`, [userId, now.date]);
  if (l) return torneoForLive(userId, l);
  const bk = await q(`select source, modality, event_name, time from tee_time where user_id=$1 and date=$2 and gone_at is null`, [userId, now.date]);
  const comp = bk.filter(isTorneoBooking);
  return torneoState({ manual: null, club_booking: comp.length > 0, competition_card: false, no_distance_rule: false, in_round: comp.some((t: any) => inRoundWindow(now.date, t.time, now)) });
}
export const TORNEO_LOCKED_MSG = "Modo torneo: durante la ronda tu estrategia queda como la armaste (Regla 4.3).";
