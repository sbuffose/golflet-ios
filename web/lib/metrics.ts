import { hcpImpact } from "./hcp-impact";
import { hiAttribution, officialIndex } from "./play-rules";
/** Drill-down for every metric tile (web + iOS). Pure over buildData() output. */
export const SCORE_KINDS = { eagles: [-9, -2], birdies: [-1, -1], pars: [0, 0], bogeys: [1, 1], doubles: [2, 99] } as const;
export type ScoreKind = keyof typeof SCORE_KINDS;
export const METRICS = ["rounds", "best-gross", "average", "handicap", ...Object.keys(SCORE_KINDS)] as const;
export type Metric = (typeof METRICS)[number];
export type Opts = { scope: "year" | "since" | "all"; year: string; course: string; sort: "date" | "gross" | "net" | "count"; order: "asc" | "desc"; range?: Range | null; since?: string | null };

/** Period selector shared by web + iOS: 1m = este mes (calendar month), 3m/6m/12m = rolling months back from today, all = histórico. */
export const RANGES = ["1m", "3m", "6m", "12m", "all"] as const;
export type Range = (typeof RANGES)[number];
export const RANGE_LABEL: Record<Range, string> = { "1m": "Este mes", "3m": "3 meses", "6m": "6 meses", "12m": "Año", all: "Histórico" };
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
/** First date (YYYY-MM-DD, inclusive) of a range, or null for "all". `now` is read in Argentina time (UTC-3). */
export function rangeSince(range: Range, now = new Date()): string | null {
  if (range === "all") return null;
  const ar = new Date(now.getTime() - 3 * 3600_000), y = ar.getUTCFullYear(), m = ar.getUTCMonth(), d = ar.getUTCDate();
  if (range === "1m") return iso(new Date(y, m, 1));
  const n = range === "3m" ? 3 : range === "6m" ? 6 : 12;
  const t = new Date(y, m - n, 1), last = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate();
  return iso(new Date(t.getFullYear(), t.getMonth(), Math.min(d, last)));
}
const inScope = (date: string, o: Opts) => o.range ? (o.since == null || date >= o.since) : (o.scope === "all" || (o.scope === "since" ? date >= o.year : date.startsWith(o.year)));


const mean = (a: number[]) => (a.length ? Math.round((a.reduce((s, x) => s + x, 0) / a.length) * 10) / 10 : null);
const isValid = (r: any) => r.valid_card && r.gross && !r.is_9_holes;

/** Course filter options: each of the user's courses (key = course_key) + "other" (other clubs) */
export function courseOptions(D: any) {
  const opts = (D.courses || []).map((c: any) => ({ key: c.key, label: c.label, rounds: D.rounds.filter((r: any) => r.course_key === c.key).length }));
  const other = D.rounds.filter((r: any) => r.other_course || !(D.courses || []).some((c: any) => c.key === r.course_key)).length;
  return [{ key: "all", label: "Todas", rounds: D.rounds.length }, ...opts, ...(other ? [{ key: "other", label: "Otras canchas", rounds: other }] : [])];
}
function filterRounds(D: any, o: Opts) {
  const known = new Set((D.courses || []).map((c: any) => c.key));
  return D.rounds.filter((r: any) => inScope(r.date, o) &&
    (o.course === "all" || (o.course === "other" ? (r.other_course || !known.has(r.course_key)) : r.course_key === o.course)));
}
const row = (r: any) => ({ round_id: r.round_id, date: r.date, tournament: r.tournament ?? null, club_name: r.club_name, course: r.course, course_key: r.course_key,
  course_label: r.course_label || r.course, tee: r.tee ?? null, gross: r.gross ?? null, net: r.net ?? null, differential: r.differential_computed ?? null,
  valid: !!isValid(r), is_9_holes: !!r.is_9_holes, other_course: !!r.other_course, position: r.position ?? null, field_size: r.field_size ?? null });
function sortRows(rows: any[], o: Opts) {
  const k = o.sort, dir = o.order === "asc" ? 1 : -1;
  return rows.slice().sort((a, b) => {
    if (k === "date") return (a.date < b.date ? -1 : a.date > b.date ? 1 : 0) * dir;
    const x = a[k], y = b[k]; if (x == null && y == null) return 0; if (x == null) return 1; if (y == null) return -1;
    return (x - y) * dir || (a.date < b.date ? 1 : -1);
  });
}

