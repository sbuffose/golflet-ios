/** Pure group-comparison math (no DB): per-member aggregates and the "Qué comparto" filter. */
import type { Share } from "./group-share";

export type NR = { round_id?: string; par?: number | null; nine?: boolean; date: string; year: string; course_key: string; course_label: string; gross: number | null; net: number | null; holes: [number, number, number][]; putts: number | null; gir: number | null; fir: number | null };
const r1 = (x: number | null) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10) / 10);
const isoDay = (y: number, m: number, d: number) => `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
/** Competition periods for a group. Calendar bounds in Argentina (UTC−3). Legacy 3m/6m/12m stay rolling so a saved view still filters. */
export const GROUP_PERIODS = ["1w", "1m", "3q", "6s", "12y", "all"] as const;
export type GroupPeriod = (typeof GROUP_PERIODS)[number];
export const PERIOD_MIN: Record<string, number> = { "1w": 1, "1m": 2, "3q": 3, "6s": 4, "12y": 4, all: 3, "3m": 3, "6m": 4, "12m": 4 };
export function groupWindow(range: string | null | undefined, now = new Date()) {
  const ar = new Date(now.getTime() - 3 * 3600_000);
  const y = ar.getUTCFullYear(), m = ar.getUTCMonth(), d = ar.getUTCDate();
  const day = (yy: number, mm: number, dd: number) => isoDay(yy, mm, dd);
  const shift = (yy: number, mm: number, dd: number, delta: number) => {
    const t = new Date(Date.UTC(yy, mm, dd + delta));
    return day(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate());
  };
  const pack = (key: string, since: string | null, until: string | null, prevSince: string | null, prevUntil: string | null) => ({ key, since, until, prevSince, prevUntil, min: PERIOD_MIN[key] ?? 3 });
  if (range === "1w") {
    const dow = (new Date(Date.UTC(y, m, d)).getUTCDay() + 6) % 7;
    const since = shift(y, m, d, -dow), until = shift(y, m, d, -dow + 7);
    return pack("1w", since, until, shift(y, m, d, -dow - 7), since);
  }
  if (range === "1m") return pack("1m", day(y, m, 1), day(y, m + 1, 1), day(y, m - 1, 1), day(y, m, 1));
  if (range === "3q") { const q = Math.floor(m / 3) * 3; return pack("3q", day(y, q, 1), day(y, q + 3, 1), day(y, q - 3, 1), day(y, q, 1)); }
  if (range === "6s") { const h = m < 6 ? 0 : 6; return pack("6s", day(y, h, 1), day(y, h + 6, 1), day(y, h - 6, 1), day(y, h, 1)); }
  if (range === "12y") return pack("12y", day(y, 0, 1), day(y + 1, 0, 1), day(y - 1, 0, 1), day(y, 0, 1));
  if (range === "3m" || range === "6m" || range === "12m") {
    const n = range === "3m" ? 3 : range === "6m" ? 6 : 12;
    const t = new Date(Date.UTC(y, m - n, 1));
    const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
    const since = day(t.getUTCFullYear(), t.getUTCMonth(), Math.min(d, last));
    return pack(range, since, null, null, null);
  }
  return pack("all", null, null, null, null);
}
export const inWindow = (date: string, since: string | null, until: string | null) => (!since || date >= since) && (!until || date < until);
const mean = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
const TYPES = [["eagles", (d: number) => d <= -2], ["birdies", (d: number) => d === -1], ["pars", (d: number) => d === 0], ["bogeys", (d: number) => d === 1], ["doubles", (d: number) => d >= 2]] as const;
/** Highest birdie count on one real hole card. An eagle is not a birdie. A round without hole scores does not count. */
export function maxBirdiesInRound(rs: { holes: [number, number, number][] }[]): number | null {
  const scored = rs.filter(r => r.holes.some(h => h[1] && h[2]));
  if (!scored.length) return null;
  return Math.max(...scored.map(r => r.holes.filter(h => h[1] && h[2] && h[2] - h[1] === -1).length));
}

/** Longest run of 18-hole cards at par or better, in date order. A 9-hole card does not enter the streak or the gross average. */
export function scoreStreak(rs: NR[]): number | null {
  const full = rs.filter(r => !r.nine && r.gross != null && r.par).sort((a, b) => a.date.localeCompare(b.date));
  if (!full.length) return null;
  let best = 0, cur = 0;
  for (const r of full) { if (r.gross! - r.par! <= 0) { cur += 1; best = Math.max(best, cur); } else cur = 0; }
  return best;
}
/** Sample standard deviation of 18-hole gross. Null until there are 3 cards. */
export function grossSpread(rs: NR[]): { sd: number | null; n: number } {
  const g = rs.filter(r => !r.nine && r.gross != null).map(r => r.gross!);
  if (g.length < 3) return { sd: null, n: g.length };
  const m = mean(g)!;
  const sd = Math.sqrt(g.reduce((s, x) => s + (x - m) ** 2, 0) / (g.length - 1));
  return { sd: r1(sd), n: g.length };
}
/** Holes with the highest average over par on one course. Needs at least two real scores. */
export function worstHoles(rs: { holes: [number, number, number][] }[]) {
  const bag = new Map<number, { par: number; tp: number[] }>();
  for (const r of rs) for (const h of r.holes || []) {
    if (!h[0] || !h[1] || !h[2]) continue;
    const e = bag.get(h[0]) || { par: h[1], tp: [] as number[] };
    e.tp.push(h[2] - h[1]);
    bag.set(h[0], e);
  }
  return [...bag.entries()].map(([hole, e]) => ({ hole, par: e.par, n: e.tp.length, avg_to_par: r1(mean(e.tp)) }))
    .filter(x => x.n >= 2 && x.avg_to_par != null)
    .sort((a, b) => (b.avg_to_par! - a.avg_to_par!) || a.hole - b.hole)
    .slice(0, 3);
}
export function memberStats(rs: NR[]) {
  const full = rs.filter(r => !r.nine);
  const g = full.map(r => r.gross!).filter(Boolean), n = full.map(r => r.net).filter((x): x is number => x != null);
  const holes = rs.flatMap(r => r.holes.filter(h => h[1] && h[2]));
  const types: any = {}; for (const [k, f] of TYPES) { const c = holes.filter(h => f(h[2] - h[1])).length; types[k] = { total: holes.length ? c : null, per_round: full.length && holes.length ? r1(c / full.length) : null }; }
  const maxBirdies = maxBirdiesInRound(rs);
  types.max_birdies = { total: maxBirdies, per_round: null };
  const aces = holes.filter(h => h[2] === 1).length;
  types.aces = { total: holes.length ? aces : null, per_round: full.length && holes.length ? r1(aces / full.length) : null };
  const par: any = {}; for (const p of [3, 4, 5]) { const hs = holes.filter(h => h[1] === p); par[`par${p}`] = { avg: r1(mean(hs.map(h => h[2]))), avg_to_par: r1(mean(hs.map(h => h[2] - p))), n: hs.length }; }
  const pu = full.filter(r => r.putts != null), gi = full.filter(r => r.gir != null), fi = full.filter(r => r.fir != null);
  const months = new Map<string, number[]>(); for (const r of full) if (r.gross != null) { const k = r.date.slice(0, 7); months.set(k, [...(months.get(k) || []), r.gross]); }
  return {
    rounds: full.length, cards_18: full.length, cards_9: rs.filter(r => r.nine).length,
    avg_gross: r1(mean(g)), best_gross: g.length ? Math.min(...g) : null, avg_net: r1(mean(n)), best_net: n.length ? Math.min(...n) : null,
    consistency: grossSpread(rs), streak: scoreStreak(rs),
    types, par,
    putting: { rounds: pu.length, avg_putts: r1(mean(pu.map(r => r.putts!))), rounds_gir: gi.length, avg_gir: r1(mean(gi.map(r => r.gir!))), rounds_fir: fi.length, avg_fir: r1(mean(fi.map(r => r.fir!))) },
    trend: [...months.entries()].sort().map(([m, xs]) => ({ month: m, avg_gross: r1(mean(xs)), rounds: xs.length })),
    by_year: Object.entries(rs.reduce((a: any, r) => { a[r.year] = (a[r.year] || 0) + 1; return a; }, {})).map(([year, n]) => ({ year, rounds: n })).sort((a, b) => a.year.localeCompare(b.year)),
  };
}

/** Sharing categories that change what a member exposes in a group (the rest are not part of the comparison yet). */
export const CMP_KEYS = ["scores", "handicap", "score_types", "holes", "gir_fir", "putting", "gps"] as const;
/** Applies "Qué comparto": hidden metrics are OMITTED (never zeroed); `hidden` lists them so the UI can say "No compartido". */
export function shareMember(base: any, st: ReturnType<typeof memberStats>, sh: Share, extra: { hi: number | null; by_course: any[] }) {
  const m: any = { ...base, hidden: CMP_KEYS.filter(k => !sh[k]) };
  if (sh.scores) Object.assign(m, { rounds: st.rounds, cards_18: st.cards_18, cards_9: st.cards_9, avg_gross: st.avg_gross, best_gross: st.best_gross, avg_net: st.avg_net, best_net: st.best_net, consistency: st.consistency, streak: st.streak, trend: st.trend, by_year: st.by_year, by_course: extra.by_course });
  if (sh.handicap && extra.hi != null) m.handicap_index = extra.hi;
  if (sh.score_types) m.types = st.types;
  if (sh.holes) m.par = st.par;
  if (sh.putting || sh.gir_fir) m.putting = { ...(sh.putting ? { rounds: st.putting.rounds, avg_putts: st.putting.avg_putts } : {}),
    ...(sh.gir_fir ? { rounds_gir: st.putting.rounds_gir, avg_gir: st.putting.avg_gir, rounds_fir: st.putting.rounds_fir, avg_fir: st.putting.avg_fir } : {}) };
  return m;
}
