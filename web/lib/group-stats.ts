/** Pure group-comparison math (no DB): per-member aggregates and the "Qué comparto" filter. */
import type { Share } from "./group-share";

export type NR = { round_id?: string; par?: number | null; date: string; year: string; course_key: string; course_label: string; gross: number | null; net: number | null; holes: [number, number, number][]; putts: number | null; gir: number | null; fir: number | null };
const r1 = (x: number | null) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10) / 10);
const mean = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
const TYPES = [["eagles", (d: number) => d <= -2], ["birdies", (d: number) => d === -1], ["pars", (d: number) => d === 0], ["bogeys", (d: number) => d === 1], ["doubles", (d: number) => d >= 2]] as const;
/** Highest birdie count on one real hole card. An eagle is not a birdie. A round without hole scores does not count. */
export function maxBirdiesInRound(rs: { holes: [number, number, number][] }[]): number | null {
  const scored = rs.filter(r => r.holes.some(h => h[1] && h[2]));
  if (!scored.length) return null;
  return Math.max(...scored.map(r => r.holes.filter(h => h[1] && h[2] && h[2] - h[1] === -1).length));
}

export function memberStats(rs: NR[]) {
  const g = rs.map(r => r.gross!).filter(Boolean), n = rs.map(r => r.net).filter((x): x is number => x != null);
  const holes = rs.flatMap(r => r.holes.filter(h => h[1] && h[2]));
  const types: any = {}; for (const [k, f] of TYPES) { const c = holes.filter(h => f(h[2] - h[1])).length; types[k] = { total: c, per_round: rs.length ? r1(c / rs.length) : null }; }
  const maxBirdies = maxBirdiesInRound(rs);
  types.max_birdies = { total: maxBirdies, per_round: null };
  const par: any = {}; for (const p of [3, 4, 5]) { const hs = holes.filter(h => h[1] === p); par[`par${p}`] = { avg: r1(mean(hs.map(h => h[2]))), avg_to_par: r1(mean(hs.map(h => h[2] - p))), n: hs.length }; }
  const pu = rs.filter(r => r.putts != null), gi = rs.filter(r => r.gir != null), fi = rs.filter(r => r.fir != null);
  const months = new Map<string, number[]>(); for (const r of rs) { const k = r.date.slice(0, 7); months.set(k, [...(months.get(k) || []), r.gross!]); }
  return {
    rounds: rs.length, avg_gross: r1(mean(g)), best_gross: g.length ? Math.min(...g) : null, avg_net: r1(mean(n)), best_net: n.length ? Math.min(...n) : null,
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
  if (sh.scores) Object.assign(m, { rounds: st.rounds, avg_gross: st.avg_gross, best_gross: st.best_gross, avg_net: st.avg_net, best_net: st.best_net, trend: st.trend, by_year: st.by_year, by_course: extra.by_course });
  if (sh.handicap && extra.hi != null) m.handicap_index = extra.hi;
  if (sh.score_types) m.types = st.types;
  if (sh.holes) m.par = st.par;
  if (sh.putting || sh.gir_fir) m.putting = { ...(sh.putting ? { rounds: st.putting.rounds, avg_putts: st.putting.avg_putts } : {}),
    ...(sh.gir_fir ? { rounds_gir: st.putting.rounds_gir, avg_gir: st.putting.avg_gir, rounds_fir: st.putting.rounds_fir, avg_fir: st.putting.avg_fir } : {}) };
  return m;
}
