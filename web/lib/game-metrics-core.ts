/**
 * Game metrics from live GPS rounds (t160u, API_v5 §55). Pure: no DB. Distances in YARDS.
 * Never invents data: a metric only counts what the player actually marked (shots, putts counter, pin, tee direction).
 * Flag = the pin the player marked ("Estoy en la bandera"); else the green center (flag_source 'green_center', labelled in the app).
 */
import { isPutter } from "./shots-calc";

export const YD = 1 / 0.9144;
export type LL = { lat: number; lng: number };
export type GmShot = { id?: string; live_round_id: string; hole: number; shot_number: number; lat: number; lng: number; club: string | null; lie: string | null; result: string | null; direction: string | null };
export type FlagSource = "club" | "player_marked" | "day_pin" | "green_center";
export type GmHole = { live_round_id: string; hole: number; putts: number | null; pin: LL | null; pin_source?: Exclude<FlagSource, "green_center">; own_pin?: boolean };
export type GmRound = { id: string; date: string; course_label: string; pars: Record<number, number>; greens: Record<number, LL> };

export const BUCKETS: [number, number, string][] = [[125, 150, "150-125"], [100, 125, "125-100"], [75, 100, "100-75"], [50, 75, "75-50"], [30, 50, "50-30"]];
export const BUCKET_LABEL: Record<string, string> = { "150-125": "150–125 yd", "125-100": "125–100 yd", "100-75": "100–75 yd", "75-50": "75–50 yd", "50-30": "50–30 yd" };
export const PUTT_BINS: [number, number, string][] = [[0, 3, "0–3 yd"], [3, 7, "3–7 yd"], [7, 15, "7–15 yd"], [15, 999, "15 yd o más"]];
export const FAIRWAY_BAND_YD = 15;           // reference band drawn on the dispersion chart only (we don't know real fairway widths)
const PEN: Record<string, number> = { ob: 1, water: 1, penalty: 1 };
const MISS_RESULTS = new Set(["rough", "bunker", "water", "ob", "penalty", "other"]);

export const isPuttShot = (s: Pick<GmShot, "club" | "lie">) => isPutter(s.club) || s.lie === "green";
const r1 = (x: number) => Math.round(x * 10) / 10, r0 = (x: number) => Math.round(x);
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : null);
const mean = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);

/** Local flat projection in yards (x east, y north) relative to `o`. Fine at golf-hole scale. */
export function xy(o: LL, p: LL) {
  const k = 111320 * YD;
  return { x: (p.lng - o.lng) * k * Math.cos((o.lat * Math.PI) / 180), y: (p.lat - o.lat) * k };
}
export const distYd = (a: LL, b: LL) => { const v = xy(a, b); return Math.hypot(v.x, v.y); };
/** Point `p` in the frame of the line from→to: along (yd forward from `from`), lateral (yd, + = right of the line). */
export function frame(from: LL, to: LL, p: LL) {
  const t = xy(from, to), v = xy(from, p), L = Math.hypot(t.x, t.y) || 1, ux = t.x / L, uy = t.y / L;
  return { along: ux * v.x + uy * v.y, lateral: -(ux * v.y - uy * v.x), line: L };
}
export function bucketOf(d: number) { const b = BUCKETS.find(([lo, hi]) => d > lo && d <= hi) || (d >= 30 && d <= 50 ? BUCKETS[4] : null); return b ? b[2] : null; }

type Drive = { live_round_id: string; date: string; course: string; hole: number; par: number; outcome: "fairway" | "left" | "right" | null; how: string | null; lateral_yd: number | null; carry_yd: number | null };
type Appr = { live_round_id: string; date: string; course: string; hole: number; bucket: string; from_yd: number; on_green: boolean | null; prox_yd: number | null; long_yd: number | null; lateral_yd: number | null; miss: "short" | "long" | "left" | "right" | null; flag_source: FlagSource };

