/** Loads one player's data for "Qué trabajar" and Putting (scoped to the viewer; nothing from other players). */
import { q } from "./db";
import { buildData } from "./data";
import { allUserShots } from "./live";
import { rangeSince, type Range } from "./metrics";
import { flagsForLive } from "./pins";
import { gpsHoles, type RoundIn, type LiveIn, type RecapIn, type ShotIn } from "./improve-core";

export async function loadImprove(userId: string, range: Range | null) {
  const since = range ? rangeSince(range) : null;
  const D: any = await buildData(userId);
  const label = new Map<string, string>((D.courses || []).map((c: any) => [c.key, c.label]));
  const rounds: RoundIn[] = (D.rounds || []).filter((r: any) => r.valid_card && !r.is_9_holes && (!since || r.date >= since))
    .map((r: any) => ({ id: r.round_id, date: r.date, course_key: r.course_key, course_label: r.course_label || label.get(r.course_key) || r.course, holes: r.holes || [], putts: r.putts ?? null, gir: r.gir ?? null, fir: r.fir ?? null }));
  const shots: any[] = await allUserShots(userId, since ? { from: since } : {});
  const lv = await q(`select l.id, l.date::text date, l.club_id, l.course, l.club_code, l.vm_course, c.holes from live_round l left join course c on c.club_id=l.club_id and lower(c.name)=lower(l.course)
    where l.user_id=$1 ${since ? "and l.date >= $2::date" : ""}`, since ? [userId, since] : [userId]);
  const cnt = lv.length ? await q(`select live_round_id, hole, putts, pin_lat, pin_lng from live_hole where live_round_id = any($1::uuid[])`, [lv.map((l: any) => l.id)]) : [];
  const counts = new Map<string, Record<number, number>>(), pins = new Map<string, Record<number, { lat: number; lng: number }>>();
  for (const c of cnt) { if (c.putts != null) counts.set(c.live_round_id, { ...(counts.get(c.live_round_id) || {}), [c.hole]: c.putts });
    if (c.pin_lat != null) pins.set(c.live_round_id, { ...(pins.get(c.live_round_id) || {}), [c.hole]: { lat: Number(c.pin_lat), lng: Number(c.pin_lng) } }); }
  const flags = await flagsForLive(lv.map((l: any) => ({ id: l.id, club_code: l.club_code, vm_course: l.vm_course, date: l.date })), pins);   // t162u: club > own > day pin
  const lives: LiveIn[] = lv.map((l: any) => { const ck = `${l.club_id}:${l.course}`;
    return { id: l.id, date: l.date, course_key: ck, course_label: label.get(ck) || l.course || "Cancha", pars: Object.fromEntries((l.holes || []).map((h: any) => [h.hole, h.par])), counts: counts.get(l.id), pins: flags.get(l.id) }; });
  const recaps: RecapIn[] = (await q(`select coalesce(rr.round_id::text, rr.live_round_id::text) round_key, coalesce(r.date, l.date)::text date, rr.mistakes
      from round_recap rr left join round r on r.id=rr.round_id left join live_round l on l.id=rr.live_round_id where rr.user_id=$1 and rr.status='ready'`, [userId]))
    .filter((r: any) => !since || r.date >= since);
  const S: ShotIn[] = shots.map(s => ({ live_round_id: s.live_round_id, hole: s.hole, shot_number: s.shot_number, club: s.club, lie: s.lie, result: s.result, direction: s.direction, length: s.length, intent: s.intent, to_green_m: s.to_green_m, lat: s.lat == null ? null : Number(s.lat), lng: s.lng == null ? null : Number(s.lng) }));
  const hiRaw = D.player?.handicap_index ?? (D.hi_history || []).at(-1)?.hi ?? null;
  return { rounds, shots: S, holes: gpsHoles(S, lives), recaps, hi: hiRaw == null ? null : Number(hiRaw), range: range ?? "all", since };
}