export function monthlyScores(rs: any[]) {
  const m = new Map<string, { month: string; birdies: number; pars: number; rounds: number }>();
  for (const r of rs) { const c = roundCounts(r); if (!c) continue; const k = r.date.slice(0, 7); const e = m.get(k) ?? { month: k, birdies: 0, pars: 0, rounds: 0 }; e.birdies += c.birdies; e.pars += c.pars; e.rounds++; m.set(k, e); }
  return [...m.values()].sort((a, b) => (a.month < b.month ? -1 : 1));
}
export function metricDetail(D: any, metric: Metric, o: Opts) {
  const rs = filterRounds(D, o), valid = rs.filter(isValid);
  const base = { metric, scope: o.scope, year: o.year, course: o.course, sort: o.sort, order: o.order, courses: courseOptions(D),
    range: o.range ?? null, range_label: o.range ? RANGE_LABEL[o.range] : null, since: o.since ?? null, rounds_in_range: rs.length, valid_in_range: valid.length };
  const byDate = (a: any, b: any) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
  if (metric === "handicap") {
    const allHi = [...(D.hi_history || [])].filter((x: any) => x.hi != null).sort(byDate);
    const h = allHi.filter((x: any) => inScope(x.date, o));
    const vals = h.map((x: any) => x.hi);
    const history = h.map((x: any) => {
      const i = allHi.findIndex((y: any) => y.date === x.date);
      const prev = i > 0 ? allHi[i - 1] : null;
      const move = hiAttribution(D, prev?.date ?? null, x.date);
      return { date: x.date, hi: x.hi, club: x.club ?? null, course: null, verified: move.verified,
        entered_best8: move.enteredBest8, left_best8: move.leftBest8, aged_out: move.agedOut, entered_window: move.enteredWindow };
    }).reverse();
    return { ...base, current: officialIndex(D.player?.handicap_index, allHi), low: vals.length ? Math.min(...vals) : null, high: vals.length ? Math.max(...vals) : null,
      change: h.length > 1 ? Math.round((h.at(-1).hi - h[0].hi) * 10) / 10 : null, history,
      series: h.map((x: any) => ({ date: x.date, value: x.hi })),
      // t143u: every stored official record (weekly revisions, equal values kept), the value in force when the range starts,
      // and per-month birdies/pars from real cards (18 holes with par+score, or the club's summary counts) for the chart strip.
      records_total: (D.hi_history || []).length, first_record_date: (D.hi_history || [])[0]?.date ?? null,
      start: o.since ? (() => { const b = (D.hi_history || []).filter((x: any) => x.date < o.since!).at(-1); return b ? { date: o.since, hi: b.hi, record_date: b.date } : null; })() : null,
      monthly_scores: monthlyScores(rs) };
  }
  if (metric === "rounds" || metric === "best-gross" || metric === "average") {
    const list = metric === "rounds" ? rs : valid;
    const g = valid.map((r: any) => r.gross), n = valid.filter((r: any) => r.net != null).map((r: any) => r.net);
    const best = valid.slice().sort((a: any, b: any) => a.gross - b.gross || (a.date < b.date ? 1 : -1))[0];
    const sorted = sortRows(list.map(row), metric === "best-gross" && o.sort === "date" ? { ...o, sort: "gross", order: "asc" } : o);
    return { ...base, summary: { rounds: rs.length, valid_rounds: valid.length, average_gross: mean(g), average_net: mean(n), best_gross: best?.gross ?? null,
      best_round_id: best?.round_id ?? null, worst_gross: g.length ? Math.max(...g) : null }, rounds: sorted,
      series: valid.slice().sort(byDate).map((r: any) => ({ date: r.date, round_id: r.round_id, value: r.gross, net: r.net ?? null })),
      monthly: monthly(valid.map((r: any) => ({ date: r.date, v: r.gross })), metric === "rounds" ? "count" : metric === "best-gross" ? "min" : "avg") };
  }
  const [lo, hi] = SCORE_KINDS[metric as ScoreKind];
  const perHole = new Map<string, { course_key: string; hole: number; par: number | null; count: number }>();
  const rounds = [] as any[], series = [] as any[]; let total = 0, withHoles = 0;
  for (const r of rs) {
    let count: number | null = null, holes: number[] = [];
    if (r.holes?.length) {
      withHoles++;
      holes = r.holes.filter((h: any) => h[1] != null && h[2] != null && h[2] - h[1] >= lo && h[2] - h[1] <= hi).map((h: any) => h[0]);
      count = holes.length;
      for (const h of r.holes.filter((h: any) => holes.includes(h[0]))) {
        const key = `${r.course_key}#${h[0]}`; const e = perHole.get(key) || { course_key: r.course_key, hole: h[0], par: h[1], count: 0 }; e.count++; perHole.set(key, e);
      }
    } else if (r.summary_counts) {
      const s = r.summary_counts;
      count = metric === "birdies" ? s.birdies : metric === "pars" ? s.pars : metric === "bogeys" ? s.bogeys : metric === "doubles" ? (s.double_bogeys || 0) + (s.triple_bogeys || 0) + (s.worse || 0) : null;
    }
    if (count != null) series.push({ date: r.date, round_id: r.round_id, value: count });
    if (count) { total += count; rounds.push({ ...row(r), count, holes, holes_known: !!r.holes?.length }); }
  }
  const label = (k: string) => (D.courses || []).find((c: any) => c.key === k)?.label || k.split(":").slice(1).join(":");
  return { ...base, total, rounds_with_any: rounds.length, rounds_considered: rs.length, rounds_with_hole_detail: withHoles,
    per_round_avg: rs.length ? Math.round((total / rs.length) * 100) / 100 : null,
    per_round: perRound(rs), per_round_metric: (perRound(rs) as any)[metric] ?? null,
    rounds: sortRows(rounds, o), series: series.sort(byDate), monthly: monthly(series.map(x => ({ date: x.date, v: x.value })), "sum"),
    per_hole: [...perHole.values()].map(e => ({ ...e, course_label: label(e.course_key) })).sort((a, b) => b.count - a.count || a.hole - b.hole) };
}


