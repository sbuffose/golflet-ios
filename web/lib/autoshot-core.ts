/** t204u/t205u: automatic shot detection from a position track (phone GPS today; Apple Watch / Garmin later through the SAME input).
 *  Pure functions, no network: runs on the phone (bundled in public/plan-core.js) and in tests. Results are ESTIMATES and are never saved
 *  until the player confirms the hole (lib/shotlog-core cleanLogHole). API_v5 §67.
 *
 *  Input contract (wearable-ready): every sample says which device produced it.
 *    TrackPt  { t (ms), lat, lng, acc? (m), hole?, src: "gps" | "watch" | "garmin" }
 *    ShotEvt  { t, lat?, lng?, hole?, kind: "tap" (Ya pegué) | "swing" (wrist-motion swing, watch/Garmin), src }
 *  A tap or swing is strong evidence; a stop (player stationary for a while) is weaker evidence and is filtered. */
export type AutoSource = "gps" | "watch" | "garmin";
export type TrackPt = { t: number; lat: number; lng: number; acc?: number; hole?: number; src?: AutoSource };
export type ShotEvt = { t: number; lat?: number; lng?: number; hole?: number; kind: "tap" | "swing"; src?: AutoSource };
export type Lie = "tee" | "fairway" | "rough" | "bunker" | "agua" | "bosque" | "green";
export type LL = [number, number];   // [lng, lat]
export type AutoHoleGeo = { tees?: LL[][]; teeCenters?: LL[]; green?: LL[] | null; greenCenter?: LL | null; line?: LL[]; fairways?: LL[][]; bunkers?: LL[][]; water?: LL[][]; woods?: LL[][];
  paths?: LL[][] /* cart paths (polylines), when the map has them */ };
export const AUTO_DEFAULTS = { radiusM: 9, minDwellS: 12, maxDwellS: 300, maxAccM: 30, corridorM: 55, teeBufM: 6, greenBufM: 0.5, pathBufM: 3.5, mergeM: 22, mergeS: 120, pauseLineM: 9, pauseMaxS: 45 };
const R_E = 6371008.8, RAD = Math.PI / 180, YD_M = 0.9144;

/* ---------- geometry (local metres) ---------- */
export function asMeters(a: LL, b: LL) { const x = (b[0] - a[0]) * RAD * Math.cos(((a[1] + b[1]) / 2) * RAD) * R_E, y = (b[1] - a[1]) * RAD * R_E; return Math.hypot(x, y); }
function toXY(o: LL, p: LL): [number, number] { return [(p[0] - o[0]) * RAD * Math.cos(o[1] * RAD) * R_E, (p[1] - o[1]) * RAD * R_E]; }
export function asInPoly(p: LL, poly: LL[] | null | undefined) {
  if (!poly || poly.length < 3) return false; let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < (xj - xi) * (p[1] - yi) / (yj - yi) + xi) c = !c; }
  return c;
}
/** Distance (m) from p to a polyline (or polygon outline when closed). */
export function asDistToLine(p: LL, line: LL[] | null | undefined, closed = false) {
  if (!line?.length) return Infinity; const o = p, P = line.map(q => toXY(o, q)); if (closed) P.push(P[0]); let best = Infinity;
  if (P.length === 1) return Math.hypot(P[0][0], P[0][1]);
  for (let i = 0; i < P.length - 1; i++) { const [ax, ay] = P[i], [bx, by] = P[i + 1], vx = bx - ax, vy = by - ay, L2 = vx * vx + vy * vy || 1e-9;
    const t = Math.max(0, Math.min(1, (-ax * vx - ay * vy) / L2)); best = Math.min(best, Math.hypot(ax + vx * t, ay + vy * t)); }
  return best;
}
const near = (p: LL, polys: LL[][] | undefined, buf: number) => (polys || []).some(g => asInPoly(p, g) || asDistToLine(p, g, true) <= buf);
/** Signed lateral offset (m) of p from the hole line: < 0 left, > 0 right (looking from the tee towards the green). */
export function asLateral(p: LL, line: LL[] | undefined) {
  if (!line || line.length < 2) return 0; const o = line[0], P = line.map(q => toXY(o, q)), q = toXY(o, p); let best = { d: Infinity, s: 0 };
  for (let i = 0; i < P.length - 1; i++) { const [ax, ay] = P[i], [bx, by] = P[i + 1], vx = bx - ax, vy = by - ay, L2 = vx * vx + vy * vy || 1e-9;
    const t = Math.max(0, Math.min(1, ((q[0] - ax) * vx + (q[1] - ay) * vy) / L2)), dx = q[0] - (ax + vx * t), dy = q[1] - (ay + vy * t), d = Math.hypot(dx, dy);
    if (d < best.d) best = { d, s: Math.sign(vx * dy - vy * dx) * -1 * d }; }   // cross > 0 → left of the direction of play
  return best.s;
}

