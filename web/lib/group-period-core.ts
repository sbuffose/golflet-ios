/**
 * t163u: weekly / monthly group comparison ("Comparativo"), pure math (no DB).
 * Leaderboard + PGA-style boards computed ONLY from real data:
 *  - club scorecards (strokes + par per hole): rounds, best/avg score, birdies, pars, bogey avoidance, scoring average by par
 *  - Hándicap history: HI change in the period
 *  - GIR / fairways / putts: GPS live rounds (per hole) + the counts the player typed on a scorecard (round_note);
 *    a scorecard linked to a GPS round with data counts once (GPS wins). Scrambling: GPS missed greens on rounds linked to a scorecard.
 * Every stat is gated by the member's "Qué comparto" category; hidden stats are omitted (never zeroed).
 */
import type { Share } from "./group-share";

export type PKind = "semana" | "mes";
export const PKINDS: PKind[] = ["semana", "mes"];
const MES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const MES3 = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const iso = (d: Date) => d.toISOString().slice(0, 10);
const D = (s: string) => new Date(s + "T12:00:00Z");
export const MAX_OFF: Record<PKind, number> = { semana: 104, mes: 36 };

/** Calendar week (Monday–Sunday) or calendar month in Argentina time. off = 0 current, 1 previous, … */
export function periodBounds(kind: PKind, off: number, today: string) {
  const o = Math.max(0, Math.min(MAX_OFF[kind], Math.floor(Number(off) || 0)));
  const t = D(today);
  let from: Date, to: Date, label: string, short: string;
  if (kind === "semana") {
    const dow = (t.getUTCDay() + 6) % 7;                       // Monday = 0
    from = new Date(t.getTime() - (dow + 7 * o) * 864e5); to = new Date(from.getTime() + 6 * 864e5);
    const f = `${from.getUTCDate()} ${MES3[from.getUTCMonth()]}`, tt = `${to.getUTCDate()} ${MES3[to.getUTCMonth()]}`;
    label = `Semana del ${f} al ${tt} ${to.getUTCFullYear()}`; short = o === 0 ? "Esta semana" : o === 1 ? "La semana pasada" : `${f} – ${tt}`;
  } else {
    from = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() - o, 1, 12)); to = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 0, 12));
    const m = MES[from.getUTCMonth()]; label = `${m[0].toUpperCase()}${m.slice(1)} ${from.getUTCFullYear()}`; short = o === 0 ? "Este mes" : o === 1 ? "El mes pasado" : label;
  }
  const f = iso(from), tt = iso(to);
  return { kind, off: o, from: f, to: tt, label, short, is_current: o === 0, in_progress: o === 0 && today < tt, prev_off: o < MAX_OFF[kind] ? o + 1 : null, next_off: o > 0 ? o - 1 : null };
}