/** Per-round score-type counts for one card: from the hole detail (18 holes with par + strokes) or, failing that, Golfistics' summary counts
 * (which have no eagles → eagles null). 9-hole and incomplete cards → null. Shared by metrics and the round list. */
export function roundCounts(r: any): { eagles: number | null; birdies: number; pars: number; bogeys: number; doubles: number } | null {
  if (r.is_9_holes) return null;
  const hs = (r.holes || []).filter((h: any) => h[1] != null && h[2] != null);
  if (hs.length === 18) { const c = { eagles: 0, birdies: 0, pars: 0, bogeys: 0, doubles: 0 };
    for (const h of hs) { const d = h[2] - h[1]; if (d <= -2) c.eagles++; else if (d === -1) c.birdies++; else if (d === 0) c.pars++; else if (d === 1) c.bogeys++; else c.doubles++; } return c; }
  const s = r.summary_counts; if (!s || r.holes?.length) return null;
  const c = { eagles: null, birdies: s.birdies || 0, pars: s.pars || 0, bogeys: s.bogeys || 0, doubles: (s.double_bogeys || 0) + (s.triple_bogeys || 0) + (s.worse || 0) };
  return c.birdies + c.pars + c.bogeys + c.doubles >= 17 ? c : null;
}
/** Chip fields for the round list (iOS + web): counts or null when the card has no usable detail; putts from notes, else GPS. */
export function roundChips(r: any, putts: number | null, gpsPutts: number | null) {
  const c = roundCounts(r);
  return { eagles: c ? c.eagles : null, birdies: c ? c.birdies : null, pars: c ? c.pars : null, bogeys: c ? c.bogeys : null, double_plus: c ? c.doubles : null,
    putts_total: putts != null && putts > 0 ? putts : gpsPutts && gpsPutts > 0 ? gpsPutts : null, putts_source: putts != null && putts > 0 ? "notes" : gpsPutts && gpsPutts > 0 ? "gps" : null };
}
const median = (a: number[]) => { if (!a.length) return null; const x = a.slice().sort((p, q) => p - q), m = x.length >> 1; return x.length % 2 ? x[m] : (x[m - 1] + x[m]) / 2; };
/** Mean + median per round (never a geometric mean: zero-birdie rounds are common). */
export function perRound(rs: any[]) {
  const cs = rs.map(roundCounts).filter((c): c is NonNullable<ReturnType<typeof roundCounts>> => !!c);
  const stat = (k: "eagles" | "birdies" | "pars" | "bogeys" | "doubles") => { const v = cs.map(c => c[k]).filter((x): x is number => x != null);
    return { mean: v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 100) / 100 : null, median: median(v), rounds: v.length }; };
  return { rounds: cs.length, eagles: stat("eagles"), birdies: stat("birdies"), pars: stat("pars"), bogeys: stat("bogeys"), doubles: stat("doubles"),
    basis: "Tarjetas de 18 hoyos con detalle por hoyo (o el resumen que publica el club); las de 9 hoyos e incompletas no cuentan." };
}

