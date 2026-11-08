/** t163u: group Comparativo (Semana | Mes), member profiles and shared scorecards. Permissions are enforced HERE (server-side):
 *  - only accepted members of the group get anything (404 otherwise, the group's existence is not revealed);
 *  - every number passes the member's effective "Qué comparto" (profile → per-group override);
 *  - a member's profile needs `profile`; their round list and scorecards need `rounds_detail` + `scores`;
 *  - the viewer's own profile goes through the SAME filter ("Así te ven"), no bypass;
 *  - never read here: notes, voice, strategy, tee times / playing partners (private metrics), GPS shot positions. */
import { HttpError } from "./http";
import { artToday } from "./pins-core";
import { loadGroup, memberRounds, publicNames, colorOf, memberStats, shareMember } from "./groups";
import { effectiveShare, type Share } from "./group-share";
import { loadGameMetrics } from "./game-metrics";
import { PKINDS, periodBounds, periodStats, shareStats, board, leaderboard, STATS, MINS, profileRound, profileCard, type PKind, type PRound, type GpsHole } from "./group-period-core";

const UUID = /^[0-9a-f-]{36}$/i;
const hiAt = (h: { date: string; hi: number }[], date: string, strictBefore: boolean) => { let v: number | null = null; for (const x of h) if (strictBefore ? x.date < date : x.date <= date) v = x.hi; return v; };

async function gpsFor(userId: string, from: string, to: string, cards: Map<string, [number, number, number][]>) {
  const M: any = await loadGameMetrics(userId, null, { from, to });
  const link = new Map<string, string | null>((M.live || []).map((l: any) => [l.id, l.round_id == null ? null : String(l.round_id)]));
  const holes: GpsHole[] = (M.gir?.holes_list || []).map((h: any) => { const rid = link.get(h.live_round_id) ?? null, card = rid ? cards.get(rid)?.find(x => x[0] === h.hole)?.[2] ?? null : null;
    return { live_round_id: h.live_round_id, round_id: rid, hole: h.hole, par: h.par ?? null, gir: h.gir, putts: h.putts ?? null, card: card || null }; });
  // putts on holes without a GIR verdict still count for putts per round (full 18) — those come from M.putts.rounds
  const drives = (M.tee?.shots || []).map((d: any) => d.outcome ?? null);
  const full18 = (M.putts?.rounds || []).map((r: any) => r.putts);
  return { holes, drives, full18, linked: [...link.values()].filter((x): x is string => !!x) };
}

export async function groupPeriod(groupId: string, viewerId: string, kind: PKind, off: number, today = artToday()) {
  if (!PKINDS.includes(kind)) throw new HttpError(400, "kind tiene que ser semana o mes");
  const { group, members } = await loadGroup(groupId, viewerId, "member");
  const P = periodBounds(kind, off, today);
  const acc = members.filter(m => m.status === "accepted" && m.user_id);
  const names = await publicNames(acc.map(m => m.user_id!)), share = await effectiveShare(groupId, acc.map(m => m.user_id!));
  const out = await Promise.all(acc.map(async (m, i) => {
    const sh = share.get(m.user_id!)!, needCards = sh.scores || sh.handicap || sh.score_types || sh.holes || sh.gir_fir || sh.putting;
    const d = needCards ? await memberRounds(m.user_id!) : { rounds: [], hi_history: [] as any[] };
    const rs: PRound[] = (d.rounds as any[]).filter(r => r.date >= P.from && r.date <= P.to).map(r => ({ round_id: String(r.round_id), date: r.date, course_label: r.course_label, gross: r.gross, net: r.net, par: r.par ?? null, holes: r.holes, putts: r.putts, gir: r.gir, fir: r.fir }));
    const cards = new Map<string, [number, number, number][]>((d.rounds as any[]).map(r => [String(r.round_id), r.holes]));
    // GPS is only read for members who share greens/fairways or putts
    const gps = sh.gir_fir || sh.putting ? await gpsFor(m.user_id!, P.from, P.to, cards) : { holes: [], drives: [], full18: [], linked: [] };
    if (!sh.gir_fir) { gps.drives = []; gps.holes = gps.holes.map(h => ({ ...h, gir: sh.putting ? h.gir : null })); }
    const raw = periodStats({ rounds: rs, hiStart: hiAt(d.hi_history, P.from, true), hiEnd: hiAt(d.hi_history, P.to, false), gps });
    return { member_id: m.member_id, name: names.get(m.user_id!) || "Jugador", color: colorOf(members, m.member_id, i), is_me: m.user_id === viewerId,
      profile: !!sh.profile, stats: shareStats(raw, sh, kind) };
  }));
  const boards = Object.fromEntries(STATS.map(s => [s.key, board(out, s.key)]));
  const gpsAny = STATS.filter(s => s.gps).some(s => out.some(m => m.stats[s.key]?.v != null));
  return { group: { id: group.id, name: group.name }, period: P, today, mins: MINS[kind], stats: STATS, members: out, leaderboard: leaderboard(out), boards,
    data: { scorecards: out.reduce((n, m) => n + (m.stats.rounds?.v || 0), 0), gps_or_cards_any: gpsAny } };
}

