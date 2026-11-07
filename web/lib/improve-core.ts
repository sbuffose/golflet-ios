/** Pure "Qué trabajar" + Putting math (no DB). Inputs are already scoped to one player and one period.
 * Every estimate is a transparent rule of thumb (documented in API_v5 §13); nothing here is a model. */
import { isPutter } from "./shots-calc";

export type Hole3 = [number, number | null, number | null];               // [hole, par, strokes]
export type RoundIn = { id: string; date: string; course_key: string; course_label: string; holes: Hole3[]; putts: number | null; gir: number | null; fir: number | null };
export type ShotIn = { live_round_id: string; hole: number; shot_number: number; club: string | null; lie: string | null; result: string | null;
  direction?: string | null; length?: string | null; intent?: string | null; to_green_m: number | null; lat?: number | null; lng?: number | null };
export type LiveIn = { id: string; date: string; course_key: string; course_label: string; pars: Record<number, number>; counts?: Record<number, number>; pins?: Record<number, { lat: number; lng: number; source?: "club" | "player_marked" | "day_pin" }> };
export type RecapIn = { round_key: string; date: string; mistakes: { category: string; hole: number | null; text: string }[] };
export type GpsHole = { live_round_id: string; date: string; course_key: string; course_label: string; hole: number; par: number | null;
  strokes: number; putts: number; first_putt_m: number | null; gir: boolean | null; penalties: number; tee_result: string | null;
  first_putt_yd?: number | null; first_putt_flag?: "club" | "player_marked" | "day_pin" | "green_center" | null };

const r1 = (x: number) => Math.round(x * 10) / 10, r2 = (x: number) => Math.round(x * 100) / 100;
const mean = (a: number[]) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : null);
const ar = (x: number) => String(x).replace(".", ",");
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : null);
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const PEN = { ob: 1, water: 1, penalty: 1 } as Record<string, number>;
export const isPutt = (s: ShotIn) => isPutter(s.club) || s.lie === "green";

/** One row per GPS-logged hole that reached the green (≥1 putt). Strokes = shots + 1 per OB/water/penalty. */
export function gpsHoles(shots: ShotIn[], lives: LiveIn[]): GpsHole[] {
  const L = new Map(lives.map(l => [l.id, l])), by = new Map<string, ShotIn[]>();
  for (const s of shots) { const k = `${s.live_round_id}|${s.hole}`; by.set(k, [...(by.get(k) || []), s]); }
  // t160u: holes with a putts counter (web/iOS "+/−") count even when no putt was GPS-marked; the counter wins over marked putts.
  for (const l of lives) for (const h of Object.keys(l.counts || {})) { const k = `${l.id}|${h}`; if (!by.has(k)) by.set(k, []); }
  const out: GpsHole[] = [];
  for (const [k, ss] of by) {
    const [lid, hs] = k.split("|"), hole = Number(hs);
    const l = L.get(lid); if (!l) continue;
    ss.sort((a, b) => a.shot_number - b.shot_number);
    const putts = ss.filter(isPutt), counted = l.counts?.[hole];
    const nPutts = counted != null ? counted : putts.length; if (counted == null && !putts.length) continue;
    const full = ss.length - putts.length;
    const pen = ss.reduce((n, s) => n + (PEN[s.result || ""] || 0), 0), strokes = full + nPutts + pen, par = l.pars[hole] ?? null;
    out.push({ live_round_id: l.id, date: l.date, course_key: l.course_key, course_label: l.course_label, hole, par, strokes, putts: nPutts,
      first_putt_m: putts[0]?.to_green_m ?? null, ...firstPutt(putts[0], l.pins?.[hole]), gir: par == null ? null : strokes - nPutts <= par - 2, penalties: pen, tee_result: ss[0]?.shot_number === 1 ? ss[0].result : null });
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.hole - b.hole));
}