/* ---------- stats ---------- */
export type Cat = "scores" | "handicap" | "score_types" | "holes" | "gir_fir" | "putting";
type Min = "r" | "gh" | "dr" | "mg" | "pr" | "gp" | null;  // rounds · GIR holes · drives · missed greens · rounds with putts · GIR holes with putts
export type StatDef = { key: string; label: string; short: string; cat: Cat; low: boolean; fmt: "n" | "f" | "p" | "tp" | "hi" | "f2"; min: Min; gps?: boolean; desc: string };
export const STATS: StatDef[] = [
  { key: "rounds", label: "Rondas jugadas", short: "Rondas", cat: "scores", low: false, fmt: "n", min: null, desc: "Tarjetas de 18 hoyos válidas en el período." },
  { key: "best_net", label: "Mejor neto vs par", short: "Mejor neto", cat: "scores", low: true, fmt: "tp", min: null, desc: "El mejor neto del período comparado con el par de la cancha." },
  { key: "best_gross", label: "Mejor gross vs par", short: "Mejor gross", cat: "scores", low: true, fmt: "tp", min: null, desc: "El mejor gross del período comparado con el par de la cancha." },
  { key: "avg_gross", label: "Promedio de golpes", short: "Promedio", cat: "scores", low: true, fmt: "f", min: "r", desc: "Scoring average: golpes promedio por ronda (gross)." },
  { key: "hi_change", label: "Cambio de hándicap", short: "Hándicap", cat: "handicap", low: true, fmt: "hi", min: null, desc: "Hándicap Index al final del período menos el del inicio. Negativo es mejor." },
  { key: "eagles", label: "Águilas o mejor", short: "Águilas", cat: "score_types", low: false, fmt: "n", min: null, desc: "Hoyos en dos o más golpes bajo el par." },
  { key: "birdies", label: "Birdies", short: "Birdies", cat: "score_types", low: false, fmt: "n", min: null, desc: "Hoyos en un golpe bajo el par." },
  { key: "birdie_pct", label: "Birdie o mejor (% de hoyos)", short: "Birdie o mejor", cat: "score_types", low: false, fmt: "p", min: "r", desc: "Porcentaje de hoyos jugados en birdie o mejor, como en el PGA Tour." },
  { key: "pars", label: "Pares", short: "Pares", cat: "score_types", low: false, fmt: "n", min: null, desc: "Hoyos jugados en el par." },
  { key: "bogey_avoid", label: "Bogey o peor (% de hoyos)", short: "Bogey o peor", cat: "score_types", low: true, fmt: "p", min: "r", desc: "Bogey avoidance: porcentaje de hoyos en bogey o peor. Menos es mejor." },
  { key: "par3", label: "Promedio en par 3", short: "Par 3", cat: "holes", low: true, fmt: "f2", min: "r", desc: "Golpes promedio en los par 3." },
  { key: "par4", label: "Promedio en par 4", short: "Par 4", cat: "holes", low: true, fmt: "f2", min: "r", desc: "Golpes promedio en los par 4." },
  { key: "par5", label: "Promedio en par 5", short: "Par 5", cat: "holes", low: true, fmt: "f2", min: "r", desc: "Golpes promedio en los par 5." },
  { key: "gir", label: "Greens en regulación", short: "GIR", cat: "gir_fir", low: false, fmt: "p", min: "gh", gps: true, desc: "Porcentaje de hoyos con el green en regulación (par menos 2 golpes)." },
  { key: "fir", label: "Fairways", short: "Fairways", cat: "gir_fir", low: false, fmt: "p", min: "dr", gps: true, desc: "Porcentaje de salidas en el fairway, en pares 4 y 5." },
  { key: "scrambling", label: "Scrambling", short: "Scrambling", cat: "gir_fir", low: false, fmt: "p", min: "mg", gps: true, desc: "Cuando no llegaste al green en regulación, porcentaje de veces que igual hiciste par o mejor." },
  { key: "putts_round", label: "Putts por ronda", short: "Putts/ronda", cat: "putting", low: true, fmt: "f", min: "pr", gps: true, desc: "Putts promedio en rondas completas con putts cargados o marcados con GPS." },
  { key: "putts_gir", label: "Putts por green en regulación", short: "Putts/GIR", cat: "putting", low: true, fmt: "f2", min: "gp", gps: true, desc: "Putting average del PGA Tour: putts promedio en los greens alcanzados en regulación (GPS)." },
];
export const STAT = Object.fromEntries(STATS.map(s => [s.key, s])) as Record<string, StatDef>;
/** Minimum sample to be ranked (PGA-style), per period. Totals (rounds, birdies, pars, best score) need none. */
export const MINS: Record<PKind, Record<Exclude<Min, null>, number>> = {
  semana: { r: 1, gh: 9, dr: 7, mg: 3, pr: 1, gp: 3 },
  mes: { r: 2, gh: 18, dr: 14, mg: 6, pr: 2, gp: 6 },
};
export const MIN_TXT: Record<Exclude<Min, null>, [string, string]> = { r: ["ronda", "rondas"], gh: ["hoyo con dato de GIR", "hoyos con dato de GIR"], dr: ["salida medida", "salidas medidas"], mg: ["green errado", "greens errados"], pr: ["ronda con putts", "rondas con putts"], gp: ["green en regulación con putts", "greens en regulación con putts"] };

export type PRound = { round_id: string; date: string; course_label: string; gross: number | null; net: number | null; par: number | null; holes: [number, number, number][];
  putts: number | null; gir: number | null; fir: number | null };
export type GpsHole = { live_round_id: string; round_id: string | null; hole: number; par: number | null; gir: boolean | null; putts: number | null; card: number | null };
export type PInput = { rounds: PRound[]; hiStart: number | null; hiEnd: number | null; gps: { holes: GpsHole[]; drives: (string | null)[]; full18: number[]; linked: string[] } };
const r1 = (x: number | null) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10) / 10);
const r2 = (x: number | null) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 100) / 100);
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : null);
const mean = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
export type SV = { v: number | null; n: number; extra?: Record<string, any> };

