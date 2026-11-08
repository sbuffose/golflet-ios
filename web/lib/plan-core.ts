/** t176u/t177u/t179u "Preparar ronda": pure maths shared by the server and the browser (bundled to public/plan-core.js by
 *  web-build/gen-plan-core.mjs; tests/plan-core.test.ts keeps both in sync). No DB, no network. API_v5 §61.
 *
 *  WIND MODEL (an ESTIMATE, labelled as such in the app). Wind = Open-Meteo 10 m wind, used as-is (no height correction).
 *  - Head/tail component along the shot, crosswind across it, in mph.
 *  - Headwind: the ball flies 1% shorter per mph  → distance × (1 − 0.01·head)     (so it "plays" ~1%/mph longer)
 *  - Tailwind: the ball flies 0.5% longer per mph → distance × (1 + 0.005·tail)
 *  - Crosswind: drifts 0.5% of the no-wind distance per mph, downwind (wind from the right pushes the ball left).
 *  - Gusts are shown, not used in the maths. Clamped to 0.6–1.3 of the distance. */
export const YD = 0.9144, KMH_PER_MPH = 1.609344;
export const WIND_MODEL = { head_pct_per_mph: 1, tail_pct_per_mph: 0.5, drift_pct_per_mph: 0.5, height: "10 m (Open-Meteo)", gusts: "se muestran, no entran en la cuenta",
  label: "Estimación: en contra ~1% más corto por cada mph, a favor ~0,5% más largo por mph, cruzado desvía ~0,5% de la distancia por mph." } as const;
export const MIN_GPS_SHOTS = 5, OVAL_K = 1.515;   // 68% ellipse for a 2-D normal (√χ²₂(0.68) = 1.515)
export const DEFAULT_MIN_PER_HOLE = 14;

export type LL = [number, number];          // [lng, lat]
export type XY = [number, number];          // metres east/north of a reference point
export type Wind = { from_deg: number; kmh: number; gust_kmh?: number | null };

const rad = (d: number) => d * Math.PI / 180, deg = (r: number) => r * 180 / Math.PI;
export const norm360 = (d: number) => ((d % 360) + 360) % 360;
const r1 = (x: number) => Math.round(x * 10) / 10;

/* ---------- local metric frame (equirectangular; error < 0.1% over a golf hole) ---------- */
export function frame(ref: LL) {
  const kx = 111320 * Math.cos(rad(ref[1])), ky = 110574;
  return { xy: (p: LL): XY => [(p[0] - ref[0]) * kx, (p[1] - ref[1]) * ky], ll: (v: XY): LL => [ref[0] + v[0] / kx, ref[1] + v[1] / ky] };
}
export const dist = (a: XY, b: XY) => Math.hypot(b[0] - a[0], b[1] - a[1]);
export const bearingXY = (a: XY, b: XY) => norm360(deg(Math.atan2(b[0] - a[0], b[1] - a[1])));
const unit = (bearing: number): XY => [Math.sin(rad(bearing)), Math.cos(rad(bearing))];
const rightOf = (u: XY): XY => [u[1], -u[0]];

/* ---------- wind model ---------- */
/** Components for a shot played on `bearing` (true): head_mph > 0 = en contra; cross_mph > 0 = viene de la derecha. */
export function windComp(bearing: number, w: Wind) {
  const rel = rad(norm360(w.from_deg - bearing)), mph = w.kmh / KMH_PER_MPH;
  return { head_mph: r1(mph * Math.cos(rel)), cross_mph: r1(mph * Math.sin(rel)) };
}
export function distFactor(head_mph: number) {
  const f = head_mph >= 0 ? 1 - 0.01 * head_mph : 1 + 0.005 * -head_mph;
  return Math.min(1.3, Math.max(0.6, f));
}
/** Lateral yards (+ = right) per yard of no-wind distance. */
export const driftCoef = (cross_mph: number) => -0.005 * cross_mph;
export type Comp = { head_mph: number; cross_mph: number };
export const applyWind = (p: { fwd: number; lat: number }, c: Comp) => ({ fwd: p.fwd * distFactor(c.head_mph), lat: p.lat + driftCoef(c.cross_mph) * p.fwd });
export function removeWind(p: { fwd: number; lat: number }, c: Comp) { const fwd = p.fwd / distFactor(c.head_mph); return { fwd, lat: p.lat - driftCoef(c.cross_mph) * fwd }; }
/** How many yards longer (+) or shorter (−) `yd` plays with this head component. */
export const playsLikeYd = (yd: number, head_mph: number) => Math.round(yd / distFactor(head_mph) - yd);
/** Whole-hole effect: per leg (doglegs), summed. */
export function holeWindEffect(legs: { bearing_true: number; length_m: number }[], w: Wind) {
  const per = legs.map(l => { const c = windComp(l.bearing_true, w); return { bearing_true: l.bearing_true, length_yd: Math.round(l.length_m / YD), ...c, plays_like_yd: playsLikeYd(l.length_m / YD, c.head_mph) }; });
  return { plays_like_yd: per.reduce((a, b) => a + b.plays_like_yd, 0), legs: per };
}