const YD_PER_M = 1 / 0.9144;
/** First putt to the flag in yards: the pin the player marked when there is one, else the green center (to_green_m). */
function firstPutt(p: ShotIn | undefined, pin?: { lat: number; lng: number; source?: "club" | "player_marked" | "day_pin" }) {
  if (!p) return { first_putt_yd: null, first_putt_flag: null };
  if (pin && p.lat != null && p.lng != null) { const k = 111320, dx = (pin.lng - p.lng) * k * Math.cos((p.lat * Math.PI) / 180), dy = (pin.lat - p.lat) * k;
    return { first_putt_yd: Math.round(Math.hypot(dx, dy) * YD_PER_M * 10) / 10, first_putt_flag: pin.source ?? ("player_marked" as const) }; }
  return p.to_green_m == null ? { first_putt_yd: null, first_putt_flag: null } : { first_putt_yd: Math.round(p.to_green_m * YD_PER_M * 10) / 10, first_putt_flag: "green_center" as const };
}
export const DIST_BINS_YD: [number, number, string][] = [[0, 3, "0–3 yd"], [3, 7, "3–7 yd"], [7, 15, "7–15 yd"], [15, 999, "15 yd o más"]];
export const DIST_BINS: [number, number, string][] = [[0, 2, "0–2 m"], [2, 5, "2–5 m"], [5, 10, "5–10 m"], [10, 15, "10–15 m"], [15, 999, "15 m o más"]];

/** Putting: notes (putts per round typed after the round) + GPS holes (putts per hole, first-putt distance). */
export function putting(rounds: RoundIn[], holes: GpsHole[]) {
  const noted = rounds.filter(r => r.putts != null && r.putts > 0).sort((a, b) => (a.date < b.date ? -1 : 1));
  const series = noted.map(r => ({ date: r.date, round_id: r.id, course: r.course_label, putts: r.putts! }));
  const half = Math.floor(series.length / 2), first = mean(series.slice(0, half).map(x => x.putts)), last = mean(series.slice(half).map(x => x.putts));
  const trend = series.length >= 4 && first != null && last != null ? { first_half: r1(first), second_half: r1(last), delta: r1(last - first), better: last < first - 0.2, worse: last > first + 0.2 } : null;
  const gh = holes, g = gh.filter(h => h.gir), ones = gh.filter(h => h.putts === 1).length, threes = gh.filter(h => h.putts >= 3).length;
  const lr = new Map<string, GpsHole[]>(); for (const h of gh) lr.set(h.live_round_id, [...(lr.get(h.live_round_id) || []), h]);
  const gpsRounds = [...lr.values()].filter(x => x.length >= 9);
  const byCourse = new Map<string, { course_key: string; course_label: string; putts: number[]; holes: GpsHole[] }>();
  for (const r of noted) { const e = byCourse.get(r.course_key) || { course_key: r.course_key, course_label: r.course_label, putts: [], holes: [] }; e.putts.push(r.putts!); byCourse.set(r.course_key, e); }
  for (const h of gh) { const e = byCourse.get(h.course_key) || { course_key: h.course_key, course_label: h.course_label, putts: [], holes: [] }; e.holes.push(h); byCourse.set(h.course_key, e); }
  const by_course = [...byCourse.values()].map(e => ({ course_key: e.course_key, course_label: e.course_label, rounds_noted: e.putts.length, avg_putts: e.putts.length ? r1(mean(e.putts)!) : null,
    gps_holes: e.holes.length, putts_per_hole: e.holes.length ? r2(mean(e.holes.map(h => h.putts))!) : null, three_putt_pct: pct(e.holes.filter(h => h.putts >= 3).length, e.holes.length),
    by_hole: Array.from({ length: 18 }, (_, i) => i + 1).map(n => { const hs = e.holes.filter(h => h.hole === n);
      return { hole: n, n: hs.length, avg_putts: hs.length ? r2(mean(hs.map(h => h.putts))!) : null, three_putts: hs.filter(h => h.putts >= 3).length, one_putts: hs.filter(h => h.putts === 1).length }; }).filter(x => x.n) }))
    .sort((a, b) => b.rounds_noted + b.gps_holes - (a.rounds_noted + a.gps_holes));
  const withD = gh.filter(h => h.first_putt_m != null);
  const distance = { holes: withD.length, avg_m: withD.length ? r1(mean(withD.map(h => h.first_putt_m!))!) : null, approx: "al centro del green",
    bins: DIST_BINS.map(([lo, hi, label]) => { const hs = withD.filter(h => h.first_putt_m! >= lo && h.first_putt_m! < hi);
      return { label, from_m: lo, to_m: hi === 999 ? null : hi, n: hs.length, avg_putts: hs.length ? r2(mean(hs.map(h => h.putts))!) : null, one_putt_pct: pct(hs.filter(h => h.putts === 1).length, hs.length), three_putt_pct: pct(hs.filter(h => h.putts >= 3).length, hs.length) }; }),
    // t162u: yards (what the app shows). Measured to the marked pin when there is one.
    ...(() => { const wy = gh.filter(h => h.first_putt_yd != null);
      return { holes_yd: wy.length, avg_yd: wy.length ? r1(mean(wy.map(h => h.first_putt_yd!))!) : null, at_pin: wy.filter(h => h.first_putt_flag && h.first_putt_flag !== "green_center").length,
        bins_yd: DIST_BINS_YD.map(([lo, hi, label]) => { const hs = wy.filter(h => h.first_putt_yd! >= lo && h.first_putt_yd! < hi);
          return { label, from_yd: lo, to_yd: hi === 999 ? null : hi, n: hs.length, avg_putts: hs.length ? r2(mean(hs.map(h => h.putts))!) : null, one_putt_pct: pct(hs.filter(h => h.putts === 1).length, hs.length), three_putt_pct: pct(hs.filter(h => h.putts >= 3).length, hs.length) }; }) }; })() };
  return {
    sources: { rounds_noted: noted.length, gps_holes: gh.length, gps_rounds: gpsRounds.length },
    per_round: { avg: noted.length ? r1(mean(noted.map(r => r.putts!))!) : gpsRounds.length ? r1(mean(gpsRounds.map(x => x.reduce((s, h) => s + h.putts, 0) * 18 / x.length))!) : null,
      n: noted.length || gpsRounds.length, source: noted.length ? "notes" : gpsRounds.length ? "gps" : null, best: noted.length ? Math.min(...noted.map(r => r.putts!)) : null, series, trend },
    per_gir: { avg: g.length ? r2(mean(g.map(h => h.putts))!) : null, gir_holes: g.length, per_hole_all: gh.length ? r2(mean(gh.map(h => h.putts))!) : null,
      non_gir: gh.length - g.length ? r2(mean(gh.filter(h => !h.gir).map(h => h.putts))!) : null },
    one_putts: { pct: pct(ones, gh.length), count: ones, holes: gh.length, per_round: gpsRounds.length ? r1(mean(gpsRounds.map(x => x.filter(h => h.putts === 1).length * 18 / x.length))!) : null },
    three_putts: { pct: pct(threes, gh.length), count: threes, holes: gh.length, per_round: gpsRounds.length ? r1(mean(gpsRounds.map(x => x.filter(h => h.putts >= 3).length * 18 / x.length))!) : null,
      list: gh.filter(h => h.putts >= 3).slice(-12).reverse().map(h => ({ date: h.date, course_label: h.course_label, hole: h.hole, putts: h.putts, first_putt_m: h.first_putt_m, first_putt_yd: h.first_putt_yd ?? null })) },
    by_course, distance,
  };
}