/** Raw per-member stats (before sharing). */
export function periodStats(x: PInput): Record<string, SV & { min_n: Partial<Record<Exclude<Min, null>, number>> }> | any {
  const rs = x.rounds, holes = rs.flatMap(r => r.holes.filter(h => h[1] && h[2]));
  const tp = holes.map(h => h[2] - h[1]), cnt = (f: (d: number) => boolean) => tp.filter(f).length;
  const best = (k: "gross" | "net") => { const c = rs.filter(r => r[k] != null && r.par).map(r => ({ tp: r[k]! - r.par!, score: r[k]!, date: r.date, course: r.course_label, round_id: r.round_id }));
    if (!c.length) return { v: null, n: 0 }; const b = c.reduce((a, z) => (z.tp < a.tp ? z : a)); return { v: b.tp, n: c.length, extra: { score: b.score, date: b.date, course: b.course } }; };
  const g = rs.filter(r => r.gross != null), gp = g.filter(r => r.par);
  const parAvg = (p: number) => { const hs = holes.filter(h => h[1] === p); return { v: r2(mean(hs.map(h => h[2]))), n: hs.length, extra: { to_par: r2(mean(hs.map(h => h[2] - p))) } }; };
  // GIR / FW / putts: GPS per hole + manual counts on scorecards not linked to a GPS round with data
  const linked = new Set(x.gps.linked.map(String)), manual = rs.filter(r => !linked.has(String(r.round_id)));
  const gH = x.gps.holes.filter(h => h.gir != null), gG = gH.filter(h => h.gir).length;
  const mG = manual.filter(r => r.gir != null), girNum = gG + mG.reduce((s, r) => s + r.gir!, 0), girDen = gH.length + 18 * mG.length;
  const dk = x.gps.drives.filter(Boolean), dF = dk.filter(d => d === "fairway").length;
  const mF = manual.filter(r => r.fir != null), fwHoles = (r: PRound) => { const n = r.holes.filter(h => h[1] >= 4).length; return n || 14; };
  const fwNum = dF + mF.reduce((s, r) => s + Math.min(r.fir!, fwHoles(r)), 0), fwDen = dk.length + mF.reduce((s, r) => s + fwHoles(r), 0);
  const miss = x.gps.holes.filter(h => h.gir === false && h.card != null && h.par), sc = miss.filter(h => h.card! <= h.par!).length;
  const mP = manual.filter(r => r.putts != null).map(r => r.putts!), putR = [...mP, ...x.gps.full18];
  const pg = x.gps.holes.filter(h => h.gir === true && h.putts != null);
  return {
    rounds: { v: rs.length, n: rs.length },
    best_net: best("net"), best_gross: best("gross"),
    avg_gross: { v: r1(mean(g.map(r => r.gross!))), n: g.length, extra: { to_par: gp.length ? r1(mean(gp.map(r => r.gross! - r.par!))) : null } },
    hi_change: { v: x.hiStart != null && x.hiEnd != null ? r1(x.hiEnd - x.hiStart) : null, n: x.hiStart != null && x.hiEnd != null ? 1 : 0, extra: { from: x.hiStart, to: x.hiEnd } },
    eagles: { v: holes.length ? cnt(d => d <= -2) : null, n: holes.length, extra: { per_round: rs.length ? r1(cnt(d => d <= -2) / rs.length) : null } },
    birdies: { v: holes.length ? cnt(d => d === -1) : null, n: holes.length, extra: { per_round: rs.length ? r1(cnt(d => d === -1) / rs.length) : null } },
    birdie_pct: { v: pct(cnt(d => d <= -1), holes.length), n: holes.length, extra: { count: cnt(d => d <= -1) } },
    pars: { v: holes.length ? cnt(d => d === 0) : null, n: holes.length, extra: { per_round: rs.length ? r1(cnt(d => d === 0) / rs.length) : null } },
    bogey_avoid: { v: pct(cnt(d => d >= 1), holes.length), n: holes.length, extra: { count: cnt(d => d >= 1) } },
    par3: parAvg(3), par4: parAvg(4), par5: parAvg(5),
    gir: { v: pct(girNum, girDen), n: girDen, extra: { hit: girNum, gps_holes: gH.length, card_rounds: mG.length } },
    fir: { v: pct(fwNum, fwDen), n: fwDen, extra: { hit: fwNum, gps_drives: dk.length, card_rounds: mF.length } },
    scrambling: { v: pct(sc, miss.length), n: miss.length, extra: { saved: sc } },
    putts_round: { v: r1(mean(putR)), n: putR.length, extra: { gps_rounds: x.gps.full18.length, card_rounds: mP.length } },
    putts_gir: { v: r2(mean(pg.map(h => h.putts!))), n: pg.length },
    _samples: { r: rs.length, gh: girDen, dr: fwDen, mg: miss.length, pr: putR.length, gp: pg.length, rounds_with_holes: rs.filter(r => r.holes.some(h => h[1] && h[2])).length },
  };
}