/* ---------- t234u: what changes today's distance (each term rounded; the result = normal + the rounded terms, exactly) ----------
 *  Only terms with real data: wind (forecast, model above), temperature (forecast), rain (forecast precipitation), height change (elevation model; off in the UI until real course mapping), course firmness (the player's own setting; changes the roll only, so only for clubs with carry + total). */
export const ADJ_MODEL = {
  temp_ref_c: 20, temp_pct_per_c: 0.18,          // ≈1% per 10 °F (5.6 °C): air density + ball/club, a common rule of thumb
  rain_light_mm: 0.2, rain_heavy_mm: 1, rain_light_pct: -1.5, rain_heavy_pct: -3,   // wet ball / face and soft turf
  slope_yd_per_m: 1 / YD,                          // 1 yd shorter per yd the landing is above the ball (and longer below)
  firm_roll_pct: 50,                               // blanda: −50% of the roll · dura: +50%
  label: "Estimación: viento (modelo de arriba); temperatura ±0,18% por °C respecto de 20 °C; lluvia −1,5% (≥0,2 mm/h) o −3% (≥1 mm/h); altura (desactivada por ahora) 1 yd por yd de desnivel; cancha blanda/dura ∓50% del rodado.",
} as const;
export type AdjKey = "viento" | "temp" | "lluvia" | "altura" | "cancha";
export type AdjIn = { head_mph?: number | null; temp_c?: number | null; precip_mm?: number | null; rise_m?: number | null; roll_yd?: number | null; firm?: "blanda" | "normal" | "dura" | null };
/** Rounded terms for a shot of `yd` (normal distance). Zero terms are dropped. */
export function adjTerms(yd: number, o: AdjIn) {
  const t: { k: AdjKey; yd: number }[] = [], push = (k: AdjKey, v: number) => { const r = Math.sign(v) * Math.round(Math.abs(v)); if (r) t.push({ k, yd: r }); };
  if (o.head_mph != null) push("viento", yd * distFactor(o.head_mph) - yd);
  if (o.temp_c != null) push("temp", yd * ADJ_MODEL.temp_pct_per_c / 100 * (o.temp_c - ADJ_MODEL.temp_ref_c));
  if (o.precip_mm != null && o.precip_mm >= ADJ_MODEL.rain_light_mm) push("lluvia", yd * (o.precip_mm >= ADJ_MODEL.rain_heavy_mm ? ADJ_MODEL.rain_heavy_pct : ADJ_MODEL.rain_light_pct) / 100);
  if (o.rise_m != null) push("altura", -o.rise_m * ADJ_MODEL.slope_yd_per_m);
  if (o.firm && o.firm !== "normal" && o.roll_yd != null && o.roll_yd > 0) push("cancha", (o.firm === "dura" ? 1 : -1) * o.roll_yd * ADJ_MODEL.firm_roll_pct / 100);
  return t;
}
/** From the normal distance: result = normal + Σ rounded terms. */
export function shotAdjust(normal: number, o: AdjIn) { const n = Math.round(normal), terms = adjTerms(n, o); return { normal: n, terms, total: n + terms.reduce((a, b) => a + b.yd, 0) }; }
/** From a distance actually reached (dragged point): the normal distance it equals = reached − Σ terms (terms for that distance). */
export function shotReverse(reached: number, o: AdjIn) { const r = Math.round(reached), terms = adjTerms(r, o); return { normal: r - terms.reduce((a, b) => a + b.yd, 0), terms, total: r }; }
/** Temperature (°C) and precipitation (mm in that hour) at a local time, from the same hourly forecast (null when absent). */
export function wxAt(h: (Hourly & { temperature_2m?: (number | null)[]; precipitation?: (number | null)[] }) | null | undefined, at: string) {
  if (!h?.time?.length || !h.temperature_2m) return null;
  const t = Date.parse(at + ":00Z"), ts = h.time.map(x => Date.parse(x + ":00Z")); let i = ts.findIndex(x => x > t); if (i === 0) i = 1;
  if (i < 0) { if (t - ts[ts.length - 1] > 3600e3) return null; i = ts.length - 1; }
  const a = i - 1, b = i, k = ts[b] === ts[a] ? 0 : Math.min(1, Math.max(0, (t - ts[a]) / (ts[b] - ts[a]))), T = h.temperature_2m;
  const temp = T[a] == null || T[b] == null ? null : r1((1 - k) * T[a]! + k * T[b]!), pr = h.precipitation ? (h.precipitation[k < .5 ? a : b] ?? null) : null;
  return temp == null && pr == null ? null : { temp_c: temp, precip_mm: pr };
}