/** References by handicap (rough public amateur averages, rounded; documented in API_v5 §13). */
export const REF = {
  putts: (hi: number) => r1(clamp(29 + 0.12 * hi, 29, 36)),
  gir: (hi: number) => r1(clamp(12.5 - 0.42 * hi, 2, 12.5)),
  fir: (hi: number) => r1(clamp(9.5 - 0.15 * hi, 5, 9.5)),
  COST: { putt: 1, gir_missed: 0.5, fir_missed: 0.25, penalty: 1, recap_mention: 0.75, three_putt: 1 },
};
export const AREAS: Record<string, string> = { putt: "Putt", approach: "Approach", salida: "Salida", penalidades: "Penalidades", juego_corto: "Juego corto", bunker: "Bunker",
  estrategia: "Estrategia / mental", par3: "Hoyos de par 3", par4: "Hoyos de par 4", par5: "Hoyos de par 5" };

type Ev = { label: string; value: string; detail?: string; view?: string };
export function improve(rounds: RoundIn[], holes: GpsHole[], shots: ShotIn[], recaps: RecapIn[], hiIn: number | null) {
  const hi = hiIn ?? 18, P = putting(rounds, holes), out: any[] = [];
  const add = (key: string, lost: number | null, n: number, how: string, evidence: Ev[], source: string[]) => { if (lost == null) return;
    out.push({ key, label: AREAS[key], strokes_per_round: r2(Math.max(0, lost)), rounds: n, confidence: n >= 10 ? "alta" : n >= 4 ? "media" : "baja", how, evidence, sources: source }); };
  // recap mentions per recapped round
  const rc = recaps.slice().sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 10), mentions = (cat: string) => rc.reduce((n, r) => n + r.mistakes.filter(m => m.category === cat).length, 0);
  const recapEv = (cat: string): Ev[] => { const m = mentions(cat); if (!m) return []; const rr = rc.filter(r => r.mistakes.some(x => x.category === cat)).length;
    const ex = rc.flatMap(r => r.mistakes.filter(x => x.category === cat).map(x => ({ ...x, date: r.date }))).slice(0, 3);
    return [{ label: "Lo dijiste en tus recaps", value: `${rr} de ${rc.length} rondas`, detail: ex.map(x => `${x.hole ? `Hoyo ${x.hole}: ` : ""}${x.text}`).join(" · "), view: `recaps:${cat}` }]; };
  const recapLost = (cat: string) => (rc.length ? (mentions(cat) / rc.length) * REF.COST.recap_mention : null);
  const gpsRoundsN = new Set(holes.map(h => h.live_round_id)).size;
  // 1) Putt
  { const ref = REF.putts(hi), avg = P.per_round.avg, ev: Ev[] = [];
    if (avg != null) ev.push({ label: "Putts por ronda", value: `${String(avg).replace(".", ",")} putts (referencia ${String(ref).replace(".", ",")})`, view: "putting:putts" });
    if (P.three_putts.holes) ev.push({ label: "3 putts", value: `${P.three_putts.pct}% de los hoyos`, view: "putting:three" });
    const lost = avg != null ? (avg - ref) * REF.COST.putt : recapLost("putt");
    add("putt", lost, P.per_round.n || rc.length, avg != null ? `(putts por ronda − ${String(ref).replace(".", ",")}) × 1 golpe` : `menciones en recaps por ronda × ${ar(REF.COST.recap_mention)}`, [...ev, ...recapEv("putt")], avg != null ? [P.per_round.source!] : ["recaps"]); }
  // 2) Approach: GIR from notes, else GPS holes
  { const ref = REF.gir(hi), gn = rounds.filter(r => r.gir != null), gl = holes.filter(h => h.gir != null), ev: Ev[] = [];
    const gir = gn.length ? mean(gn.map(r => r.gir!))! : gl.length >= 9 ? (gl.filter(h => h.gir).length / gl.length) * 18 : null;
    if (gir != null) ev.push({ label: "Greens en regulación", value: `${r1(gir).toString().replace(".", ",")} greens por ronda (referencia ${String(ref).replace(".", ",")})`, view: "trabajar:approach" });
    const ap = shots.filter(s => !isPutt(s) && s.lie !== "tee" && s.result && s.intent !== "layup" && s.to_green_m != null && s.to_green_m >= 30 && s.to_green_m <= 180);
    const miss = ap.filter(s => s.result !== "green" && s.result !== "holed");
    if (ap.length >= 5) { const sh = miss.filter(s => s.length === "short").length, lo = miss.filter(s => s.length === "long").length, le = miss.filter(s => s.direction === "left").length, ri = miss.filter(s => s.direction === "right").length;
      ev.push({ label: "Tiros al green (GPS)", value: `${pct(ap.length - miss.length, ap.length)}% en el green`, detail: `De los errados: cortos ${pct(sh, miss.length) ?? 0}%, largos ${pct(lo, miss.length) ?? 0}%, izquierda ${pct(le, miss.length) ?? 0}%, derecha ${pct(ri, miss.length) ?? 0}%`, view: "trabajar:approach" }); }
    add("approach", gir != null ? (ref - gir) * REF.COST.gir_missed : recapLost("approach"), gn.length || gpsRoundsN || rc.length, gir != null ? `(${String(ref).replace(".", ",")} − greens por ronda) × ${ar(REF.COST.gir_missed)}` : `menciones en recaps por ronda × ${ar(REF.COST.recap_mention)}`, [...ev, ...recapEv("approach")], gir != null ? [gn.length ? "notes" : "gps"] : ["recaps"]); }
  // 3) Salida: FIR from notes, else GPS tee shots on par 4/5
  { const ref = REF.fir(hi), fn = rounds.filter(r => r.fir != null), tee = holes.filter(h => h.par != null && h.par >= 4 && h.tee_result && h.tee_result !== "green"), ev: Ev[] = [];
    const fir = fn.length ? mean(fn.map(r => r.fir!))! : tee.length >= 7 ? (tee.filter(h => h.tee_result === "fairway").length / tee.length) * 14 : null;
    if (fir != null) ev.push({ label: "Fairways", value: `${r1(fir).toString().replace(".", ",")} de 14 (referencia ${String(ref).replace(".", ",")})`, view: "trabajar:salida" });
    if (tee.length) { const t = (x: string) => tee.filter(h => h.tee_result === x).length; ev.push({ label: "Salidas con GPS", value: `${tee.length} salidas`, detail: `Fairway ${pct(t("fairway"), tee.length)}% · rough ${pct(t("rough"), tee.length)}% · bunker ${pct(t("bunker"), tee.length)}% · OB/agua ${pct(t("ob") + t("water"), tee.length)}%`, view: "trabajar:salida" }); }
    add("salida", fir != null ? (ref - fir) * REF.COST.fir_missed : recapLost("salida"), fn.length || gpsRoundsN || rc.length, fir != null ? `(${String(ref).replace(".", ",")} − fairways) × ${ar(REF.COST.fir_missed)}` : `menciones en recaps por ronda × ${ar(REF.COST.recap_mention)}`, [...ev, ...recapEv("salida")], fir != null ? [fn.length ? "notes" : "gps"] : ["recaps"]); }
  // 4) Penalties (GPS)
  if (gpsRoundsN) { const pen = holes.reduce((n, h) => n + h.penalties, 0), per = (pen / gpsRoundsN);
    add("penalidades", per * REF.COST.penalty, gpsRoundsN, "golpes de penalidad por ronda con GPS (OB, agua, penalidad) × 1", [{ label: "Penalidades", value: `${r1(per).toString().replace(".", ",")} por ronda`, detail: holes.filter(h => h.penalties).slice(-5).map(h => `${h.date.slice(8, 10)}/${h.date.slice(5, 7)} hoyo ${h.hole}`).join(" · "), view: "trabajar:penalidades" }], ["gps"]); }
  // 5) Recap-only areas
  for (const k of ["juego_corto", "bunker", "estrategia"]) if (mentions(k)) add(k, recapLost(k), rc.length, `menciones en recaps por ronda × ${ar(REF.COST.recap_mention)}`, recapEv(k), ["recaps"]);
  // 6) Hole types from the synced cards (always available): over-par vs the player's own per-hole average
  const hs = rounds.flatMap(r => r.holes.filter(h => h[1] != null && h[2] != null).map(h => ({ r, hole: h[0], par: h[1]!, over: h[2]! - h[1]! })));
  if (hs.length >= 54) { const all = mean(hs.map(h => h.over))!, nR = rounds.filter(r => r.holes.length).length;
    for (const p of [3, 4, 5]) { const x = hs.filter(h => h.par === p); if (x.length < 9) continue; const avg = mean(x.map(h => h.over))!, perRound = x.length / nR;
      const worst = new Map<string, { label: string; hole: number; overs: number[] }>(); for (const h of x) { const k = `${h.r.course_key}|${h.hole}`; const e = worst.get(k) || { label: h.r.course_label, hole: h.hole, overs: [] }; e.overs.push(h.over); worst.set(k, e); }
      const w = [...worst.values()].filter(e => e.overs.length >= 3).map(e => ({ ...e, avg: mean(e.overs)! })).sort((a, b) => b.avg - a.avg).slice(0, 3);
      add(`par${p}`, (avg - all) * perRound, nR, `(tu promedio sobre el par en pares ${p} − tu promedio en todos los hoyos) × hoyos de par ${p} por ronda`,
        [{ label: `Promedio en pares ${p}`, value: `${avg >= 0 ? "+" : "−"}${r2(Math.abs(avg)).toString().replace(".", ",")} sobre el par (todos los hoyos: ${all >= 0 ? "+" : "−"}${r2(Math.abs(all)).toString().replace(".", ",")})`, view: `trabajar:par${p}` },
         ...(w.length ? [{ label: "Los que más te cuestan", value: w.map(e => `Hoyo ${e.hole}`).join(", "), detail: w.map(e => `${e.label} hoyo ${e.hole}: +${r2(e.avg).toString().replace(".", ",")}`).join(" · "), view: `trabajar:par${p}` }] : [])], ["tarjetas"]); }
  }
  const ranked = out.sort((a, b) => b.strokes_per_round - a.strokes_per_round);
  return { hi: hiIn, top: ranked.filter(a => a.strokes_per_round >= 0.1).slice(0, 3), areas: ranked,
    sources: { rounds: rounds.length, rounds_with_notes: rounds.filter(r => r.putts != null || r.gir != null || r.fir != null).length, gps_rounds: gpsRoundsN, recaps: rc.length },
    empty: !ranked.some(a => a.strokes_per_round >= 0.1), putting: P };
}