/** A member's profile as seen by the viewer (who must be an accepted member). Locked → name + color only. */
export async function memberProfile(groupId: string, viewerId: string, memberId: string) {
  if (!UUID.test(memberId || "")) throw new HttpError(404, "Jugador no encontrado");
  const { group, members } = await loadGroup(groupId, viewerId, "member");
  const m = members.find(x => x.member_id === memberId && x.status === "accepted" && x.user_id); if (!m) throw new HttpError(404, "Jugador no encontrado");
  const sh: Share = (await effectiveShare(groupId, [m.user_id!])).get(m.user_id!)!;
  const name = (await publicNames([m.user_id!])).get(m.user_id!) || "Jugador";
  const base = { member_id: m.member_id, name, color: colorOf(members, m.member_id), is_me: m.user_id === viewerId, is_admin: m.role === "admin" };
  if (!sh.profile) return { group: { id: group.id, name: group.name }, member: base, locked: true };
  const d = await memberRounds(m.user_id!);
  const since = new Date(Date.parse(artToday() + "T12:00:00Z") - 365 * 864e5).toISOString().slice(0, 10);
  const year = d.rounds.filter(r => r.date >= since);
  const st: any = shareMember(base, memberStats(year), sh, { hi: d.hi, by_course: [] });
  delete st.by_course; delete st.by_year;
  const detail = sh.rounds_detail && sh.scores;
  return {
    group: { id: group.id, name: group.name }, member: base, locked: false,
    clubs: d.clubs.slice(0, 4),
    shares: { scores: sh.scores, handicap: sh.handicap, score_types: sh.score_types, holes: sh.holes, gir_fir: sh.gir_fir, putting: sh.putting, rounds_detail: detail },
    year: st, year_since: since,
    hi_history: sh.handicap ? d.hi_history.filter(h => h.date >= since).slice(-24) : undefined,
    rounds: detail ? d.rounds.slice().sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 20).map(r => profileRound(r as any)) : undefined,
  };
}
/** One shared scorecard (needs `profile` + `rounds_detail` + `scores`). Per-hole scores, plus putts/GIR/FIR only if shared. */
export async function memberCard(groupId: string, viewerId: string, memberId: string, roundId: string) {
  if (!UUID.test(memberId || "") || !/^[0-9a-zA-Z-]{1,40}$/.test(roundId || "")) throw new HttpError(404, "Ronda no encontrada");
  const { members } = await loadGroup(groupId, viewerId, "member");
  const m = members.find(x => x.member_id === memberId && x.status === "accepted" && x.user_id); if (!m) throw new HttpError(404, "Jugador no encontrado");
  const sh: Share = (await effectiveShare(groupId, [m.user_id!])).get(m.user_id!)!;
  if (!sh.profile || !sh.rounds_detail || !sh.scores) throw new HttpError(403, "Este jugador no comparte sus tarjetas.");
  const r = (await memberRounds(m.user_id!)).rounds.find(x => String(x.round_id) === roundId); if (!r) throw new HttpError(404, "Ronda no encontrada");
  const name = (await publicNames([m.user_id!])).get(m.user_id!) || "Jugador";
  return { member: { member_id: m.member_id, name, color: colorOf(members, m.member_id), is_me: m.user_id === viewerId }, card: profileCard(r as any, sh) };
}