/* ---------- lie (where the ball is) ---------- */
export function classifyLie(p: LL, g: AutoHoleGeo): Lie {
  if (g.green && asInPoly(p, g.green)) return "green";
  if ((g.bunkers || []).some(b => asInPoly(p, b))) return "bunker";
  if ((g.water || []).some(b => asInPoly(p, b))) return "agua";
  if ((g.tees || []).some(b => asInPoly(p, b))) return "tee";
  if ((g.fairways || []).some(b => asInPoly(p, b))) return "fairway";
  if ((g.woods || []).some(b => asInPoly(p, b))) return "bosque";
  return "rough";
}

/* ---------- stops ---------- */
export type Stop = { t0: number; t1: number; ll: LL; n: number; dwell_s: number; hole?: number; src: AutoSource };
/** Places where the player stood still for minDwellS..maxDwellS within radiusM (noisy fixes above maxAccM are dropped). */
export function detectStops(track: TrackPt[], o: Partial<typeof AUTO_DEFAULTS> = {}): Stop[] {
  const C = { ...AUTO_DEFAULTS, ...o }, pts = track.filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng) && (p.acc == null || p.acc <= C.maxAccM)).sort((a, b) => a.t - b.t), out: Stop[] = [];
  // anchored window: every fix stays within radiusM of the first one (a walking player leaves the circle in a few seconds); slide 1 fix when no stop
  let i = 0;
  while (i < pts.length) {
    let j = i; const A: LL = [pts[i].lng, pts[i].lat];
    while (j + 1 < pts.length && pts[j + 1].hole === pts[i].hole && asMeters(A, [pts[j + 1].lng, pts[j + 1].lat]) <= C.radiusM && pts[j + 1].t - pts[j].t < 60e3) j++;
    const dwell = (pts[j].t - pts[i].t) / 1000;
    if (dwell >= C.minDwellS) {
      if (dwell <= C.maxDwellS) {
        const xs = pts.slice(i, j + 1).map(p => p.lng).sort((a, b) => a - b), ys = pts.slice(i, j + 1).map(p => p.lat).sort((a, b) => a - b), m = xs.length >> 1;
        out.push({ t0: pts[i].t, t1: pts[j].t, ll: [xs[m], ys[m]], n: j - i + 1, dwell_s: Math.round(dwell), hole: pts[i].hole, src: pts[i].src || "gps" });
      }
      i = j + 1;
    } else i++;
  }
  return out;
}

/* ---------- one hole ---------- */
export type AutoShot = { n: number; ll: LL; lie: Lie; from: "tee" | "tap" | "swing" | "parada"; t: number | null; yd_est: number | null; club: string | null; club_from: "plan" | "bolsa" | "ya_pegue" | null; dwell_s?: number; src: AutoSource };
export type AutoHole = { hole: number; par: number | null; shots: AutoShot[]; green_in: LL | null; dropped: { tee: number; green: number; path: number; fuera: number; pausa: number };
  fairway: "izq" | "centro" | "der" | null; fw_lie: Lie | null; gir: boolean | null; bunker: boolean; penalty: boolean; estimate: true };
export type BagClub = { code: string; yd: number | null };
/** Combines stops + taps + swings on one hole into an ordered list of shot positions (where each shot was PLAYED FROM), with lie, estimated
 *  distance (to the next position, the last one to the first fix inside the green) and a probable club (plan order, else the bag). */