/** Evidence behind one area (its own view): series, tables and examples. */
export function areaDetail(key: string, rounds: RoundIn[], holes: GpsHole[], shots: ShotIn[], recaps: RecapIn[], hiIn: number | null) {
  const hi = hiIn ?? 18, asc = rounds.slice().sort((a, b) => (a.date < b.date ? -1 : 1));
  const rc = recaps.slice().sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 10);
  const cat = key === "putt" ? "putt" : key, mentions = rc.flatMap(r => r.mistakes.filter(m => m.category === cat).map(m => ({ date: r.date, hole: m.hole, text: m.text })));
  const d: any = { key, label: AREAS[key] ?? key, recap_mentions: mentions, recaps_considered: rc.length };
  if (key === "approach") {
    d.reference = REF.gir(hi); d.series = asc.filter(r => r.gir != null).map(r => ({ date: r.date, course: r.course_label, value: r.gir }));
    const ap = shots.filter(s => !isPutt(s) && s.lie !== "tee" && s.result && s.intent !== "layup" && s.to_green_m != null && s.to_green_m >= 30 && s.to_green_m <= 180);
    d.by_distance = [[30, 70], [70, 110], [110, 150], [150, 181]].map(([lo, hi2]) => { const x = ap.filter(s => s.to_green_m! >= lo && s.to_green_m! < hi2), m = x.filter(s => s.result !== "green" && s.result !== "holed");
      return { label: `${lo}–${hi2 === 181 ? 180 : hi2} m`, n: x.length, green_pct: pct(x.length - m.length, x.length), short: m.filter(s => s.length === "short").length, long: m.filter(s => s.length === "long").length, left: m.filter(s => s.direction === "left").length, right: m.filter(s => s.direction === "right").length }; });
  } else if (key === "salida") {
    d.reference = REF.fir(hi); d.series = asc.filter(r => r.fir != null).map(r => ({ date: r.date, course: r.course_label, value: r.fir }));
    const tee = holes.filter(h => h.par != null && h.par >= 4 && h.tee_result && h.tee_result !== "green"), t = (x: string) => tee.filter(h => h.tee_result === x).length;
    d.tee_results = { n: tee.length, fairway: t("fairway"), rough: t("rough"), bunker: t("bunker"), ob: t("ob"), water: t("water"), other: tee.length - t("fairway") - t("rough") - t("bunker") - t("ob") - t("water") };
  } else if (key === "penalidades") {
    d.list = holes.filter(h => h.penalties).reverse().map(h => ({ date: h.date, course_label: h.course_label, hole: h.hole, penalties: h.penalties }));
  } else if (/^par[345]$/.test(key)) {
    const p = Number(key[3]), x = rounds.flatMap(r => r.holes.filter(h => h[1] === p && h[2] != null).map(h => ({ ck: r.course_key, label: r.course_label, hole: h[0], over: h[2]! - p })));
    const g = new Map<string, any>(); for (const h of x) { const k = `${h.ck}|${h.hole}`; const e = g.get(k) || { course_key: h.ck, course_label: h.label, hole: h.hole, n: 0, sum: 0, birdie_or_better: 0, par: 0, bogey: 0, double_or_worse: 0 };
      e.n++; e.sum += h.over; if (h.over <= -1) e.birdie_or_better++; else if (h.over === 0) e.par++; else if (h.over === 1) e.bogey++; else e.double_or_worse++; g.set(k, e); }
    d.holes = [...g.values()].map(({ sum, ...e }) => ({ ...e, avg_over: r2(sum / e.n) })).sort((a, b) => b.avg_over - a.avg_over);
    const tot = (k: string) => d.holes.reduce((s: number, e: any) => s + e[k], 0);
    d.outcomes = { n: x.length, birdie_or_better: tot("birdie_or_better"), par: tot("par"), bogey: tot("bogey"), double_or_worse: tot("double_or_worse") };
  }
  return d;
}
