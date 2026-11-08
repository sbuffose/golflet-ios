/** Pure benchmark math (no DB) — see lib/benchmark.ts. */
export const BAND = 3, MIN_PLAYERS = 5, MIN_ROUNDS = 20;
const r1 = (x: number | null) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10) / 10);
const r2 = (x: number | null) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 100) / 100);
const mean = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
const normTee = (t: unknown) => String(t ?? "").trim().toLowerCase();
export type R = { date: string; gross: number; net: number | null; holes: [number, number, number][]; hi?: number | null; uid?: string };

export function holeAverages(rs: R[]) {
  const m = new Map<number, { hole: number; par: number; n: number; over: number }>();
  for (const r of rs) for (const h of r.holes || []) {
    if (h?.[1] == null || h?.[2] == null) continue; const e = m.get(h[0]) || { hole: h[0], par: h[1], n: 0, over: 0 }; e.n++; e.over += h[2] - h[1]; m.set(h[0], e);
  }
  return [...m.values()].sort((a, b) => a.hole - b.hole).map(e => ({ hole: e.hole, par: e.par, n: e.n, avg_to_par: r2(e.over / e.n) }));
}
/** Integer histogram with fixed-width bins (no individual values leave the server). */
export function histogram(vals: number[], width: number) {
  if (!vals.length) return [];
  const lo = Math.floor(Math.min(...vals) / width) * width, hi = Math.floor(Math.max(...vals) / width) * width, out = [];
  for (let b = lo; b <= hi; b += width) out.push({ from: b, to: b + width - (width >= 1 && Number.isInteger(width) ? 1 : 0), count: vals.filter(v => v >= b && v < b + width).length });
  return out;
}
/** Share of peer values the player beats (lower is better). */
export function betterThan(me: number | null, peers: number[]) {
  if (me == null || !peers.length) return null;
  return Math.round((peers.filter(v => v > me).length + 0.5 * peers.filter(v => v === me).length) / peers.length * 100);
}
/** Pure core: given my rounds, peers' rounds (with HI at round time) and my HI → benchmark payload. */
export function computeBenchmark(mine: R[], peers: R[], hi: number | null) {
  const withHi = peers.filter(r => r.hi != null && Number.isFinite(r.hi));
  const excluded = peers.length - withHi.length;
  const inBand = hi == null ? [] : withHi.filter(r => Math.abs((r.hi as number) - hi) <= BAND);
  const players = new Set(inBand.map(r => r.uid)).size;
  const sufficient = hi != null && players >= MIN_PLAYERS && inBand.length >= MIN_ROUNDS;
  const me = { rounds: mine.length, avg_gross: r1(mean(mine.map(r => r.gross))), avg_net: r1(mean(mine.filter(r => r.net != null).map(r => r.net as number))), holes: holeAverages(mine) };
  const bench = sufficient ? { avg_gross: r1(mean(inBand.map(r => r.gross))), avg_net: r1(mean(inBand.filter(r => r.net != null).map(r => r.net as number))), holes: holeAverages(inBand) } : null;
  return { hi, band: hi == null ? null : [r1(hi - BAND), r1(hi + BAND)], sufficient, min: { players: MIN_PLAYERS, rounds: MIN_ROUNDS },
    sample: { players, rounds: inBand.length, excluded_no_handicap: excluded }, me, bench, _inBand: inBand };
}