/** Applies sharing + minimums. Hidden stats are omitted ({hidden:true}, no value). */
export function shareStats(raw: any, sh: Share, kind: PKind) {
  const out: Record<string, any> = {};
  for (const s of STATS) {
    if (!sh[s.cat]) { out[s.key] = { hidden: true }; continue; }
    const x = raw[s.key] as SV, need = s.min ? MINS[kind][s.min] : 0;
    // for per-hole stats the rounds minimum counts rounds with hole-by-hole cards
    const have = s.min === "r" ? (["birdie_pct", "bogey_avoid", "par3", "par4", "par5"].includes(s.key) ? raw._samples.rounds_with_holes : raw._samples.r) : s.min ? raw._samples[s.min] : x.n;
    out[s.key] = { v: x.v, n: x.n, ...(x.extra ? { extra: x.extra } : {}), ok: x.v != null && (!s.min || have >= need), ...(s.min ? { need, have } : {}) };
  }
  return out;
}

/** One board: ranked (eligible) first, then below-minimum with data, then no data, then not shared. Ties share a position. */
export function board(members: { member_id: string; stats: Record<string, any> }[], key: string) {
  const s = STAT[key]; if (!s) return null;
  const val = (m: any) => m.stats[key];
  const ranked = members.filter(m => val(m)?.ok).sort((a, b) => (s.low ? val(a).v - val(b).v : val(b).v - val(a).v));
  let pos = 0, prev: number | null = null;
  const rows = ranked.map((m, i) => { const v = val(m).v; if (v !== prev) { pos = i + 1; prev = v; } return { member_id: m.member_id, pos, state: "ranked" as const }; });
  const allZero = !s.low && ranked.length > 0 && ranked.every(m => val(m).v === 0);
  const rest = (st: string, f: (m: any) => boolean) => members.filter(m => !ranked.includes(m) && f(m)).map(m => ({ member_id: m.member_id, pos: null, state: st }));
  return {
    key, leaders: allZero ? [] : rows.filter(r => r.pos === 1).map(r => r.member_id), ranked: ranked.length,
    rows: [...rows, ...rest("below_min", m => !val(m)?.hidden && val(m)?.v != null), ...rest("no_data", m => !val(m)?.hidden && val(m)?.v == null), ...rest("hidden", m => !!val(m)?.hidden)],
  };
}
/** Leaderboard order: best net vs par, then best gross vs par, then average; members without a shared round go last. */
export function leaderboard(members: { member_id: string; stats: Record<string, any> }[]) {
  const k = (m: any, s: string) => (m.stats[s]?.hidden ? null : m.stats[s]?.v ?? null);
  const has = members.filter(m => k(m, "rounds"));
  const sorted = has.slice().sort((a, b) => {
    for (const s of ["best_net", "best_gross", "avg_gross"]) { const x = k(a, s), y = k(b, s); if (x == null && y == null) continue; if (x == null) return 1; if (y == null) return -1; if (x !== y) return x - y; }
    return 0; });
  let pos = 0, prev = "";
  const rows = sorted.map((m, i) => { const sig = ["best_net", "best_gross", "avg_gross"].map(s => k(m, s)).join("|"); if (sig !== prev) { pos = i + 1; prev = sig; } return { member_id: m.member_id, pos }; });
  return { rows, rest: members.filter(m => !has.includes(m)).map(m => ({ member_id: m.member_id, state: m.stats.rounds?.hidden ? "hidden" : "no_rounds" })) };
}

/* ---------- profile (whitelisted fields only: never notes, tee times or playing partners) ---------- */
export const PROFILE_ROUND_FIELDS = ["round_id", "date", "course_label", "gross", "net", "to_par"] as const;
export function profileRound(r: PRound) {
  return { round_id: String(r.round_id), date: r.date, course_label: r.course_label, gross: r.gross, net: r.net, to_par: r.gross != null && r.par ? r.gross - r.par : null };
}
export function profileCard(r: PRound, sh: Share) {
  return { ...profileRound(r), par: r.par, holes: r.holes.filter(h => h[0]).map(h => ({ hole: h[0], par: h[1] || null, score: h[2] || null })),
    ...(sh.putting && r.putts != null ? { putts: r.putts } : {}), ...(sh.gir_fir && r.gir != null ? { gir: r.gir } : {}), ...(sh.gir_fir && r.fir != null ? { fir: r.fir } : {}) };
}