export function autoHole(o: { hole: number; par: number | null; geo: AutoHoleGeo; track: TrackPt[]; events?: ShotEvt[]; planClubs?: string[]; bag?: BagClub[]; tapClubs?: (string | null)[] }, opt: Partial<typeof AUTO_DEFAULTS> = {}): AutoHole {
  const C = { ...AUTO_DEFAULTS, ...opt }, g = o.geo, tr = o.track.filter(p => p.hole == null || p.hole === o.hole).sort((a, b) => a.t - b.t);
  const dropped = { tee: 0, green: 0, path: 0, fuera: 0, pausa: 0 };
  const inGreen = (p: LL) => !!g.green && (asInPoly(p, g.green) || asDistToLine(p, g.green, true) <= C.greenBufM);
  const greenIdx = tr.findIndex(p => inGreen([p.lng, p.lat] as LL)), greenT = greenIdx >= 0 ? tr[greenIdx].t : Infinity;
  const green_in: LL | null = greenIdx >= 0 ? [tr[greenIdx].lng, tr[greenIdx].lat] : null;
  const ev = (o.events || []).filter(e => (e.hole == null || e.hole === o.hole) && e.lat != null && e.lng != null && e.t <= greenT).sort((a, b) => a.t - b.t);
  // candidate positions: strong (tap/swing) + stops that pass the filters
  type Cand = { ll: LL; t: number; from: AutoShot["from"]; dwell_s?: number; src: AutoSource; tapIdx?: number };
  const strong: Cand[] = ev.map((e, k) => ({ ll: [e.lng!, e.lat!] as LL, t: e.t, from: e.kind === "tap" ? "tap" as const : "swing" as const, src: e.src || "gps", tapIdx: e.kind === "tap" ? k : undefined }));
  const stops = detectStops(tr, C).filter(s => s.t0 < greenT), weak: Cand[] = [];
  for (const s of stops) {
    if (near(s.ll, g.tees, C.teeBufM)) { dropped.tee++; continue; }
    if (inGreen(s.ll)) { dropped.green++; continue; }
    if ((g.paths || []).some(pl => asDistToLine(s.ll, pl) <= C.pathBufM)) { dropped.path++; continue; }
    const inHazard = near(s.ll, g.bunkers, 2) || near(s.ll, g.water, 4) || near(s.ll, g.woods, 4) || near(s.ll, g.fairways, 2);
    if (g.line?.length && asDistToLine(s.ll, g.line) > C.corridorM && !inHazard) { dropped.fuera++; continue; }
    if (strong.some(c => asMeters(c.ll, s.ll) <= C.mergeM && Math.abs(c.t - s.t0) <= C.mergeS * 1000)) continue;   // same shot as a tap/swing
    weak.push({ ll: s.ll, t: s.t0, from: "parada", dwell_s: s.dwell_s, src: s.src });
  }
  let cands = [...strong, ...weak].sort((a, b) => a.t - b.t);
  // walking pauses: a short stop lying on the straight walk between the previous and the next position, still far from the next one
  const teeLL: LL | null = (() => { const t0 = ev.find(e => e.kind === "tap"); if (t0 && near([t0.lng!, t0.lat!], g.tees, C.teeBufM)) return null;
    const first = tr[0]; if (g.teeCenters?.length) { if (!first) return g.teeCenters[0]; return g.teeCenters.reduce((a, b) => asMeters(b, [first.lng, first.lat]) < asMeters(a, [first.lng, first.lat]) ? b : a); }
    return first ? [first.lng, first.lat] : null; })();
  const end: LL | null = green_in ?? g.greenCenter ?? null;
  for (let changed = true; changed;) { changed = false;
    for (let k = 0; k < cands.length; k++) { const c = cands[k]; if (c.from !== "parada" || (c.dwell_s ?? 0) > C.pauseMaxS) continue;
      const prev = k ? cands[k - 1].ll : teeLL, next = k + 1 < cands.length ? cands[k + 1].ll : null; if (!prev || !next) continue;
      if (asDistToLine(c.ll, [prev, next]) <= Math.max(C.pauseLineM, 0.12 * asMeters(prev, next)) && asMeters(prev, c.ll) > 15 && asMeters(c.ll, next) > 25) { cands.splice(k, 1); dropped.pausa++; changed = true; break; } } }
  const pos: Cand[] = []; if (teeLL) pos.push({ ll: teeLL, t: tr[0]?.t ?? (cands[0]?.t ?? 0), from: "tee", src: (tr[0]?.src || "gps") as AutoSource });
  pos.push(...cands);
  const bag = (o.bag || []).filter(b => b.yd != null && !/^(pt|putter)$/i.test(b.code));
  const pickBag = (yd: number) => bag.length ? bag.reduce((a, b) => Math.abs(b.yd! - yd) < Math.abs(a.yd! - yd) ? b : a).code : null;
  const shots: AutoShot[] = pos.map((c, k) => {
    const to = k + 1 < pos.length ? pos[k + 1].ll : end, yd = to ? Math.round(asMeters(c.ll, to) / YD_M) : null;
    const lie: Lie = c.from === "tee" ? "tee" : classifyLie(c.ll, g);
    const tapClub = c.tapIdx != null ? o.tapClubs?.[c.tapIdx] ?? null : null, plan = o.planClubs?.[k] ?? null;
    const club = tapClub || plan || (yd != null ? pickBag(yd) : null);
    return { n: k + 1, ll: c.ll, lie, from: c.from, t: c.t ?? null, yd_est: yd, club, club_from: tapClub ? "ya_pegue" : plan ? "plan" : club ? "bolsa" : null, dwell_s: c.dwell_s, src: c.src };
  });
  return { hole: o.hole, par: o.par, shots, green_in, dropped, ...holeOutcome(o.par, shots, g, !!green_in), estimate: true };
}
/** Fairway hit / miss side (par 4–5: where the tee shot finished), GIR estimate, bunker and water. Recomputed after every drag. */
export function holeOutcome(par: number | null, shots: AutoShot[], g: AutoHoleGeo, reachedGreen: boolean) {
  let fairway: AutoHole["fairway"] = null, fw_lie: Lie | null = null;
  if (par != null && par >= 4 && shots.length >= 2) { const p = shots[1].ll; fw_lie = shots[1].lie;
    fairway = fw_lie === "fairway" || fw_lie === "green" ? "centro" : asLateral(p, g.line) < 0 ? "izq" : "der"; }
  const gir = par != null && reachedGreen ? shots.length <= par - 2 : null;
  return { fairway, fw_lie, gir, bunker: shots.some(s => s.lie === "bunker"), penalty: shots.some(s => s.lie === "agua") };
}
/** Recompute lies, distances and outcome after the player drags / adds / deletes positions in the review. */
export function relayHole(h: AutoHole, g: AutoHoleGeo): AutoHole {
  const end = h.green_in ?? g.greenCenter ?? null;
  const shots = h.shots.map((s, k) => ({ ...s, n: k + 1, lie: (k === 0 && s.from === "tee" ? "tee" : classifyLie(s.ll, g)) as Lie }))
    .map((s, k, a) => { const to = k + 1 < a.length ? a[k + 1].ll : end; return { ...s, yd_est: to ? Math.round(asMeters(s.ll, to) / YD_M) : null }; });
  return { ...h, shots, ...holeOutcome(h.par, shots, g, !!h.green_in) };
}
/** Confirmed hole → shot_log LogHole body (lib/shotlog-core). marks[k] = where shot k FINISHED (next position, or the first fix on the green),
 *  yd_est = cumulative straight-line yards from the tee (so mark k − mark k−1 = shot k). Lies from the course map; all distances are estimates. */