export function gameMetrics(rounds: GmRound[], shots: GmShot[], holes: GmHole[]) {
  const R = new Map(rounds.map(r => [r.id, r])), H = new Map(holes.map(h => [`${h.live_round_id}|${h.hole}`, h]));
  const by = new Map<string, GmShot[]>();
  for (const s of shots) { if (!R.has(s.live_round_id)) continue; const k = `${s.live_round_id}|${s.hole}`; by.set(k, [...(by.get(k) || []), s]); }
  for (const h of holes) { const k = `${h.live_round_id}|${h.hole}`; if (R.has(h.live_round_id) && !by.has(k)) by.set(k, []); }
  type HoleRow = { live_round_id: string; date: string; course: string; hole: number; par: number | null; putts: number | null; putts_src: "counter" | "gps" | null; gir: boolean | null;
    gir_miss: "short" | "long" | "left" | "right" | null; first_putt_yd: number | null; flag_source: FlagSource | null };
  const drives: Drive[] = [], apprs: Appr[] = [], holeRows: HoleRow[] = [];
  let pinsMarked = 0;
  for (const [k, raw] of by) {
    const r = R.get(raw[0]?.live_round_id || k.split("|")[0])!, hole = Number(k.split("|")[1]);
    const ss = [...raw].sort((a, b) => a.shot_number - b.shot_number), lh = H.get(k), par = r.pars[hole] ?? null, green = r.greens[hole] || null;
    const flag = lh?.pin || green, flagSrc: Appr["flag_source"] = lh?.pin ? (lh.pin_source ?? "player_marked") : "green_center";
    if (lh?.pin) pinsMarked++;
    const puttShots = ss.filter(isPuttShot), full = ss.filter(s => !isPuttShot(s));
    const putts = lh?.putts != null ? lh.putts : puttShots.length ? puttShots.length : null;
    const pen = full.reduce((n, s) => n + (PEN[s.result || ""] || 0), 0);
    const toGreen = full.length + pen;                       // strokes before the first putt
    const reached = putts != null || ss.some(s => s.result === "green" || s.result === "holed");
    const gir = par == null || !reached ? null : toGreen <= par - 2;
    // Where the green was missed: the regulation shot (shot number par−2) vs the flag, when the next shot shows where it ended.
    let girMiss: HoleRow["gir_miss"] = null;
    if (gir === false && flag && par != null) { const rs = full[par - 3], nx = rs ? ss.find(x => x.shot_number > rs.shot_number) : null;
      if (rs && nx) { const f = frame(rs, flag, nx), lg = f.along - f.line; girMiss = Math.abs(lg) >= Math.abs(f.lateral) ? (lg < 0 ? "short" : "long") : f.lateral < 0 ? "left" : "right"; } }
    const fp = puttShots[0];
    holeRows.push({ live_round_id: r.id, date: r.date, course: r.course_label, hole, par, putts, putts_src: lh?.putts != null ? "counter" : puttShots.length ? "gps" : null, gir,
      gir_miss: girMiss, first_putt_yd: fp && flag ? r1(distYd(fp, flag)) : null, flag_source: flag ? flagSrc : null });
    // Tee shot (par 4/5): direction tap > result fairway > next lie fairway; lateral measured vs the tee→green-center line.
    const t = full[0];
    if (t && t.shot_number === 1 && par != null && par >= 4) {
      const next = ss.find(s => s.shot_number > t.shot_number) || null;
      let outcome: Drive["outcome"] = null, how: string | null = null;
      if (t.direction === "center" || t.direction === "left" || t.direction === "right") { outcome = t.direction === "center" ? "fairway" : t.direction; how = "direction"; }
      else if (t.result === "fairway" || next?.lie === "fairway") { outcome = "fairway"; how = t.result === "fairway" ? "result" : "next_lie"; }
      const f = next && green ? frame(t, green, next) : null;
      if (!outcome && f && (MISS_RESULTS.has(t.result || "") || (next?.lie && next.lie !== "fairway" && next.lie !== "tee"))) { outcome = f.lateral >= 0 ? "right" : "left"; how = "measured_side"; }
      drives.push({ live_round_id: r.id, date: r.date, course: r.course_label, hole, par, outcome, how, lateral_yd: f ? r1(f.lateral) : null, carry_yd: f ? r0(f.along) : null });
    }
    // Approaches: any full shot that starts 30–150 yd from the flag.
    if (flag) for (const s of full) {
      const d = distYd(s, flag), b = bucketOf(d); if (!b) continue;
      const next = ss.find(x => x.shot_number > s.shot_number) || null;
      const end: LL | null = next ? next : s.result === "holed" || (putts === 0 && s === full[full.length - 1]) ? flag : null;
      const on = next ? isPuttShot(next) : s.result === "green" || s.result === "holed" ? true : MISS_RESULTS.has(s.result || "") ? false : s === full[full.length - 1] && putts != null ? true : null;
      const fr = end ? frame(s, flag, end) : null;
      const long = fr ? fr.along - fr.line : null, lat = fr ? fr.lateral : null;
      const miss = on !== false || long == null || lat == null ? null : Math.abs(long) >= Math.abs(lat) ? (long < 0 ? "short" : "long") : lat < 0 ? "left" : "right";
      apprs.push({ live_round_id: r.id, date: r.date, course: r.course_label, hole, bucket: b, from_yd: r0(d), on_green: on, prox_yd: end ? r0(distYd(end, flag)) : null,
        long_yd: long == null ? null : r1(long), lateral_yd: lat == null ? null : r1(lat), miss, flag_source: flagSrc });
    }
  }
  // Tee summary
  const dk = drives.filter(d => d.outcome), fw = dk.filter(d => d.outcome === "fairway").length, lf = dk.filter(d => d.outcome === "left").length, rt = dk.filter(d => d.outcome === "right").length;
  const meas = drives.filter(d => d.lateral_yd != null), lats = meas.map(d => d.lateral_yd!), carry = drives.filter(d => d.carry_yd != null && d.carry_yd > 0).map(d => d.carry_yd!);
  const tee = { drives: drives.length, known: dk.length, fairway_pct: pct(fw, dk.length), left_pct: pct(lf, dk.length), right_pct: pct(rt, dk.length),
    measured: meas.length, avg_lateral_yd: lats.length ? r1(mean(lats)!) : null, avg_abs_lateral_yd: lats.length ? r1(mean(lats.map(Math.abs))!) : null,
    avg_carry_yd: carry.length ? r0(mean(carry)!) : null, tendency: dk.length < 5 ? null : lf > rt * 1.5 && lf >= 3 ? "left" : rt > lf * 1.5 && rt >= 3 ? "right" : "balanced",
    band_yd: FAIRWAY_BAND_YD, shots: drives.slice(-200) };
  // GIR
  const gk = holeRows.filter(h => h.gir != null), girN = gk.filter(h => h.gir).length;
  const byPar = Object.fromEntries([3, 4, 5].map(pp => { const x = gk.filter(h => h.par === pp); return [pp, { holes: x.length, gir_pct: pct(x.filter(h => h.gir).length, x.length) }]; }));
  const gr = new Map<string, { date: string; n: number; g: number }>(); for (const h of gk) { const x = gr.get(h.live_round_id) || { date: h.date, n: 0, g: 0 }; x.n++; if (h.gir) x.g++; gr.set(h.live_round_id, x); }
  const gRounds = [...gr.entries()].map(([id, x]) => ({ live_round_id: id, date: x.date, holes: x.n, gir_pct: pct(x.g, x.n)! })).sort((a, b) => (a.date < b.date ? -1 : 1));
  const gh = Math.floor(gRounds.length / 2), g1 = mean(gRounds.slice(0, gh).map(x => x.gir_pct)), g2 = mean(gRounds.slice(gh).map(x => x.gir_pct));
  const missed = gk.filter(h => h.gir === false), gm = (m: string) => missed.filter(h => h.gir_miss === m).length;
  const gir = { holes: gk.length, gir_pct: pct(girN, gk.length), by_par: byPar, rounds: gRounds,
    trend: gRounds.length >= 4 && g1 != null && g2 != null ? { first_half: r0(g1), second_half: r0(g2), delta: r0(g2 - g1) } : null,
    missed: missed.length, miss: { short: gm("short"), long: gm("long"), left: gm("left"), right: gm("right") }, miss_known: missed.filter(h => h.gir_miss).length,
    holes_list: gk.map(h => ({ live_round_id: h.live_round_id, date: h.date, course: h.course, hole: h.hole, par: h.par, gir: h.gir, miss: h.gir_miss, putts: h.putts })) };
  // Approach buckets
  const buckets = BUCKETS.map(([, , id]) => {
    const a = apprs.filter(x => x.bucket === id), known = a.filter(x => x.on_green != null), on = known.filter(x => x.on_green).length;
    const prox = a.filter(x => x.prox_yd != null).map(x => x.prox_yd!), misses = a.filter(x => x.miss);
    const cnt = (m: string) => misses.filter(x => x.miss === m).length;
    const miss = { short: cnt("short"), long: cnt("long"), left: cnt("left"), right: cnt("right") };
    const top = misses.length >= 3 ? (Object.entries(miss).sort((p, q) => q[1] - p[1])[0][0]) : null;
    return { id, label: BUCKET_LABEL[id], shots: a.length, known: known.length, green_pct: pct(on, known.length), avg_prox_yd: prox.length ? r0(mean(prox)!) : null,
      prox_n: prox.length, miss, top_miss: top, pin_marked: a.filter(x => x.flag_source !== "green_center").length, list: a.slice(-200) };
  });
  // Putts
  const pk = holeRows.filter(h => h.putts != null), tot = pk.reduce((n, h) => n + h.putts!, 0);
  const perRound = new Map<string, { n: number; p: number; date: string }>();
  for (const h of pk) { const x = perRound.get(h.live_round_id) || { n: 0, p: 0, date: h.date }; x.n++; x.p += h.putts!; perRound.set(h.live_round_id, x); }
  const full18 = [...perRound.entries()].filter(([, x]) => x.n >= 18).map(([id, x]) => ({ live_round_id: id, date: x.date, putts: x.p }));
  const putts = { holes: pk.length, total: tot, per_hole: pk.length ? Math.round((tot / pk.length) * 100) / 100 : null,
    per_round: full18.length ? r1(mean(full18.map(x => x.putts))!) : null, per_round_est: !full18.length && pk.length ? r1((tot / pk.length) * 18) : null,
    one_putt_pct: pct(pk.filter(h => h.putts === 1).length, pk.length), three_putt_pct: pct(pk.filter(h => h.putts! >= 3).length, pk.length),
    rounds: full18, from_counter: pk.filter(h => h.putts_src === "counter").length,
    first_putt: (() => { const w = holeRows.filter(h => h.first_putt_yd != null);
      return { holes: w.length, avg_yd: w.length ? r1(mean(w.map(h => h.first_putt_yd!))!) : null, at_center: w.filter(h => h.flag_source === "green_center").length,
        bins: PUTT_BINS.map(([lo, hi, label]) => { const x = w.filter(h => h.first_putt_yd! >= lo && h.first_putt_yd! < hi), k = x.filter(h => h.putts != null);
          return { label, holes: x.length, avg_putts: k.length ? Math.round(mean(k.map(h => h.putts!))! * 100) / 100 : null, one_putt_pct: pct(k.filter(h => h.putts === 1).length, k.length) }; }) }; })() };
  const withData = new Set([...shots.filter(s => R.has(s.live_round_id)).map(s => s.live_round_id), ...holes.filter(h => R.has(h.live_round_id) && (h.putts != null || (h.pin && h.own_pin !== false))).map(h => h.live_round_id)]);
  return { gps_rounds: withData.size, with_data: [...withData], pins_marked: pinsMarked, tee, gir, approach: buckets, putts,
    empty: { tee: drives.length === 0, gir: gk.length === 0, approach: apprs.length === 0, putts: pk.length === 0 } };
}