/** Per-month aggregate (YYYY-MM) used by the chart-over-time views. */
function monthly(pts: { date: string; v: number }[], how: "avg" | "min" | "sum" | "count") {
  const m = new Map<string, number[]>(); for (const x of pts) { const k = x.date.slice(0, 7); (m.get(k) || m.set(k, []).get(k)!).push(x.v); }
  return [...m.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([month, v]) => ({ month, rounds: v.length,
    value: how === "count" ? v.length : how === "sum" ? v.reduce((s, x) => s + x, 0) : how === "min" ? Math.min(...v) : mean(v) }));
}

export function parseRange(v: string | null | undefined): Range | null { return (RANGES as readonly string[]).includes(v || "") ? (v as Range) : null; }

export function parseOpts(u: URL, now = new Date()): Opts {
  const p = (k: string) => u.searchParams.get(k);
  const range = parseRange(p("range"));
  const year = /^\d{4}$/.test(p("year") || "") ? p("year")! : String(now.getFullYear());
  return { scope: p("scope") === "all" ? "all" : p("scope") === "since" ? "since" : "year", year, course: (p("course") || "all").slice(0, 120),
    sort: (["gross", "net", "count"].includes(p("sort") || "") ? p("sort") : "date") as Opts["sort"], order: p("order") === "asc" ? "asc" : "desc",
    range, since: range ? rangeSince(range, now) : null };
}

/** Range-filtered tiles for Inicio / Resumen / Cancha (GET /api/metrics/summary?range=&course=). */
export function metricSummary(D: any, o: Opts) {
  const rs = filterRounds(D, o), valid = rs.filter(isValid);
  const g = valid.map((r: any) => r.gross), n = valid.filter((r: any) => r.net != null).map((r: any) => r.net);
  const best = valid.slice().sort((a: any, b: any) => a.gross - b.gross || (a.date < b.date ? 1 : -1))[0];
  const worst = valid.slice().sort((a: any, b: any) => b.gross - a.gross || (a.date < b.date ? 1 : -1))[0];
  const counts = { eagles: 0, birdies: 0, pars: 0, bogeys: 0, doubles: 0 };
  const holes = new Map<string, { course_key: string; hole: number; par: number | null; n: number; over: number }>();
  for (const r of rs) {
    if (r.holes?.length) for (const h of r.holes) {
      if (h[1] == null || h[2] == null) continue; const d = h[2] - h[1];
      if (d <= -2) counts.eagles++; else if (d === -1) counts.birdies++; else if (d === 0) counts.pars++; else if (d === 1) counts.bogeys++; else counts.doubles++;
      const k = `${r.course_key}#${h[0]}`; const e = holes.get(k) || { course_key: r.course_key, hole: h[0], par: h[1], n: 0, over: 0 }; e.n++; e.over += d; holes.set(k, e);
    } else if (r.summary_counts) { const s = r.summary_counts; counts.birdies += s.birdies || 0; counts.pars += s.pars || 0; counts.bogeys += s.bogeys || 0; counts.doubles += (s.double_bogeys || 0) + (s.triple_bogeys || 0) + (s.worse || 0); }
  }
  const pick = (r: any) => r ? { round_id: r.round_id, date: r.date, gross: r.gross, net: r.net ?? null, course_key: r.course_key, course_label: r.course_label || r.course } : null;
  const course_options = courseOptions(D), course_groups = D.course_groups ?? null;
  return { hcp_impact: hcpImpact(D, o.range ? (o.since ?? null) : null), course_options, course_groups, range: o.range ?? "all", range_label: RANGE_LABEL[o.range ?? "all"], since: o.since ?? null, course: o.course,
    rounds: rs.length, valid_rounds: valid.length, average_gross: mean(g), average_net: mean(n), best: pick(best), worst: pick(worst),
    differential_best: valid.filter((r: any) => r.differential_computed != null).reduce((m: number | null, r: any) => m == null || r.differential_computed < m ? r.differential_computed : m, null),
    score_counts: counts, per_round: perRound(rs),
    holes: [...holes.values()].map(e => ({ course_key: e.course_key, hole: e.hole, par: e.par, n: e.n, avg_to_par: Math.round((e.over / e.n) * 100) / 100 }))
      .sort((a, b) => (a.course_key < b.course_key ? -1 : a.course_key > b.course_key ? 1 : a.hole - b.hole)) };
}