export function autoToLog(h: AutoHole, putts: number | null, g?: AutoHoleGeo) {
  const end = h.green_in ?? g?.greenCenter ?? null; let acc = 0;
  const marks = h.shots.map((s, k) => { const ll = k + 1 < h.shots.length ? h.shots[k + 1].ll : end; acc += s.yd_est ?? 0;
    return { n: k + 1, x: 0, y: 0, yd_est: s.yd_est == null ? null : acc, ...(ll ? { ll } : {}), lie: k + 1 < h.shots.length ? h.shots[k + 1].lie : end ? "green" : undefined, from: h.shots[k + 1]?.from ?? "parada" }; });
  return { hole: h.hole, confirmed: true as const, read: "gps" as const, clubs: h.shots.map(s => s.club), fairway: h.par === 3 ? null : h.fairway, gir: h.gir, bunker: h.bunker, penalty: h.penalty,
    putts, first_putt: null, device: h.shots.find(s => s.src !== "gps")?.src ?? "gps", marks };
}
/** Course map hole (lib/course-map) → detection geometry. */
export function geoFromMap(h: any): AutoHoleGeo {
  const polys = (a: any[] | undefined) => (a || []).map(x => x?.polygon).filter((p: any) => Array.isArray(p) && p.length >= 3);
  return { tees: polys(h?.tees), teeCenters: (h?.tees || []).map((t: any) => t.center).filter(Boolean), green: h?.green?.polygon || null, greenCenter: h?.green?.center || null,
    line: h?.line || [], fairways: polys(h?.fairways), bunkers: polys(h?.bunkers), water: polys(h?.water), woods: (h?.trees?.wood_polygons || []).filter((p: any) => Array.isArray(p) && p.length >= 3), paths: h?.paths || [] };
}
