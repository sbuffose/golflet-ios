import { q } from "./db";
import { rangeSince, type Range } from "./metrics";
import { gameMetrics, type GmHole, type GmRound, type GmShot, type LL } from "./game-metrics-core";
import { effectiveGreens, flagsForLive, pinStateFor } from "./pins";

/** Per-hole info of one live round: par (our course card), green front/center/back (club GPS map + corrections), putts counter, own pin,
 *  and (t162u) the collaborative pin of the day + what the player's pin button does. */
export async function liveHoles(live: any, me?: string) {
  const [c] = live.club_id && live.course ? await q(`select holes from course where club_id=$1 and lower(name)=lower($2)`, [live.club_id, live.course]) : [];
  const pars = new Map<number, number>((c?.holes || []).map((h: any) => [Number(h.hole), Number(h.par)]));
  const greens = await effectiveGreens(live.club_code, live.vm_course);
  const lh = await q(`select hole, putts, pin_lat, pin_lng, pin_accuracy_m, pin_at from live_hole where live_round_id=$1`, [live.id]);
  const L = new Map(lh.map((r: any) => [Number(r.hole), r]));
  const ps = me ? await pinStateFor(live, me) : new Map();
  return Array.from({ length: 18 }, (_, i) => i + 1).map(h => { const r: any = L.get(h), st: any = ps.get(h);
    return { hole: h, par: pars.get(h) ?? null, green: greens.get(h) ?? null, putts: r?.putts ?? null,
      pin: r?.pin_lat != null ? { lat: r.pin_lat, lng: r.pin_lng, accuracy_m: r.pin_accuracy_m, at: r.pin_at, source: "player_marked" } : null,
      day_pin: st?.day_pin ?? null, pin_action: st?.pin_action ?? "none" }; });
}

/** win (t163u): optional inclusive date window { from, to } (YYYY-MM-DD) instead of a range — used by the group Comparativo. */
export async function loadGameMetrics(userId: string, range: Range | null, win?: { from: string; to: string }) {
  const since = win ? win.from : range ? rangeSince(range) : null;
  const lv = await q(`select l.id, l.date::text date, l.round_id, l.club_code, l.vm_course, l.course, c.holes pars, v.holes greens
      from live_round l left join course c on c.club_id=l.club_id and lower(c.name)=lower(l.course)
      left join vm_course v on v.club_code=l.club_code and v.vm_course=l.vm_course
      where l.user_id=$1 ${since ? "and l.date >= $2::date" : ""} ${win ? "and l.date <= $3::date" : ""}`, win ? [userId, win.from, win.to] : since ? [userId, since] : [userId]);
  const rounds: GmRound[] = lv.map((l: any) => ({ id: l.id, date: l.date, course_label: l.course || l.vm_course || "Cancha",
    pars: Object.fromEntries((l.pars || []).map((h: any) => [Number(h.hole), Number(h.par)])),
    greens: Object.fromEntries((l.greens || []).filter((h: any) => h.center).map((h: any) => [Number(h.hole), h.center as LL])) }));
  const ids = rounds.map(r => r.id);
  const shots: GmShot[] = ids.length ? (await q(`select id, live_round_id, hole, shot_number, lat, lng, club, lie, result, direction from shot where live_round_id = any($1::uuid[])`, [ids]))
    .map((s: any) => ({ ...s, lat: Number(s.lat), lng: Number(s.lng) })) : [];
  const lhRows = ids.length ? await q(`select live_round_id, hole, putts, pin_lat, pin_lng from live_hole where live_round_id = any($1::uuid[])`, [ids]) : [];
  const own = new Map<string, Record<number, LL>>(); for (const h of lhRows) if (h.pin_lat != null) own.set(h.live_round_id, { ...(own.get(h.live_round_id) || {}), [h.hole]: { lat: Number(h.pin_lat), lng: Number(h.pin_lng) } });
  const flags = await flagsForLive(lv.map((l: any) => ({ id: l.id, club_code: l.club_code, vm_course: l.vm_course, date: l.date })), own);
  const H = new Map<string, GmHole>();
  for (const h of lhRows) H.set(`${h.live_round_id}|${h.hole}`, { live_round_id: h.live_round_id, hole: h.hole, putts: h.putts, pin: null, own_pin: h.pin_lat != null });
  for (const [lid, fs] of flags) for (const [hs, f] of Object.entries(fs)) { const k = `${lid}|${hs}`, x = H.get(k) || { live_round_id: lid, hole: Number(hs), putts: null, pin: null, own_pin: false };
    x.pin = { lat: f.lat, lng: f.lng }; x.pin_source = f.source; H.set(k, x); }
  const holes = [...H.values()];
  const M = gameMetrics(rounds, shots, holes), wd = new Set(M.with_data);
  // live rounds with GPS data (shots, putts or pins); round_id = the club scorecard it is linked to (null = not linked yet). Used for "Con GPS: X de N".
  const live = lv.filter((l: any) => wd.has(l.id)).map((l: any) => ({ id: l.id, date: l.date, round_id: l.round_id ?? null }));
  const { with_data: _wd, ...rest } = M; void _wd;
  return { range: range ?? "all", since, ...rest, live };
}