/* ---------- forecast interpolation ---------- */
export type Hourly = { time: string[]; wind_speed_10m: (number | null)[]; wind_direction_10m: (number | null)[]; wind_gusts_10m: (number | null)[]; temperature_2m?: (number | null)[]; precipitation?: (number | null)[] };
/** Wind at a local time "YYYY-MM-DDTHH:MM" (linear between hours; direction as a vector). Null outside the data. */
export function windAt(h: Hourly | null | undefined, at: string): Wind | null {
  if (!h?.time?.length) return null;
  const t = Date.parse(at + ":00Z"), ts = h.time.map(x => Date.parse(x + ":00Z"));
  let i = ts.findIndex(x => x > t); if (i === 0) i = 1; if (i < 0) { if (t - ts[ts.length - 1] > 3600e3) return null; i = ts.length - 1; }
  const a = i - 1, b = i, k = ts[b] === ts[a] ? 0 : Math.min(1, Math.max(0, (t - ts[a]) / (ts[b] - ts[a])));
  const s = [h.wind_speed_10m[a], h.wind_speed_10m[b]], d = [h.wind_direction_10m[a], h.wind_direction_10m[b]], g = [h.wind_gusts_10m[a], h.wind_gusts_10m[b]];
  if (s[0] == null || s[1] == null || d[0] == null || d[1] == null) return null;
  const vx = (1 - k) * s[0] * Math.sin(rad(d[0])) + k * s[1] * Math.sin(rad(d[1])), vy = (1 - k) * s[0] * Math.cos(rad(d[0])) + k * s[1] * Math.cos(rad(d[1]));
  return { kmh: r1((1 - k) * s[0] + k * s[1]), from_deg: Math.round(norm360(deg(Math.atan2(vx, vy)))), gust_kmh: g[0] == null || g[1] == null ? null : r1((1 - k) * g[0] + k * g[1]) };
}

