/* Generated from lib/plan-browser.ts (plan-core + torneo-core + plan-suggest) by web-build/gen-plan-core.mjs. Do not edit. */
"use strict";
var GolfletPlanCore = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // lib/plan-browser.ts
  var plan_browser_exports = {};
  __export(plan_browser_exports, {
    ADJ_MODEL: () => ADJ_MODEL,
    AUTO_DEFAULTS: () => AUTO_DEFAULTS,
    CARD_W: () => CARD_W,
    DEFAULT_MIN_PER_HOLE: () => DEFAULT_MIN_PER_HOLE,
    DEVICES: () => DEVICES,
    FID: () => FID,
    FIRST_PUTT: () => FIRST_PUTT,
    ID_BITS: () => ID_BITS,
    ID_CELL: () => ID_CELL,
    ID_GAP: () => ID_GAP,
    KIND_ES: () => KIND_ES,
    KMH_PER_MPH: () => KMH_PER_MPH,
    LIES: () => LIES,
    LOG_H: () => LOG_H,
    MIN_GPS_SHOTS: () => MIN_GPS_SHOTS,
    OVAL_K: () => OVAL_K,
    PARTIAL_PEN: () => PARTIAL_PEN,
    RISK_YD: () => RISK_YD,
    RULES_480_PT_PER_YD: () => RULES_480_PT_PER_YD,
    TORNEO_MATRIX: () => TORNEO_MATRIX,
    WIND_MODEL: () => WIND_MODEL,
    YD: () => YD,
    adjTerms: () => adjTerms,
    aimPoint: () => aimPoint,
    applyWind: () => applyWind,
    asDistToLine: () => asDistToLine,
    asInPoly: () => asInPoly,
    asLateral: () => asLateral,
    asMeters: () => asMeters,
    autoHole: () => autoHole,
    autoToLog: () => autoToLog,
    bearingXY: () => bearingXY,
    cardLayout: () => cardLayout,
    classifyLie: () => classifyLie,
    cleanLogHole: () => cleanLogHole,
    cleanShots: () => cleanShots,
    clubEstimates: () => clubEstimates,
    courseHash5: () => courseHash5,
    decodeCardId: () => decodeCardId,
    detectStops: () => detectStops,
    dispersion: () => dispersion,
    dist: () => dist,
    distFactor: () => distFactor,
    driftCoef: () => driftCoef,
    ellipse: () => ellipse,
    encodeCardId: () => encodeCardId,
    evalShot: () => evalShot,
    findSquares: () => findSquares,
    fitDD: () => fitDD,
    frame: () => frame,
    geoFromMap: () => geoFromMap,
    greenBox: () => greenBox,
    greenGeom: () => greenGeom,
    halfWidthAt: () => halfWidthAt,
    hhmm: () => hhmm,
    hitsAt: () => hitsAt,
    holeOutcome: () => holeOutcome,
    holeSchedule: () => holeSchedule,
    holeWindEffect: () => holeWindEffect,
    homography: () => homography,
    inPoly: () => inPoly,
    inRoundWindow: () => inRoundWindow,
    isTorneoBooking: () => isTorneoBooking,
    logStats: () => logStats,
    norm360: () => norm360,
    offsetPoint: () => offsetPoint,
    ovalHits: () => ovalHits,
    pickFiducials: () => pickFiducials,
    playsLikeYd: () => playsLikeYd,
    project: () => project,
    projectDispersion: () => projectDispersion,
    readCard: () => readCard,
    relayHole: () => relayHole,
    removeWind: () => removeWind,
    shotAdjust: () => shotAdjust,
    shotFrame: () => shotFrame,
    shotReverse: () => shotReverse,
    suggestShot: () => suggestShot,
    torneoState: () => torneoState,
    windAt: () => windAt,
    windComp: () => windComp,
    wxAt: () => wxAt
  });

  // lib/plan-core.ts
  var YD = 0.9144;
  var KMH_PER_MPH = 1.609344;
  var WIND_MODEL = {
    head_pct_per_mph: 1,
    tail_pct_per_mph: 0.5,
    drift_pct_per_mph: 0.5,
    height: "10 m (Open-Meteo)",
    gusts: "se muestran, no entran en la cuenta",
    label: "Estimaci\xF3n: en contra ~1% m\xE1s corto por cada mph, a favor ~0,5% m\xE1s largo por mph, cruzado desv\xEDa ~0,5% de la distancia por mph."
  };
  var MIN_GPS_SHOTS = 5;
  var OVAL_K = 1.515;
  var DEFAULT_MIN_PER_HOLE = 14;
  var rad = (d) => d * Math.PI / 180;
  var deg = (r) => r * 180 / Math.PI;
  var norm360 = (d) => (d % 360 + 360) % 360;
  var r1 = (x) => Math.round(x * 10) / 10;
  function frame(ref) {
    const kx = 111320 * Math.cos(rad(ref[1])), ky = 110574;
    return { xy: (p) => [(p[0] - ref[0]) * kx, (p[1] - ref[1]) * ky], ll: (v) => [ref[0] + v[0] / kx, ref[1] + v[1] / ky] };
  }
  var dist = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
  var bearingXY = (a, b) => norm360(deg(Math.atan2(b[0] - a[0], b[1] - a[1])));
  var unit = (bearing) => [Math.sin(rad(bearing)), Math.cos(rad(bearing))];
  var rightOf = (u) => [u[1], -u[0]];
  function windComp(bearing, w) {
    const rel = rad(norm360(w.from_deg - bearing)), mph = w.kmh / KMH_PER_MPH;
    return { head_mph: r1(mph * Math.cos(rel)), cross_mph: r1(mph * Math.sin(rel)) };
  }
  function distFactor(head_mph) {
    const f = head_mph >= 0 ? 1 - 0.01 * head_mph : 1 + 5e-3 * -head_mph;
    return Math.min(1.3, Math.max(0.6, f));
  }
  var driftCoef = (cross_mph) => -5e-3 * cross_mph;
  var applyWind = (p, c) => ({ fwd: p.fwd * distFactor(c.head_mph), lat: p.lat + driftCoef(c.cross_mph) * p.fwd });
  function removeWind(p, c) {
    const fwd = p.fwd / distFactor(c.head_mph);
    return { fwd, lat: p.lat - driftCoef(c.cross_mph) * fwd };
  }
  var playsLikeYd = (yd, head_mph) => Math.round(yd / distFactor(head_mph) - yd);
  function holeWindEffect(legs, w) {
    const per = legs.map((l) => {
      const c = windComp(l.bearing_true, w);
      return { bearing_true: l.bearing_true, length_yd: Math.round(l.length_m / YD), ...c, plays_like_yd: playsLikeYd(l.length_m / YD, c.head_mph) };
    });
    return { plays_like_yd: per.reduce((a, b) => a + b.plays_like_yd, 0), legs: per };
  }
  var ADJ_MODEL = {
    temp_ref_c: 20,
    temp_pct_per_c: 0.18,
    // ≈1% per 10 °F (5.6 °C): air density + ball/club, a common rule of thumb
    rain_light_mm: 0.2,
    rain_heavy_mm: 1,
    rain_light_pct: -1.5,
    rain_heavy_pct: -3,
    // wet ball / face and soft turf
    slope_yd_per_m: 1 / YD,
    // 1 yd shorter per yd the landing is above the ball (and longer below)
    firm_roll_pct: 50,
    // blanda: −50% of the roll · dura: +50%
    label: "Estimaci\xF3n: viento (modelo de arriba); temperatura \xB10,18% por \xB0C respecto de 20 \xB0C; lluvia \u22121,5% (\u22650,2 mm/h) o \u22123% (\u22651 mm/h); altura (desactivada por ahora) 1 yd por yd de desnivel; cancha blanda/dura \u221350% del rodado."
  };
  function adjTerms(yd, o) {
    const t = [], push = (k, v) => {
      const r = Math.sign(v) * Math.round(Math.abs(v));
      if (r) t.push({ k, yd: r });
    };
    if (o.head_mph != null) push("viento", yd * distFactor(o.head_mph) - yd);
    if (o.temp_c != null) push("temp", yd * ADJ_MODEL.temp_pct_per_c / 100 * (o.temp_c - ADJ_MODEL.temp_ref_c));
    if (o.precip_mm != null && o.precip_mm >= ADJ_MODEL.rain_light_mm) push("lluvia", yd * (o.precip_mm >= ADJ_MODEL.rain_heavy_mm ? ADJ_MODEL.rain_heavy_pct : ADJ_MODEL.rain_light_pct) / 100);
    if (o.rise_m != null) push("altura", -o.rise_m * ADJ_MODEL.slope_yd_per_m);
    if (o.firm && o.firm !== "normal" && o.roll_yd != null && o.roll_yd > 0) push("cancha", (o.firm === "dura" ? 1 : -1) * o.roll_yd * ADJ_MODEL.firm_roll_pct / 100);
    return t;
  }
  function shotAdjust(normal, o) {
    const n = Math.round(normal), terms = adjTerms(n, o);
    return { normal: n, terms, total: n + terms.reduce((a, b) => a + b.yd, 0) };
  }
  function shotReverse(reached, o) {
    const r = Math.round(reached), terms = adjTerms(r, o);
    return { normal: r - terms.reduce((a, b) => a + b.yd, 0), terms, total: r };
  }
  function wxAt(h, at) {
    if (!h?.time?.length || !h.temperature_2m) return null;
    const t = Date.parse(at + ":00Z"), ts = h.time.map((x) => Date.parse(x + ":00Z"));
    let i = ts.findIndex((x) => x > t);
    if (i === 0) i = 1;
    if (i < 0) {
      if (t - ts[ts.length - 1] > 36e5) return null;
      i = ts.length - 1;
    }
    const a = i - 1, b = i, k = ts[b] === ts[a] ? 0 : Math.min(1, Math.max(0, (t - ts[a]) / (ts[b] - ts[a]))), T = h.temperature_2m;
    const temp = T[a] == null || T[b] == null ? null : r1((1 - k) * T[a] + k * T[b]), pr = h.precipitation ? h.precipitation[k < 0.5 ? a : b] ?? null : null;
    return temp == null && pr == null ? null : { temp_c: temp, precip_mm: pr };
  }
  function windAt(h, at) {
    if (!h?.time?.length) return null;
    const t = Date.parse(at + ":00Z"), ts = h.time.map((x) => Date.parse(x + ":00Z"));
    let i = ts.findIndex((x) => x > t);
    if (i === 0) i = 1;
    if (i < 0) {
      if (t - ts[ts.length - 1] > 36e5) return null;
      i = ts.length - 1;
    }
    const a = i - 1, b = i, k = ts[b] === ts[a] ? 0 : Math.min(1, Math.max(0, (t - ts[a]) / (ts[b] - ts[a])));
    const s = [h.wind_speed_10m[a], h.wind_speed_10m[b]], d = [h.wind_direction_10m[a], h.wind_direction_10m[b]], g = [h.wind_gusts_10m[a], h.wind_gusts_10m[b]];
    if (s[0] == null || s[1] == null || d[0] == null || d[1] == null) return null;
    const vx = (1 - k) * s[0] * Math.sin(rad(d[0])) + k * s[1] * Math.sin(rad(d[1])), vy = (1 - k) * s[0] * Math.cos(rad(d[0])) + k * s[1] * Math.cos(rad(d[1]));
    return { kmh: r1((1 - k) * s[0] + k * s[1]), from_deg: Math.round(norm360(deg(Math.atan2(vx, vy)))), gust_kmh: g[0] == null || g[1] == null ? null : r1((1 - k) * g[0] + k * g[1]) };
  }
  var PW = { 3: 0.8, 4: 1, 5: 1.25 };
  var hhmm = (min) => {
    const m = (Math.round(min) % 1440 + 1440) % 1440;
    return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  };
  function holeSchedule(teeTime, startHole, minPerHole, pars) {
    const n = pars.length || 18, [hh, mm] = teeTime.split(":").map(Number), t0 = hh * 60 + mm;
    const order = Array.from({ length: n }, (_, i) => (startHole - 1 + i) % n + 1);
    const w = order.map((h) => PW[pars[h - 1]] ?? 1), k = minPerHole * n / w.reduce((a, b) => a + b, 0);
    let acc = 0;
    const rows = order.map((hole, i) => {
      const start = acc;
      acc += w[i] * k;
      return { hole, order: i + 1, start_min: r1(start), minutes: r1(w[i] * k), eta: hhmm(t0 + start) };
    });
    return rows.sort((a, b) => a.hole - b.hole);
  }
  var median = (v) => {
    const s = [...v].sort((a, b) => a - b), m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  };
  function shotFrame(start, end, target) {
    const u = unit(bearingXY(start, target)), r = rightOf(u), d = [end[0] - start[0], end[1] - start[1]];
    return { fwd_yd: (d[0] * u[0] + d[1] * u[1]) / YD, lat_yd: (d[0] * r[0] + d[1] * r[1]) / YD, bearing: bearingXY(start, target) };
  }
  function dispersion(samples) {
    const n0 = samples.map((s) => s.wind ? { ...removeWind({ fwd: s.fwd_yd, lat: s.lat_yd }, s.wind), w: true } : { fwd: s.fwd_yd, lat: s.lat_yd, w: false });
    const mf = median(n0.map((p) => p.fwd)), ml = median(n0.map((p) => p.lat));
    const madf = 1.4826 * median(n0.map((p) => Math.abs(p.fwd - mf))), madl = 1.4826 * median(n0.map((p) => Math.abs(p.lat - ml)));
    const keep = n0.filter((p) => p.fwd > 0 && Math.abs(p.fwd - mf) <= Math.max(3 * madf, 12) && Math.abs(p.lat - ml) <= Math.max(3 * madl, 10));
    const base = { n: samples.length, used: keep.length, trimmed: samples.length - keep.length, wind_known: keep.filter((p) => p.w).length };
    if (keep.length < MIN_GPS_SHOTS) return { ...base, ok: false, reason: "pocos_tiros" };
    const m = keep.length, f = keep.reduce((a, p) => a + p.fwd, 0) / m, l = keep.reduce((a, p) => a + p.lat, 0) / m;
    const sff = keep.reduce((a, p) => a + (p.fwd - f) ** 2, 0) / (m - 1), sll = keep.reduce((a, p) => a + (p.lat - l) ** 2, 0) / (m - 1), sfl = keep.reduce((a, p) => a + (p.fwd - f) * (p.lat - l), 0) / (m - 1);
    return { ...base, ok: true, mean: { fwd: r1(f), lat: r1(l) }, cov: [[r1(sff), r1(sfl)], [r1(sfl), r1(sll)]] };
  }
  function projectDispersion(d, c) {
    if (!c) return { mean: d.mean, cov: d.cov };
    const f = distFactor(c.head_mph), k = driftCoef(c.cross_mph), [[a, b], [, e]] = d.cov;
    return { mean: { fwd: d.mean.fwd * f, lat: d.mean.lat + k * d.mean.fwd }, cov: [[f * f * a, f * (k * a + b)], [f * (k * a + b), k * k * a + 2 * k * b + e]] };
  }
  function ellipse(cov, k = OVAL_K) {
    const [[a, b], [, c]] = cov, tr = (a + c) / 2, det = Math.sqrt(Math.max(0, ((a - c) / 2) ** 2 + b * b));
    const l1 = tr + det, l2 = Math.max(0, tr - det), ang = Math.abs(b) < 1e-9 ? a >= c ? 0 : 90 : deg(Math.atan2(l1 - a, b));
    return { a_yd: r1(k * Math.sqrt(l1)), b_yd: r1(k * Math.sqrt(l2)), angle_deg: r1(ang) };
  }
  function aimPoint(path, from, d) {
    let best = { s: 0, dd: Infinity }, acc = 0;
    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i], b = path[i + 1], L = dist(a, b) || 1e-9, t = Math.max(0, Math.min(1, ((from[0] - a[0]) * (b[0] - a[0]) + (from[1] - a[1]) * (b[1] - a[1])) / (L * L)));
      const p = [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])], dd = dist(p, from);
      if (dd < best.dd) best = { s: acc + t * L, dd };
      acc += L;
    }
    const goal = Math.min(acc, best.s + Math.sqrt(Math.max(0, d * d - best.dd * best.dd)));
    let s = 0;
    for (let i = 0; i < path.length - 1; i++) {
      const L = dist(path[i], path[i + 1]);
      if (s + L >= goal) {
        const t = (goal - s) / (L || 1e-9);
        return [path[i][0] + t * (path[i + 1][0] - path[i][0]), path[i][1] + t * (path[i + 1][1] - path[i][1])];
      }
      s += L;
    }
    return path[path.length - 1];
  }
  function offsetPoint(from, aim, fwd_yd, lat_yd) {
    const u = unit(bearingXY(from, aim)), r = rightOf(u);
    return [from[0] + (u[0] * fwd_yd + r[0] * lat_yd) * YD, from[1] + (u[1] * fwd_yd + r[1] * lat_yd) * YD];
  }
  function inPoly(p, poly) {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if (yi > p[1] !== yj > p[1] && p[0] < (xj - xi) * (p[1] - yi) / (yj - yi) + xi) c = !c;
    }
    return c;
  }
  var hitsAt = (p, hz) => hz.filter((h) => h.poly.length > 2 && inPoly(p, h.poly)).map((h) => ({ id: h.id, kind: h.kind }));
  function ovalHits(from, aim, mean, cov, hz, k = OVAL_K) {
    const e = ellipse(cov, k), th = rad(e.angle_deg), N = 13, cnt = /* @__PURE__ */ new Map();
    let tot = 0;
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      const x = 2 * i / (N - 1) - 1, y = 2 * j / (N - 1) - 1;
      if (x * x + y * y > 1) continue;
      tot++;
      const fa = x * e.a_yd, lb = y * e.b_yd, fwd = mean.fwd + fa * Math.cos(th) - lb * Math.sin(th), lat = mean.lat + fa * Math.sin(th) + lb * Math.cos(th);
      for (const h of hitsAt(offsetPoint(from, aim, fwd, lat), hz)) {
        const c = cnt.get(h.id) || { kind: h.kind, n: 0 };
        c.n++;
        cnt.set(h.id, c);
      }
    }
    return [...cnt.entries()].map(([id, c]) => ({ id, kind: c.kind, pct: Math.round(100 * c.n / tot) })).filter((x) => x.pct >= 3).sort((a, b) => b.pct - a.pct);
  }
  function cleanShots(v) {
    if (!Array.isArray(v)) throw new Error("shots");
    return v.slice(0, 12).map((s) => {
      const p = (x) => Array.isArray(x) && x.length === 2 && x.every((n) => Number.isFinite(+n)) && Math.abs(+x[1]) <= 90 && Math.abs(+x[0]) <= 180 ? [+(+x[0]).toFixed(7), +(+x[1]).toFixed(7)] : null;
      const club = String(s?.club ?? "").trim().slice(0, 8), to = p(s?.to);
      const yd = Number(s?.yd_from_tee);
      if (!club || !to && !(Number.isFinite(yd) && yd >= 1 && yd <= 700)) throw new Error("shot");
      const aim = Number(s?.aim_yd);
      return { club, source: s?.source === "gps" ? "gps" : "libreto", ...to ? { to } : { yd_from_tee: Math.round(yd) }, adjusted: !!s?.adjusted, ...s?.suggested ? { suggested: true } : {}, ...Number.isFinite(aim) && aim !== 0 ? { aim_yd: Math.max(-60, Math.min(60, Math.round(aim))) } : {} };
    });
  }

  // lib/torneo-core.ts
  var TORNEO_MATRIX = [
    { key: "distances", label: "Distancias (adelante/centro/fondo, al green)", normal: "si", torneo: "si", sin_medidores: "bloqueado" },
    { key: "markers", label: "Marcas 50\u2013250 yd en el mapa", normal: "si", torneo: "si", sin_medidores: "bloqueado" },
    { key: "hazards", label: "Obst\xE1culos (s\xEDmbolos en el mapa)", normal: "si", torneo: "si", sin_medidores: "si" },
    { key: "hazard_carry", label: "Carry a obst\xE1culos (yd)", normal: "si", torneo: "si", sin_medidores: "bloqueado" },
    { key: "forecast", label: "Pron\xF3stico del tiempo (viento km/h, direcci\xF3n, hora)", normal: "si", torneo: "si", sin_medidores: "si" },
    { key: "own_plan", label: "Tu estrategia armada antes (palos y ca\xEDdas)", normal: "si", torneo: "estatico", sin_medidores: "estatico" },
    { key: "plays_like", label: "\xB1 yd por viento (juega como)", normal: "si", torneo: "bloqueado", sin_medidores: "bloqueado" },
    { key: "live_wind", label: "Viento medido o calculado en vivo", normal: "no_aplica", torneo: "bloqueado", sin_medidores: "bloqueado" },
    { key: "recommendations", label: "Qu\xE9 conviene: palo sugerido y hacia d\xF3nde apuntar", normal: "si", torneo: "bloqueado", sin_medidores: "bloqueado" },
    { key: "planner", label: "Planificador (calcular golpes nuevos)", normal: "si", torneo: "bloqueado", sin_medidores: "bloqueado" },
    { key: "ovals", label: "\xD3valos de dispersi\xF3n con viento", normal: "si", torneo: "bloqueado", sin_medidores: "bloqueado" },
    { key: "green_slopes", label: "Pendientes del green (mapa y 3D)", normal: "si", torneo: "bloqueado", sin_medidores: "bloqueado" }
  ];
  function torneoState(i) {
    const auto = i.club_booking || i.competition_card, on = i.manual ?? auto, active = on && i.in_round, noDist = active && i.no_distance_rule;
    const col = noDist ? "sin_medidores" : active ? "torneo" : "normal";
    const locks = Object.fromEntries(TORNEO_MATRIX.map((r) => [r.key, r[col] === "bloqueado"]));
    return {
      on,
      auto,
      manual: i.manual,
      source: i.manual != null ? "manual" : i.competition_card ? "competition_card" : i.club_booking ? "club_booking" : null,
      in_round: i.in_round,
      active,
      no_distance_rule: i.no_distance_rule,
      mode: col,
      locks
    };
  }
  var isTorneoBooking = (t) => t.source === "club" && !!(t.modality && t.modality.trim() || t.event_name && t.event_name.trim());
  function inRoundWindow(date, teeTime, now) {
    if (date !== now.date) return false;
    const m = (s) => {
      const [h, mm] = s.split(":").map(Number);
      return h * 60 + mm;
    }, d = m(now.time) - m(teeTime);
    return d >= -15 && d <= 360;
  }

  // lib/plan-suggest.ts
  var RISK_YD = { bunker: 0.4, agua: 2, bosque: 0.6, "l\xEDmite": 2 };
  var KIND_ES = { bunker: "el bunker", agua: "el agua", bosque: "los \xE1rboles", "l\xEDmite": "el OB" };
  function fitDD(dd, remain) {
    if (dd.yd <= remain + 15) return dd;
    const k = remain / dd.yd;
    return dd.kind === "oval" && dd.mean && dd.cov ? { ...dd, yd: remain, mean: { fwd: remain, lat: dd.mean.lat * k }, cov: dd.cov.map((r) => r.map((v) => v * k * k)), partial: true } : { ...dd, yd: remain, carry: null, partial: true };
  }
  function evalShot(ball, green, path, c, wind, hz, aimYd) {
    const remain = dist(ball, green) / YD, dd = fitDD(c.dd, remain), aim = aimPoint(path, ball, dd.yd * YD);
    const comp = wind ? windComp(bearingXY(ball, aim), wind) : null, baseLat = dd.kind === "oval" && dd.mean ? dd.mean.lat : 0;
    const wp = comp ? applyWind({ fwd: dd.yd, lat: baseLat }, comp) : { fwd: dd.yd, lat: baseLat };
    let a = aimYd ?? Math.round(-wp.lat);
    if (aimYd == null && Math.abs(a) < 3) a = 0;
    const landing = offsetPoint(ball, aim, wp.fwd, wp.lat + a), risk = /* @__PURE__ */ new Map();
    if (dd.kind === "oval" && dd.mean && dd.cov) {
      const pr = projectDispersion({ mean: dd.mean, cov: dd.cov }, comp);
      for (const h of ovalHits(ball, aim, { fwd: pr.mean.fwd, lat: pr.mean.lat + a }, pr.cov, hz)) risk.set(h.kind, Math.min(100, (risk.get(h.kind) || 0) + h.pct));
    } else {
      const pts = [landing];
      if (dd.carry != null && dd.carry < dd.yd) {
        const cw = comp ? applyWind({ fwd: dd.carry, lat: 0 }, comp) : { fwd: dd.carry, lat: 0 };
        pts.push(offsetPoint(ball, aim, cw.fwd, cw.lat + a));
      }
      for (const p of pts) for (const h of hitsAt(p, hz)) risk.set(h.kind, 100);
    }
    const rs = [...risk.entries()].map(([kind, pct]) => ({ kind, pct })).sort((x, y) => y.pct - x.pct);
    const after = dist(landing, green) / YD, pen = rs.reduce((s, r) => s + r.pct * (RISK_YD[r.kind] ?? 1), 0);
    return { code: c.code, dd, aim_yd: a, fwd: Math.round(wp.fwd), landing, after_yd: Math.round(after), risk: rs, risk_pct: rs.reduce((s, r) => s + r.pct, 0), score: after + pen, partial: !!dd.partial };
  }
  var isDriver = (code) => /^(dr|driver)$/i.test(code);
  var PARTIAL_PEN = 0.35;
  function suggestShot(o) {
    const remain = dist(o.ball, o.green) / YD;
    const all = o.clubs.filter((c) => c.dd && c.dd.yd > 0 && (o.first || !isDriver(c.code))).map((c) => {
      const s = evalShot(o.ball, o.green, o.path, c, o.wind, o.hz);
      if (s.partial) return { ...s, score: s.score + PARTIAL_PEN * Math.max(0, c.dd.yd - s.fwd) };
      if (s.fwd <= remain + 15 || isDriver(c.code)) return s;
      const k = remain / s.fwd, dd = c.dd.kind === "oval" && c.dd.mean && c.dd.cov ? { ...c.dd, yd: c.dd.yd * k, mean: { fwd: c.dd.mean.fwd * k, lat: c.dd.mean.lat * k }, cov: c.dd.cov.map((r) => r.map((v) => v * k * k)), partial: true } : { kind: "point", yd: c.dd.yd * k, carry: null, partial: true };
      const e = evalShot(o.ball, o.green, o.path, { code: c.code, dd }, o.wind, o.hz);
      return { ...e, partial: true, score: e.score + PARTIAL_PEN * Math.max(0, s.fwd - e.fwd) };
    });
    let cands = all.filter((s) => s.partial ? !isDriver(s.code) : s.fwd <= remain + 15);
    const full = (s) => o.clubs.find((c) => c.code === s.code).dd.yd;
    const parts = cands.filter((s) => s.partial).sort((a, b) => full(a) - full(b));
    if (parts.length > 1) cands = cands.filter((s) => !s.partial || s === parts[0]);
    if (!cands.length) return null;
    const best = [...cands].sort((a, b) => a.score - b.score || b.fwd - a.fwd)[0];
    const longer = cands.filter((s) => s.fwd > best.fwd + 3 && s.risk_pct > best.risk_pct).sort((a, b) => b.fwd - a.fwd)[0];
    const shorter = cands.filter((s) => s.fwd < best.fwd - 3 && s.risk_pct > best.risk_pct).sort((a, b) => b.fwd - a.fwd)[0];
    let type, text;
    if (longer) {
      type = "layup";
      text = `Con ${longer.code}, ${longer.risk[0].pct}% cae en ${KIND_ES[longer.risk[0].kind] ?? longer.risk[0].kind}: te qued\xE1s antes con ${best.code}.`;
    } else if (shorter) {
      type = "carry";
      text = `${best.code} pasa ${KIND_ES[shorter.risk[0].kind] ?? shorter.risk[0].kind} (con ${shorter.code} cae adentro).`;
    } else if (best.risk_pct > 0) {
      type = "riesgo";
      text = `Ojo: ${best.risk[0].pct}% de la ca\xEDda toca ${KIND_ES[best.risk[0].kind] ?? best.risk[0].kind}.`;
    } else {
      type = "max";
      text = best.partial ? `Tiro a media distancia al green.` : `Lleg\xE1s lo m\xE1s cerca posible sin obst\xE1culos en la ca\xEDda.`;
    }
    const aim = best.aim_yd ? ` Apunt\xE1 ${Math.abs(best.aim_yd)} yd a la ${best.aim_yd < 0 ? "izquierda" : "derecha"} por el viento cruzado.` : "";
    return { ...best, reason: { type, text: text + aim }, alternatives: cands.filter((s) => s !== best).sort((a, b) => a.score - b.score).slice(0, 2).map((s) => ({ code: s.code, fwd: s.fwd, after_yd: s.after_yd, risk_pct: s.risk_pct })) };
  }

  // lib/green-guide-core.ts
  var RULES_480_PT_PER_YD = 72 * 36 / 480;
  var A6_CARD_IN = [105 / 25.4, 148.5 / 25.4];
  var polyAt = (shape, W, D) => shape.map(([u, v]) => [u * W, v * D]);
  function halfWidthAt(outline, y, side) {
    let best = 0;
    for (let i = 0; i < outline.length; i++) {
      const a = outline[i], b = outline[(i + 1) % outline.length];
      if ((a[1] - y) * (b[1] - y) > 0 || a[1] === b[1]) continue;
      const t = (y - a[1]) / (b[1] - a[1]), x = a[0] + t * (b[0] - a[0]);
      if (x * side > best) best = x * side;
    }
    return best;
  }
  function ellipse2(cx, cy, rx, ry, n = 18) {
    return Array.from({ length: n }, (_, i) => {
      const a = i / n * 2 * Math.PI;
      return [cx + rx * Math.cos(a), cy + ry * Math.sin(a)];
    });
  }
  function greenGeom(g) {
    const out = polyAt(g.shape, g.width_yd, g.depth_yd);
    const bunkers = g.bunkers.map((b) => {
      const ry = Math.max(1.6, (b.y1 - b.y0) / 2), cy2 = (b.y0 + b.y1) / 2;
      if (b.side === "L" || b.side === "R") {
        const s = b.side === "L" ? -1 : 1, hw = halfWidthAt(out, Math.min(Math.max(cy2, 0.5), g.depth_yd - 0.5), s) || g.width_yd / 2, rx2 = 2.6;
        return { ...b, poly: ellipse2(s * (hw + 1.6 + rx2), cy2, rx2, ry), label: [s * (hw + 1.6 + 2 * rx2 + 1.5), cy2] };
      }
      const rx = Math.max(2, (b.w ?? 8) / 2), cx2 = b.x ?? 0;
      return { ...b, poly: ellipse2(cx2, cy2, rx, ry), label: [cx2 + rx + 1.5, cy2] };
    });
    const cx = out.reduce((a, p) => a + p[0], 0) / out.length, cy = g.depth_yd / 2;
    const falls = g.falls.map(([u, v, dir, st]) => ({ at: [u * g.width_yd, v * g.depth_yd], dir, strength: st === 2 ? 2 : 1 }));
    const tiers = g.tiers.map((t) => ({ kind: t.kind, pts: t.pts.map(([u, v]) => [u * g.width_yd, v * g.depth_yd]) }));
    const banks = g.banks.map(([a0, a1]) => {
      const ticks = [];
      for (let a = a0; a <= a1; a += 7) {
        const r = a * Math.PI / 180, dx = Math.sin(r), dy = Math.cos(r);
        let edge = [cx, cy];
        for (let k = 0; k < 120; k++) {
          const p = [cx + dx * k * 0.5, cy + dy * k * 0.5];
          if (!inPoly2(p, out)) {
            edge = p;
            break;
          }
        }
        ticks.push([[edge[0] + dx * 0.8, edge[1] + dy * 0.8], [edge[0] + dx * 3.6, edge[1] + dy * 3.6]]);
      }
      return ticks;
    });
    const ff = g.false_front && g.false_front.yd > 0 && g.false_front.yd < g.depth_yd ? { ...g.false_front, half: [halfWidthAt(out, g.false_front.yd, -1), halfWidthAt(out, g.false_front.yd, 1)] } : null;
    const marks = (g.marks || []).filter((k) => k.yd > 0 && k.yd < g.depth_yd).map((k) => {
      const sd = k.u < 0 ? -1 : 1, hw = k.kind === "borde" ? halfWidthAt(out, k.yd, sd) : 0;
      return { ...k, at: [k.kind === "borde" && hw ? sd * hw : k.u * g.width_yd, k.yd] };
    });
    return { outline: out, bunkers, falls, tiers, banks, depth: g.depth_yd, width: g.width_yd, ob: g.ob, false_front: ff, marks };
  }
  function inPoly2(p, poly) {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i], b = poly[j];
      if (a[1] > p[1] !== b[1] > p[1] && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c;
    }
    return c;
  }
  function greenBox(G) {
    const pts = [...G.outline, ...G.bunkers.flatMap((b) => b.poly), ...G.banks.flat(2)];
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  }

  // lib/shotlog-core.ts
  var CARD_W = 841.89 / 3;
  var FID = 8;
  var LOG_H = 58;
  var ID_BITS = 16;
  var ID_CELL = 5.4;
  var ID_GAP = 1;
  var FIRST_PUTT = [{ key: "fp_lt1", label: "<1" }, { key: "fp_1_3", label: "1\u20133" }, { key: "fp_3_6", label: "3\u20136" }, { key: "fp_6p", label: "6+" }];
  function cardLayout(o) {
    const W = CARD_W, H = o.H, PAD = 16;
    const fid = { tl: [PAD + FID / 2, 15 + FID / 2], tr: [W - PAD - FID / 2, 15 + FID / 2], bl: [PAD + FID / 2, H - 15 - FID / 2], br: [W - PAD - FID / 2, H - 15 - FID / 2] };
    const idY = H - 15 - FID / 2 - ID_CELL / 2, idX0 = PAD + FID + 8;
    const id = Array.from({ length: ID_BITS + 2 }, (_, i) => ({ x: idX0 + i * (ID_CELL + ID_GAP), y: idY, w: ID_CELL, h: ID_CELL }));
    const top = H - 15 - FID - 6 - LOG_H, x0 = PAD, boxes = [], rings = [], S = 7;
    const r12 = top + 10, r2 = top + 25, r3 = top + 40;
    const clubs = (o.clubs || []).slice(0, 5);
    if (o.mode === "estrategia" && clubs.length) clubs.forEach((c, i) => boxes.push({ key: `club_${i}`, x: x0 + 52 + i * 39, y: r12 - S + 1.5, w: S, h: S, label: `${i + 1} ${c}` }));
    if (o.par !== 3) [["fw_l", "izq."], ["fw_c", "fairway"], ["fw_r", "der."]].forEach(([k, l], i) => boxes.push({ key: k, x: x0 + 34 + i * 20, y: r2 - S + 1.5, w: S, h: S, label: l }));
    boxes.push({ key: "gir", x: x0 + 112, y: r2 - S + 1.5, w: S, h: S, label: "GIR" });
    boxes.push({ key: "bunker", x: x0 + 160, y: r2 - S + 1.5, w: S, h: S, label: "Bunker" });
    boxes.push({ key: "penal", x: x0 + 208, y: r2 - S + 1.5, w: S, h: S, label: "Penal." });
    [1, 2, 3, 4].forEach((n, i) => rings.push({ key: `putts_${n}`, cx: x0 + 36 + i * 15, cy: r3 - 2.4, r: 5.2, label: n === 4 ? "4+" : String(n) }));
    FIRST_PUTT.forEach((f, i) => boxes.push({ key: f.key, x: x0 + 140 + i * 26, y: r3 - S + 1.5, w: S, h: S, label: f.label }));
    return { W, H, fid, id, boxes, rings, top, rows: { r1: r12, r2, r3, hint: top + LOG_H - 3 }, x0, clubs, mapBottom: top - 4 };
  }
  function courseHash5(club, course) {
    let h = 2166136261;
    for (const ch of `${club}|${course.toLowerCase()}`) {
      h ^= ch.charCodeAt(0);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h % 31 + 1;
  }
  var check4 = (v) => {
    let c = 11;
    for (let i = 0; i < 12; i++) if (v >> i & 1) c = (c << 1 | c >> 3) & 15 ^ i + 1 & 15;
    return c;
  };
  function encodeCardId(o) {
    const v = o.hole & 31 | (o.mode === "estrategia" ? 32 : 0) | (o.torneo ? 64 : 0) | courseHash5(o.club, o.course) << 7;
    const full = v | check4(v) << 12;
    return Array.from({ length: ID_BITS }, (_, i) => full >> i & 1);
  }
  function decodeCardId(bits) {
    if (bits.length !== ID_BITS) return null;
    const full = bits.reduce((a, b, i) => a | b << i, 0), v = full & 4095;
    if ((full >> 12 & 15) !== check4(v)) return null;
    const hole = v & 31;
    if (hole < 1 || hole > 18) return null;
    return { hole, mode: v & 32 ? "estrategia" : "cancha", torneo: !!(v & 64), course_hash: v >> 7 & 31 };
  }
  function homography(src, dst) {
    const A = [], b = [];
    for (let i = 0; i < 4; i++) {
      const [x, y] = src[i], [u, v] = dst[i];
      A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
      b.push(u);
      A.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
      b.push(v);
    }
    for (let c = 0; c < 8; c++) {
      let p = c;
      for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
      [A[c], A[p]] = [A[p], A[c]];
      [b[c], b[p]] = [b[p], b[c]];
      for (let r = 0; r < 8; r++) if (r !== c) {
        const f = A[r][c] / A[c][c];
        for (let k = c; k < 8; k++) A[r][k] -= f * A[c][k];
        b[r] -= f * b[c];
      }
    }
    return [...A.map((row, i) => b[i] / row[i]), 1];
  }
  var project = (H, x, y) => {
    const w = H[6] * x + H[7] * y + H[8];
    return [(H[0] * x + H[1] * y + H[2]) / w, (H[3] * x + H[4] * y + H[5]) / w];
  };
  function otsu(g) {
    const hist = new Array(256).fill(0);
    for (let i = 0; i < g.d.length; i += 3) hist[g.d[i]]++;
    const n = hist.reduce((a, b) => a + b, 0);
    let sum = 0;
    for (let i = 0; i < 256; i++) sum += i * hist[i];
    let sB = 0, wB = 0, best = 0, th = 128;
    for (let t = 0; t < 256; t++) {
      wB += hist[t];
      if (!wB) continue;
      const wF = n - wB;
      if (!wF) break;
      sB += t * hist[t];
      const mB = sB / wB, mF = (sum - sB) / wF, v = wB * wF * (mB - mF) ** 2;
      if (v > best) {
        best = v;
        th = t;
      }
    }
    return th;
  }
  function findSquares(g, th = otsu(g)) {
    const { w, h, d } = g, lab = new Int32Array(w * h), out = [];
    let id = 0;
    const st = [];
    for (let p = 0; p < w * h; p++) {
      if (lab[p] || d[p] > th) continue;
      id++;
      let n = 0, sx = 0, sy = 0, x0 = w, x1 = 0, y0 = h, y1 = 0;
      st.push(p);
      lab[p] = id;
      while (st.length) {
        const q = st.pop(), x = q % w, y = (q - x) / w;
        n++;
        sx += x;
        sy += y;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
        for (const r of [q - 1, q + 1, q - w, q + w]) if (r >= 0 && r < w * h && !lab[r] && d[r] <= th && Math.abs(r % w - x) <= 1) {
          lab[r] = id;
          st.push(r);
        }
      }
      const bw = x1 - x0 + 1, bh = y1 - y0 + 1, fill = n / (bw * bh);
      if (n >= 16 && fill > 0.78 && bw / bh > 0.7 && bh / bw > 0.7) out.push({ cx: sx / n, cy: sy / n, side: Math.sqrt(n), fill });
    }
    return out;
  }
  function pickFiducials(sq, w, h) {
    if (sq.length < 4) return null;
    const sides = sq.map((s) => s.side).sort((a, b) => b - a);
    let best = null;
    for (const ref of sides.slice(0, 12)) {
      const S = sq.filter((s) => s.side > ref * 0.7 && s.side < ref * 1.35);
      if (S.length < 4) continue;
      const pick = (f) => S.reduce((a, s) => f(s) < f(a) ? s : a, S[0]);
      const tl = pick((s) => s.cx + s.cy), br = pick((s) => -(s.cx + s.cy)), tr = pick((s) => -(s.cx - s.cy)), bl = pick((s) => s.cx - s.cy);
      if ((/* @__PURE__ */ new Set([tl, tr, bl, br])).size < 4) continue;
      const area = Math.abs((tr.cx - tl.cx) * (bl.cy - tl.cy) - (tr.cy - tl.cy) * (bl.cx - tl.cx));
      if (!best || area > best.area) best = { tl, tr, bl, br, area };
    }
    return best;
  }
  var meanDark = (g, H, x, y, ww, hh, inset = 0.22, paper = 230) => {
    let s = 0, n = 0;
    const N = 7;
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      const px = x + ww * (inset + (1 - 2 * inset) * (i + 0.5) / N), py = y + hh * (inset + (1 - 2 * inset) * (j + 0.5) / N);
      const [u, v] = project(H, px, py), X = Math.round(u), Y = Math.round(v);
      if (X < 0 || Y < 0 || X >= g.w || Y >= g.h) continue;
      s += Math.max(0, paper - g.d[Y * g.w + X]) / paper;
      n++;
    }
    return n ? s / n : 0;
  };
  var ringDark = (g, H, cx, cy, r0, r12, paper = 230) => {
    let s = 0, n = 0;
    for (let a = 0; a < 48; a++) for (const r of [r0, (r0 + r12) / 2, r12]) {
      const t = a / 48 * 2 * Math.PI, [u, v] = project(H, cx + r * Math.cos(t), cy + r * Math.sin(t));
      const X = Math.round(u), Y = Math.round(v);
      if (X < 0 || Y < 0 || X >= g.w || Y >= g.h) continue;
      s += Math.max(0, paper - g.d[Y * g.w + X]) / paper;
      n++;
    }
    return n ? s / n : 0;
  };
  function readCard(g, layoutFor) {
    const empty = { ok: false, id: null, H: null, marks: {}, putts: null, putts_unsure: false, first_putt: null, fairway: null, clubs_played: [] };
    const th = otsu(g), f = pickFiducials(findSquares(g, th), g.w, g.h);
    if (!f) return { ...empty, reason: "no encontramos las 4 marcas de las esquinas" };
    const paper = Math.min(250, th + (255 - th) * 0.6);
    for (const Hc of [501.73, 595.28]) {
      const L0 = cardLayout({ H: Hc, par: 4, mode: "cancha" });
      const H = homography([L0.fid.tl, L0.fid.tr, L0.fid.bl, L0.fid.br], [[f.tl.cx, f.tl.cy], [f.tr.cx, f.tr.cy], [f.bl.cx, f.bl.cy], [f.br.cx, f.br.cy]]);
      const cells = L0.id.map((c) => meanDark(g, H, c.x, c.y, c.w, c.h, 0.25, paper));
      if (cells[0] < 0.35 || cells[ID_BITS + 1] < 0.35) continue;
      const bits = cells.slice(1, ID_BITS + 1).map((v) => v > 0.35 ? 1 : 0), id = decodeCardId(bits);
      if (!id || (id.torneo ? 501.73 : 595.28) !== Hc) continue;
      const L = layoutFor(id, Hc), marks = {};
      for (const b of L.boxes) {
        const s = meanDark(g, H, b.x, b.y, b.w, b.h, 0.22, paper);
        marks[b.key] = { score: Math.round(s * 100) / 100, on: s > 0.22, unsure: s > 0.12 && s < 0.32 };
      }
      for (const r of L.rings) {
        const s = ringDark(g, H, r.cx, r.cy, r.r + 0.6, r.r + 2.6, paper);
        marks[r.key] = { score: Math.round(s * 100) / 100, on: s > 0.14, unsure: s > 0.07 && s < 0.22 };
      }
      const pOn = [1, 2, 3, 4].filter((n) => marks[`putts_${n}`]?.on), fp = FIRST_PUTT.filter((x) => marks[x.key]?.on), fw = ["fw_l", "fw_c", "fw_r"].filter((k) => marks[k]?.on);
      return {
        ok: true,
        id,
        H,
        marks,
        putts: pOn.length === 1 ? pOn[0] : null,
        putts_unsure: pOn.length !== 1 || [1, 2, 3, 4].some((n) => marks[`putts_${n}`]?.unsure),
        first_putt: fp.length === 1 ? fp[0].key : null,
        fairway: fw.length === 1 ? { fw_l: "izq", fw_c: "centro", fw_r: "der" }[fw[0]] : null,
        clubs_played: L.boxes.filter((b) => b.key.startsWith("club_") && marks[b.key].on).map((b) => +b.key.slice(5))
      };
    }
    return { ...empty, reason: "no pudimos leer el c\xF3digo de la tarjeta" };
  }
  var LIES = ["tee", "fairway", "rough", "bunker", "agua", "bosque", "green"];
  var DEVICES = ["gps", "watch", "garmin"];
  function cleanLogHole(h) {
    const hole = Number(h?.hole);
    if (!Number.isInteger(hole) || hole < 1 || hole > 18) throw new Error("Hoyo inv\xE1lido");
    if (h?.confirmed !== true) throw new Error(`Confirm\xE1 el hoyo ${hole} antes de guardarlo`);
    const tri = (v) => v === true ? true : v === false ? false : null;
    const putts = h.putts == null ? null : Number(h.putts);
    if (putts != null && (!Number.isInteger(putts) || putts < 0 || putts > 6)) throw new Error(`Putts inv\xE1lidos en el hoyo ${hole}`);
    const fp = h.first_putt == null ? null : String(h.first_putt);
    if (fp && !FIRST_PUTT.some((x) => x.key === fp)) throw new Error(`1er putt inv\xE1lido en el hoyo ${hole}`);
    const clubs = (Array.isArray(h.clubs) ? h.clubs : []).slice(0, 10).map((c) => c == null || c === "" ? null : String(c).slice(0, 8));
    const marks = (Array.isArray(h.marks) ? h.marks : []).slice(0, 10).map((m, i) => ({
      n: Number(m.n) || i + 1,
      x: Math.max(0, Math.min(1, Number(m.x) || 0)),
      y: Math.max(0, Math.min(1, Number(m.y) || 0)),
      yd_est: m.yd_est == null || !Number.isFinite(Number(m.yd_est)) ? null : Math.max(0, Math.min(700, Math.round(Number(m.yd_est)))),
      // t204u: GPS/wearable positions (where the ball finished) with their lie from the course map
      ...Array.isArray(m.ll) && m.ll.length === 2 && m.ll.every((v) => Number.isFinite(Number(v)) && Math.abs(Number(v)) <= 180) ? { ll: [Math.round(Number(m.ll[0]) * 1e7) / 1e7, Math.round(Number(m.ll[1]) * 1e7) / 1e7] } : {},
      ...LIES.includes(m.lie) ? { lie: m.lie } : {},
      ...["tap", "swing", "parada", "manual"].includes(m.from) ? { from: m.from } : {}
    }));
    return {
      hole,
      clubs,
      fairway: ["izq", "centro", "der"].includes(h.fairway) ? h.fairway : null,
      gir: tri(h.gir),
      bunker: tri(h.bunker),
      penalty: tri(h.penalty),
      putts,
      first_putt: fp,
      marks,
      read: h.read === "foto" ? "foto" : h.read === "gps" ? "gps" : "manual",
      ...DEVICES.includes(h.device) ? { device: h.device } : {},
      confirmed: true
    };
  }
  function clubEstimates(holes) {
    const by = {};
    for (const h of holes) {
      let prev = 0;
      h.marks.slice().sort((a, b) => a.n - b.n).forEach((m, i) => {
        const c = h.clubs[i];
        if (m.yd_est == null) return;
        const d = m.yd_est - prev;
        prev = m.yd_est;
        if (c && d > 20) (by[c] ||= []).push(d);
      });
    }
    return Object.entries(by).map(([club, v]) => {
      const s = v.slice().sort((a, b) => a - b);
      return { club, n: s.length, median_yd: s[Math.floor(s.length / 2)], estimate: true };
    });
  }
  function logStats(holes) {
    const fw = holes.filter((h) => h.fairway), gir = holes.filter((h) => h.gir != null), pu = holes.filter((h) => h.putts != null);
    return {
      holes: holes.length,
      fairway_pct: fw.length ? Math.round(100 * fw.filter((h) => h.fairway === "centro").length / fw.length) : null,
      fairway_miss: { izq: fw.filter((h) => h.fairway === "izq").length, der: fw.filter((h) => h.fairway === "der").length },
      gir_pct: gir.length ? Math.round(100 * gir.filter((h) => h.gir).length / gir.length) : null,
      putts_avg: pu.length ? Math.round(10 * pu.reduce((a, h) => a + h.putts, 0) / pu.length) / 10 : null,
      bunkers: holes.filter((h) => h.bunker).length,
      penalties: holes.filter((h) => h.penalty).length,
      lies: holes.flatMap((h) => h.marks).reduce((a, m) => {
        if (m.lie) a[m.lie] = (a[m.lie] || 0) + 1;
        return a;
      }, {}),
      // t205u: where the ball finished
      tee_lies: holes.filter((h) => h.marks[0]?.lie && h.fairway != null).reduce((a, h) => {
        a[h.marks[0].lie] = (a[h.marks[0].lie] || 0) + 1;
        return a;
      }, {})
    };
  }

  // lib/autoshot-core.ts
  var AUTO_DEFAULTS = { radiusM: 9, minDwellS: 12, maxDwellS: 300, maxAccM: 30, corridorM: 55, teeBufM: 6, greenBufM: 0.5, pathBufM: 3.5, mergeM: 22, mergeS: 120, pauseLineM: 9, pauseMaxS: 45 };
  var R_E = 63710088e-1;
  var RAD = Math.PI / 180;
  var YD_M = 0.9144;
  function asMeters(a, b) {
    const x = (b[0] - a[0]) * RAD * Math.cos((a[1] + b[1]) / 2 * RAD) * R_E, y = (b[1] - a[1]) * RAD * R_E;
    return Math.hypot(x, y);
  }
  function toXY(o, p) {
    return [(p[0] - o[0]) * RAD * Math.cos(o[1] * RAD) * R_E, (p[1] - o[1]) * RAD * R_E];
  }
  function asInPoly(p, poly) {
    if (!poly || poly.length < 3) return false;
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if (yi > p[1] !== yj > p[1] && p[0] < (xj - xi) * (p[1] - yi) / (yj - yi) + xi) c = !c;
    }
    return c;
  }
  function asDistToLine(p, line, closed = false) {
    if (!line?.length) return Infinity;
    const o = p, P = line.map((q) => toXY(o, q));
    if (closed) P.push(P[0]);
    let best = Infinity;
    if (P.length === 1) return Math.hypot(P[0][0], P[0][1]);
    for (let i = 0; i < P.length - 1; i++) {
      const [ax, ay] = P[i], [bx, by] = P[i + 1], vx = bx - ax, vy = by - ay, L2 = vx * vx + vy * vy || 1e-9;
      const t = Math.max(0, Math.min(1, (-ax * vx - ay * vy) / L2));
      best = Math.min(best, Math.hypot(ax + vx * t, ay + vy * t));
    }
    return best;
  }
  var near = (p, polys, buf) => (polys || []).some((g) => asInPoly(p, g) || asDistToLine(p, g, true) <= buf);
  function asLateral(p, line) {
    if (!line || line.length < 2) return 0;
    const o = line[0], P = line.map((q2) => toXY(o, q2)), q = toXY(o, p);
    let best = { d: Infinity, s: 0 };
    for (let i = 0; i < P.length - 1; i++) {
      const [ax, ay] = P[i], [bx, by] = P[i + 1], vx = bx - ax, vy = by - ay, L2 = vx * vx + vy * vy || 1e-9;
      const t = Math.max(0, Math.min(1, ((q[0] - ax) * vx + (q[1] - ay) * vy) / L2)), dx = q[0] - (ax + vx * t), dy = q[1] - (ay + vy * t), d = Math.hypot(dx, dy);
      if (d < best.d) best = { d, s: Math.sign(vx * dy - vy * dx) * -1 * d };
    }
    return best.s;
  }
  function classifyLie(p, g) {
    if (g.green && asInPoly(p, g.green)) return "green";
    if ((g.bunkers || []).some((b) => asInPoly(p, b))) return "bunker";
    if ((g.water || []).some((b) => asInPoly(p, b))) return "agua";
    if ((g.tees || []).some((b) => asInPoly(p, b))) return "tee";
    if ((g.fairways || []).some((b) => asInPoly(p, b))) return "fairway";
    if ((g.woods || []).some((b) => asInPoly(p, b))) return "bosque";
    return "rough";
  }
  function detectStops(track, o = {}) {
    const C = { ...AUTO_DEFAULTS, ...o }, pts = track.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng) && (p.acc == null || p.acc <= C.maxAccM)).sort((a, b) => a.t - b.t), out = [];
    let i = 0;
    while (i < pts.length) {
      let j = i;
      const A = [pts[i].lng, pts[i].lat];
      while (j + 1 < pts.length && pts[j + 1].hole === pts[i].hole && asMeters(A, [pts[j + 1].lng, pts[j + 1].lat]) <= C.radiusM && pts[j + 1].t - pts[j].t < 6e4) j++;
      const dwell = (pts[j].t - pts[i].t) / 1e3;
      if (dwell >= C.minDwellS) {
        if (dwell <= C.maxDwellS) {
          const xs = pts.slice(i, j + 1).map((p) => p.lng).sort((a, b) => a - b), ys = pts.slice(i, j + 1).map((p) => p.lat).sort((a, b) => a - b), m = xs.length >> 1;
          out.push({ t0: pts[i].t, t1: pts[j].t, ll: [xs[m], ys[m]], n: j - i + 1, dwell_s: Math.round(dwell), hole: pts[i].hole, src: pts[i].src || "gps" });
        }
        i = j + 1;
      } else i++;
    }
    return out;
  }
  function autoHole(o, opt = {}) {
    const C = { ...AUTO_DEFAULTS, ...opt }, g = o.geo, tr = o.track.filter((p) => p.hole == null || p.hole === o.hole).sort((a, b) => a.t - b.t);
    const dropped = { tee: 0, green: 0, path: 0, fuera: 0, pausa: 0 };
    const inGreen = (p) => !!g.green && (asInPoly(p, g.green) || asDistToLine(p, g.green, true) <= C.greenBufM);
    const greenIdx = tr.findIndex((p) => inGreen([p.lng, p.lat])), greenT = greenIdx >= 0 ? tr[greenIdx].t : Infinity;
    const green_in = greenIdx >= 0 ? [tr[greenIdx].lng, tr[greenIdx].lat] : null;
    const ev = (o.events || []).filter((e) => (e.hole == null || e.hole === o.hole) && e.lat != null && e.lng != null && e.t <= greenT).sort((a, b) => a.t - b.t);
    const strong = ev.map((e, k) => ({ ll: [e.lng, e.lat], t: e.t, from: e.kind === "tap" ? "tap" : "swing", src: e.src || "gps", tapIdx: e.kind === "tap" ? k : void 0 }));
    const stops = detectStops(tr, C).filter((s) => s.t0 < greenT), weak = [];
    for (const s of stops) {
      if (near(s.ll, g.tees, C.teeBufM)) {
        dropped.tee++;
        continue;
      }
      if (inGreen(s.ll)) {
        dropped.green++;
        continue;
      }
      if ((g.paths || []).some((pl) => asDistToLine(s.ll, pl) <= C.pathBufM)) {
        dropped.path++;
        continue;
      }
      const inHazard = near(s.ll, g.bunkers, 2) || near(s.ll, g.water, 4) || near(s.ll, g.woods, 4) || near(s.ll, g.fairways, 2);
      if (g.line?.length && asDistToLine(s.ll, g.line) > C.corridorM && !inHazard) {
        dropped.fuera++;
        continue;
      }
      if (strong.some((c) => asMeters(c.ll, s.ll) <= C.mergeM && Math.abs(c.t - s.t0) <= C.mergeS * 1e3)) continue;
      weak.push({ ll: s.ll, t: s.t0, from: "parada", dwell_s: s.dwell_s, src: s.src });
    }
    let cands = [...strong, ...weak].sort((a, b) => a.t - b.t);
    const teeLL = (() => {
      const t0 = ev.find((e) => e.kind === "tap");
      if (t0 && near([t0.lng, t0.lat], g.tees, C.teeBufM)) return null;
      const first = tr[0];
      if (g.teeCenters?.length) {
        if (!first) return g.teeCenters[0];
        return g.teeCenters.reduce((a, b) => asMeters(b, [first.lng, first.lat]) < asMeters(a, [first.lng, first.lat]) ? b : a);
      }
      return first ? [first.lng, first.lat] : null;
    })();
    const end = green_in ?? g.greenCenter ?? null;
    for (let changed = true; changed; ) {
      changed = false;
      for (let k = 0; k < cands.length; k++) {
        const c = cands[k];
        if (c.from !== "parada" || (c.dwell_s ?? 0) > C.pauseMaxS) continue;
        const prev = k ? cands[k - 1].ll : teeLL, next = k + 1 < cands.length ? cands[k + 1].ll : null;
        if (!prev || !next) continue;
        if (asDistToLine(c.ll, [prev, next]) <= Math.max(C.pauseLineM, 0.12 * asMeters(prev, next)) && asMeters(prev, c.ll) > 15 && asMeters(c.ll, next) > 25) {
          cands.splice(k, 1);
          dropped.pausa++;
          changed = true;
          break;
        }
      }
    }
    const pos = [];
    if (teeLL) pos.push({ ll: teeLL, t: tr[0]?.t ?? (cands[0]?.t ?? 0), from: "tee", src: tr[0]?.src || "gps" });
    pos.push(...cands);
    const bag = (o.bag || []).filter((b) => b.yd != null && !/^(pt|putter)$/i.test(b.code));
    const pickBag = (yd) => bag.length ? bag.reduce((a, b) => Math.abs(b.yd - yd) < Math.abs(a.yd - yd) ? b : a).code : null;
    const shots = pos.map((c, k) => {
      const to = k + 1 < pos.length ? pos[k + 1].ll : end, yd = to ? Math.round(asMeters(c.ll, to) / YD_M) : null;
      const lie = c.from === "tee" ? "tee" : classifyLie(c.ll, g);
      const tapClub = c.tapIdx != null ? o.tapClubs?.[c.tapIdx] ?? null : null, plan = o.planClubs?.[k] ?? null;
      const club = tapClub || plan || (yd != null ? pickBag(yd) : null);
      return { n: k + 1, ll: c.ll, lie, from: c.from, t: c.t ?? null, yd_est: yd, club, club_from: tapClub ? "ya_pegue" : plan ? "plan" : club ? "bolsa" : null, dwell_s: c.dwell_s, src: c.src };
    });
    return { hole: o.hole, par: o.par, shots, green_in, dropped, ...holeOutcome(o.par, shots, g, !!green_in), estimate: true };
  }
  function holeOutcome(par, shots, g, reachedGreen) {
    let fairway = null, fw_lie = null;
    if (par != null && par >= 4 && shots.length >= 2) {
      const p = shots[1].ll;
      fw_lie = shots[1].lie;
      fairway = fw_lie === "fairway" || fw_lie === "green" ? "centro" : asLateral(p, g.line) < 0 ? "izq" : "der";
    }
    const gir = par != null && reachedGreen ? shots.length <= par - 2 : null;
    return { fairway, fw_lie, gir, bunker: shots.some((s) => s.lie === "bunker"), penalty: shots.some((s) => s.lie === "agua") };
  }
  function relayHole(h, g) {
    const end = h.green_in ?? g.greenCenter ?? null;
    const shots = h.shots.map((s, k) => ({ ...s, n: k + 1, lie: k === 0 && s.from === "tee" ? "tee" : classifyLie(s.ll, g) })).map((s, k, a) => {
      const to = k + 1 < a.length ? a[k + 1].ll : end;
      return { ...s, yd_est: to ? Math.round(asMeters(s.ll, to) / YD_M) : null };
    });
    return { ...h, shots, ...holeOutcome(h.par, shots, g, !!h.green_in) };
  }
  function autoToLog(h, putts, g) {
    const end = h.green_in ?? g?.greenCenter ?? null;
    let acc = 0;
    const marks = h.shots.map((s, k) => {
      const ll = k + 1 < h.shots.length ? h.shots[k + 1].ll : end;
      acc += s.yd_est ?? 0;
      return { n: k + 1, x: 0, y: 0, yd_est: s.yd_est == null ? null : acc, ...ll ? { ll } : {}, lie: k + 1 < h.shots.length ? h.shots[k + 1].lie : end ? "green" : void 0, from: h.shots[k + 1]?.from ?? "parada" };
    });
    return {
      hole: h.hole,
      confirmed: true,
      read: "gps",
      clubs: h.shots.map((s) => s.club),
      fairway: h.par === 3 ? null : h.fairway,
      gir: h.gir,
      bunker: h.bunker,
      penalty: h.penalty,
      putts,
      first_putt: null,
      device: h.shots.find((s) => s.src !== "gps")?.src ?? "gps",
      marks
    };
  }
  function geoFromMap(h) {
    const polys = (a) => (a || []).map((x) => x?.polygon).filter((p) => Array.isArray(p) && p.length >= 3);
    return {
      tees: polys(h?.tees),
      teeCenters: (h?.tees || []).map((t) => t.center).filter(Boolean),
      green: h?.green?.polygon || null,
      greenCenter: h?.green?.center || null,
      line: h?.line || [],
      fairways: polys(h?.fairways),
      bunkers: polys(h?.bunkers),
      water: polys(h?.water),
      woods: (h?.trees?.wood_polygons || []).filter((p) => Array.isArray(p) && p.length >= 3),
      paths: h?.paths || []
    };
  }
  return __toCommonJS(plan_browser_exports);
})();