/* ---------- schedule ---------- */
const PW: Record<number, number> = { 3: 0.8, 4: 1, 5: 1.25 };   // same par weighting as §50 pace
export const hhmm = (min: number) => { const m = ((Math.round(min) % 1440) + 1440) % 1440; return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`; };
/** Tee-off time of every hole: tee time + cumulative pace (par-weighted), starting on hole 1 or 10. */
export function holeSchedule(teeTime: string, startHole: 1 | 10, minPerHole: number, pars: (number | null)[]) {
  const n = pars.length || 18, [hh, mm] = teeTime.split(":").map(Number), t0 = hh * 60 + mm;
  const order = Array.from({ length: n }, (_, i) => ((startHole - 1 + i) % n) + 1);
  const w = order.map(h => PW[pars[h - 1] as number] ?? 1), k = (minPerHole * n) / w.reduce((a, b) => a + b, 0);
  let acc = 0;
  const rows = order.map((hole, i) => { const start = acc; acc += w[i] * k; return { hole, order: i + 1, start_min: r1(start), minutes: r1(w[i] * k), eta: hhmm(t0 + start) }; });
  return rows.sort((a, b) => a.hole - b.hole);
}

/* ---------- dispersion (GPS) ---------- */
export type Sample = { fwd_yd: number; lat_yd: number; wind?: Comp | null };
const median = (v: number[]) => { const s = [...v].sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
/** Shot in the start→target frame (yards): forward along the line, lateral (+ = right). */
export function shotFrame(start: XY, end: XY, target: XY) {
  const u = unit(bearingXY(start, target)), r = rightOf(u), d: XY = [end[0] - start[0], end[1] - start[1]];
  return { fwd_yd: (d[0] * u[0] + d[1] * u[1]) / YD, lat_yd: (d[0] * r[0] + d[1] * r[1]) / YD, bearing: bearingXY(start, target) };
}
/** Wind-normalised dispersion: each shot has the wind of its day/hour removed, outliers trimmed (3·MAD), then mean + covariance. */
export function dispersion(samples: Sample[]) {
  const n0 = samples.map(s => s.wind ? { ...removeWind({ fwd: s.fwd_yd, lat: s.lat_yd }, s.wind), w: true } : { fwd: s.fwd_yd, lat: s.lat_yd, w: false });
  const mf = median(n0.map(p => p.fwd)), ml = median(n0.map(p => p.lat));
  const madf = 1.4826 * median(n0.map(p => Math.abs(p.fwd - mf))), madl = 1.4826 * median(n0.map(p => Math.abs(p.lat - ml)));
  const keep = n0.filter(p => p.fwd > 0 && Math.abs(p.fwd - mf) <= Math.max(3 * madf, 12) && Math.abs(p.lat - ml) <= Math.max(3 * madl, 10));
  const base = { n: samples.length, used: keep.length, trimmed: samples.length - keep.length, wind_known: keep.filter(p => p.w).length };
  if (keep.length < MIN_GPS_SHOTS) return { ...base, ok: false as const, reason: "pocos_tiros" as const };
  const m = keep.length, f = keep.reduce((a, p) => a + p.fwd, 0) / m, l = keep.reduce((a, p) => a + p.lat, 0) / m;
  const sff = keep.reduce((a, p) => a + (p.fwd - f) ** 2, 0) / (m - 1), sll = keep.reduce((a, p) => a + (p.lat - l) ** 2, 0) / (m - 1), sfl = keep.reduce((a, p) => a + (p.fwd - f) * (p.lat - l), 0) / (m - 1);
  return { ...base, ok: true as const, mean: { fwd: r1(f), lat: r1(l) }, cov: [[r1(sff), r1(sfl)], [r1(sfl), r1(sll)]] as [[number, number], [number, number]] };
}
/** Re-project a no-wind dispersion with a wind (linear map J = [[f,0],[c,1]] on (fwd, lat)). */
export function projectDispersion(d: { mean: { fwd: number; lat: number }; cov: number[][] }, c: Comp | null) {
  if (!c) return { mean: d.mean, cov: d.cov };
  const f = distFactor(c.head_mph), k = driftCoef(c.cross_mph), [[a, b], [, e]] = d.cov;
  return { mean: { fwd: d.mean.fwd * f, lat: d.mean.lat + k * d.mean.fwd }, cov: [[f * f * a, f * (k * a + b)], [f * (k * a + b), k * k * a + 2 * k * b + e]] };
}
/** Ellipse semi-axes (yd) and the angle of the major axis from the forward direction (deg, + towards the right). */
export function ellipse(cov: number[][], k = OVAL_K) {
  const [[a, b], [, c]] = cov, tr = (a + c) / 2, det = Math.sqrt(Math.max(0, ((a - c) / 2) ** 2 + b * b));
  const l1 = tr + det, l2 = Math.max(0, tr - det), ang = Math.abs(b) < 1e-9 ? (a >= c ? 0 : 90) : deg(Math.atan2(l1 - a, b));
  return { a_yd: r1(k * Math.sqrt(l1)), b_yd: r1(k * Math.sqrt(l2)), angle_deg: r1(ang) };
}

/* ---------- planner geometry ---------- */
/** Aim along the hole: the point `d` metres further along the play path from where `from` projects (doglegs), capped at the green centre. */
export function aimPoint(path: XY[], from: XY, d: number): XY {
  let best = { s: 0, dd: Infinity }, acc = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i], b = path[i + 1], L = dist(a, b) || 1e-9, t = Math.max(0, Math.min(1, ((from[0] - a[0]) * (b[0] - a[0]) + (from[1] - a[1]) * (b[1] - a[1])) / (L * L)));
    const p: XY = [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])], dd = dist(p, from); if (dd < best.dd) best = { s: acc + t * L, dd }; acc += L;
  }
  const goal = Math.min(acc, best.s + Math.sqrt(Math.max(0, d * d - best.dd * best.dd)));
  let s = 0; for (let i = 0; i < path.length - 1; i++) { const L = dist(path[i], path[i + 1]); if (s + L >= goal) { const t = (goal - s) / (L || 1e-9); return [path[i][0] + t * (path[i + 1][0] - path[i][0]), path[i][1] + t * (path[i + 1][1] - path[i][1])]; } s += L; }
  return path[path.length - 1];
}
/** A point `fwd`/`lat` yards from `from`, in the frame pointing at `aim`. */
export function offsetPoint(from: XY, aim: XY, fwd_yd: number, lat_yd: number): XY {
  const u = unit(bearingXY(from, aim)), r = rightOf(u);
  return [from[0] + (u[0] * fwd_yd + r[0] * lat_yd) * YD, from[1] + (u[1] * fwd_yd + r[1] * lat_yd) * YD];
}
export function inPoly(p: XY, poly: XY[]) {
  let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) c = !c;
  } return c;
}
export type Hz = { id: number; kind: string; poly: XY[] };
/** Hazards a point is in. */
export const hitsAt = (p: XY, hz: Hz[]) => hz.filter(h => h.poly.length > 2 && inPoly(p, h.poly)).map(h => ({ id: h.id, kind: h.kind }));
/** Share of the oval (uniform grid inside the ellipse) that falls in each hazard. */
export function ovalHits(from: XY, aim: XY, mean: { fwd: number; lat: number }, cov: number[][], hz: Hz[], k = OVAL_K) {
  const e = ellipse(cov, k), th = rad(e.angle_deg), N = 13, cnt = new Map<number, { kind: string; n: number }>(); let tot = 0;
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const x = (2 * i / (N - 1) - 1), y = (2 * j / (N - 1) - 1); if (x * x + y * y > 1) continue; tot++;
    const fa = x * e.a_yd, lb = y * e.b_yd, fwd = mean.fwd + fa * Math.cos(th) - lb * Math.sin(th), lat = mean.lat + fa * Math.sin(th) + lb * Math.cos(th);
    for (const h of hitsAt(offsetPoint(from, aim, fwd, lat), hz)) { const c = cnt.get(h.id) || { kind: h.kind, n: 0 }; c.n++; cnt.set(h.id, c); }
  }
  return [...cnt.entries()].map(([id, c]) => ({ id, kind: c.kind, pct: Math.round((100 * c.n) / tot) })).filter(x => x.pct >= 3).sort((a, b) => b.pct - a.pct);
}
/** Clean the planner's per-hole shots before saving (owner input). */
export function cleanShots(v: unknown) {
  if (!Array.isArray(v)) throw new Error("shots");
  return v.slice(0, 12).map((s: any) => {
    const p = (x: any): LL | null => Array.isArray(x) && x.length === 2 && x.every((n: any) => Number.isFinite(+n)) && Math.abs(+x[1]) <= 90 && Math.abs(+x[0]) <= 180 ? [+(+x[0]).toFixed(7), +(+x[1]).toFixed(7)] : null;
    const club = String(s?.club ?? "").trim().slice(0, 8), to = p(s?.to);
    const yd = Number(s?.yd_from_tee);   // t190u: schematic shots (course without map geometry: club guide only)
    if (!club || (!to && !(Number.isFinite(yd) && yd >= 1 && yd <= 700))) throw new Error("shot");
    const aim = Number(s?.aim_yd); return { club, source: s?.source === "gps" ? "gps" : "libreto", ...(to ? { to } : { yd_from_tee: Math.round(yd) }), adjusted: !!s?.adjusted, ...(s?.suggested ? { suggested: true } : {}), ...(Number.isFinite(aim) && aim !== 0 ? { aim_yd: Math.max(-60, Math.min(60, Math.round(aim))) } : {}) };
  });
}
