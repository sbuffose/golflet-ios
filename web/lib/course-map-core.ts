/** Course map helpers (t171u). Pure: bearings, magnetic ↔ true, wind relative to a hole, Rioplatense labels. */

export type LngLat = [number, number];

/** Initial true bearing (0–360, clockwise from true north) from a to b. */
export function bearingTrue(a: LngLat, b: LngLat): number {
  const [l1, p1] = [a[0] * Math.PI / 180, a[1] * Math.PI / 180], [l2, p2] = [b[0] * Math.PI / 180, b[1] * Math.PI / 180];
  const y = Math.sin(l2 - l1) * Math.cos(p2), x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(l2 - l1);
  return norm360(Math.atan2(y, x) * 180 / Math.PI);
}
export const norm360 = (d: number) => ((d % 360) + 360) % 360;
/** Declination D (east +, west −): magnetic = true − D. Buenos Aires ≈ −10.2° (WMM-2025, 2026). */
export const toMagnetic = (trueDeg: number, declination: number) => norm360(trueDeg - declination);
export const toTrue = (magDeg: number, declination: number) => norm360(magDeg + declination);

const PTS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSO", "SO", "OSO", "O", "ONO", "NO", "NNO"];
/** 16-point compass label in Spanish (O = oeste). */
export const compass16 = (deg: number) => PTS[Math.round(norm360(deg) / 22.5) % 16];

export type WindRel = {
  /** + = en contra (headwind), − = a favor (tailwind) */ head_kmh: number;
  /** + = viene de la derecha (empuja a la izquierda), − = viene de la izquierda */ cross_kmh: number;
  /** wind FROM direction relative to the line of play: 0 = de frente, 90 = de la derecha, 180 = de atrás, 270 = de la izquierda */ rel_deg: number;
  kind: "en_contra" | "a_favor" | "cruzado" | "calma";
  label: string;
};

/**
 * Wind relative to a shot or a hole. `playBearing` = true bearing of the line of play (tee → green or a segment);
 * `windFrom` = meteorological direction (where the wind COMES FROM, true degrees); `kmh` = speed.
 */
export function windRelative(playBearing: number, windFrom: number, kmh: number): WindRel {
  const rel = norm360(windFrom - playBearing), r = rel * Math.PI / 180;
  const head = kmh * Math.cos(r), cross = kmh * Math.sin(r);
  const h = Math.round(head * 10) / 10, c = Math.round(cross * 10) / 10;
  if (kmh < 3) return { head_kmh: h, cross_kmh: c, rel_deg: Math.round(rel), kind: "calma", label: `Viento: calma (${Math.round(kmh)} km/h)` };
  // sectors of 45° around the four main cases
  const side = cross > 0 ? "derecha" : "izquierda";
  let kind: WindRel["kind"], txt: string;
  if (rel <= 22.5 || rel >= 337.5) { kind = "en_contra"; txt = "en contra"; }
  else if (rel >= 157.5 && rel <= 202.5) { kind = "a_favor"; txt = "a favor"; }
  else if ((rel > 67.5 && rel < 112.5) || (rel > 247.5 && rel < 292.5)) { kind = "cruzado"; txt = `cruzado de ${side}`; }
  else if (rel < 90 || rel > 270) { kind = "en_contra"; txt = `en contra-${side}`; }
  else { kind = "a_favor"; txt = `a favor-${side}`; }
  return { head_kmh: h, cross_kmh: c, rel_deg: Math.round(rel), kind, label: `Viento: ${Math.round(kmh)} km/h ${txt}` };
}

/** Per-hole wind from the tee (overall tee→green bearing), plus each dogleg segment when the hole has them. */
export function holeWind(h: { bearing?: { tee_to_green_true?: number | null; segments?: { bearing_true: number; length_m: number }[] } }, windFrom: number, kmh: number) {
  const b = h.bearing?.tee_to_green_true; if (b == null) return null;
  const segs = (h.bearing?.segments || []).length > 1 ? h.bearing!.segments!.map(s => ({ bearing_true: s.bearing_true, length_m: s.length_m, ...windRelative(s.bearing_true, windFrom, kmh) })) : [];
  return { from_deg: norm360(windFrom), from_label: compass16(windFrom), kmh, ...windRelative(b, windFrom, kmh), segments: segs };
}

/* ---------------- import cross-check (club scorecard vs OSM geometry) ---------------- */
/** Plausible par for a length (USGA men's guidance, yards): ≤260 par 3, 240–490 par 4, ≥450 par 5. */
export function parPlausible(par: number | null | undefined, yd: number | null | undefined) {
  if (!par || !yd) return null;
  return par === 3 ? yd <= 260 : par === 4 ? yd >= 230 && yd <= 500 : par === 5 ? yd >= 430 : null;
}
/** Tee colours from the card whose yardage is within ±tol yd of each OSM tee box's play length (inferred, not mapped). */
export function inferTeeColors(boxesYd: number[], cardYards: Record<string, number | null> | null | undefined, tol = 12) {
  const ys = Object.entries(cardYards || {}).filter(([, v]) => typeof v === "number") as [string, number][];
  return boxesYd.map(b => ys.filter(([, v]) => Math.abs(v - b) <= tol).sort((x, y) => Math.abs(x[1] - b) - Math.abs(y[1] - b)).map(([k]) => k));
}

/* ---------------- t198u/t199u: per-course completeness (Jockey-level mapping is the standard) ---------------- */
export type CoverageRow = { hole: number; par?: number | null; coverage?: Record<string, any> | null };
export type GuideLite = { holes?: Record<number, { hazards?: any[]; markers?: any[] } | undefined>; greens?: Record<number, any> } | null;
/** What a course needs, per hole. `core` items gate the printed libreta and the wind ± yd; the rest are reported (Jockey has no OB/slope data yet). */
export const COMPLETENESS_ITEMS = [
  { key: "tees", label: "salidas (tees)", core: true },
  { key: "line", label: "línea de juego y rumbo", core: true },
  { key: "green", label: "green", core: true },
  { key: "markers", label: "marcas 50–250", core: true },
  { key: "hazards", label: "obstáculos (bunkers, agua, árboles)", core: true },
  { key: "fairway", label: "fairway", core: false },
  { key: "trees", label: "árboles / bosque", core: false },
  { key: "water", label: "agua", core: false },
  { key: "ob", label: "fuera de límites", core: false },
  { key: "green_slope", label: "caídas del green", core: false },
] as const;
export type CompletenessKey = typeof COMPLETENESS_ITEMS[number]["key"];
const FAIRWAY_MIN = 0.75;          // share of par 4/5 holes with a mapped fairway (Jockey: 15/18 holes incl. par 3s)
const ALMOST_MIN = 16;             // ≥ 16 of 18 holes core-complete → libreta prints; the rest say "hoyo en relevamiento"

/** Pure: per-hole flags + course status from course_map_hole.coverage rows (map) and/or a club guide (greens/hazards/markers/OB, no geometry). */
export function courseCompleteness(rows: CoverageRow[], guide: GuideLite = null, expected = 18) {
  const per: { hole: number; has: Record<CompletenessKey, boolean>; core_ok: boolean; missing: string[] }[] = [];
  for (let n = 1; n <= expected; n++) {
    const r = rows.find(x => x.hole === n), c = r?.coverage || {}, gh = guide?.holes?.[n], gg = guide?.greens?.[n];
    const gz = (gh?.hazards || []) as any[];
    const has: Record<CompletenessKey, boolean> = {
      tees: (c.tees ?? 0) > 0, line: !!c.line, green: !!c.green || !!c.green_fb || !!gg,
      markers: (c.markers ?? 0) > 0 || (gh?.markers?.length ?? 0) > 0, hazards: (c.hazards ?? 0) > 0 || gz.length > 0,
      fairway: !!c.fairway, trees: (c.trees ?? 0) > 0 || gz.some(z => z.kind === "árboles"), water: (c.water ?? 0) > 0 || gz.some(z => z.kind === "agua"),
      ob: !!c.ob || gz.some(z => z.kind === "límite") || (gg?.ob?.length ?? 0) > 0, green_slope: !!c.green_slope || !!gg,
    };
    const core_ok = COMPLETENESS_ITEMS.every(i => !i.core || has[i.key]);
    per.push({ hole: n, has, core_ok, missing: COMPLETENESS_ITEMS.filter(i => !has[i.key]).map(i => i.key) });
  }
  const par = (n: number) => rows.find(x => x.hole === n)?.par ?? null;
  const longHoles = per.filter(h => par(h.hole) !== 3), fairwayShare = longHoles.length ? longHoles.filter(h => h.has.fairway).length / longHoles.length : 0;
  const items = COMPLETENESS_ITEMS.map(i => ({ key: i.key, label: i.label, core: i.core, holes: per.filter(h => h.has[i.key]).length, of: expected }));
  const coreHoles = per.filter(h => h.core_ok).length, fairwayOk = fairwayShare >= FAIRWAY_MIN;
  const status: "completa" | "casi_completa" | "en_relevamiento" = coreHoles === expected && fairwayOk ? "completa" : coreHoles >= ALMOST_MIN && fairwayOk ? "casi_completa" : "en_relevamiento";
  const ready = status !== "en_relevamiento";
  const missing = items.filter(i => i.holes < i.of).map(i => `${i.label}: ${i.holes === 0 ? "sin datos" : `${i.of - i.holes} ${i.of - i.holes === 1 ? "hoyo" : "hoyos"} sin datos`}`);
  return {
    status, label: status === "completa" ? "Cancha completa" : status === "casi_completa" ? "Cancha casi completa" : "Cancha en relevamiento",
    core_holes: coreHoles, of: expected, fairway_share: Math.round(fairwayShare * 100) / 100,
    ready: { libreta: ready, wind_yd: ready },
    /** holes whose card would be half-empty: printed/shown as "hoyo en relevamiento" */
    holes_en_relevamiento: per.filter(h => !h.core_ok).map(h => h.hole),
    items, missing, per_hole: per.map(h => ({ hole: h.hole, core_ok: h.core_ok, missing: h.missing })),
  };
}
export type Completeness = ReturnType<typeof courseCompleteness>;

/** t227u: courses whose yardage markers measure to the ENTRANCE (front) of the green (MdP's guide says so). Pure: re-measures the
 *  map's markers to the green front along the hole line, and — when the club guide lists the real colour markers of the hole — draws
 *  those instead (point placed along the line at the guide's yards to the entrance). Holes without a line or a front stay as they are. */
type LL = [number, number];
export function markersToEntrance(h: any, guideMarkers?: { c: string; to_green: number; from_tee?: number }[] | null) {
  const line: LL[] = h?.line, front: LL = h?.green?.front; if (!Array.isArray(line) || line.length < 2 || !front) return h;
  const lat0 = front[1] * Math.PI / 180, kx = 111320 * Math.cos(lat0), ky = 110540;
  const xy = (p: LL) => [(p[0] - front[0]) * kx, (p[1] - front[1]) * ky], ll = (q: number[]): LL => [front[0] + q[0] / kx, front[1] + q[1] / ky];
  const P = line.map(xy), cum = [0]; for (let i = 1; i < P.length; i++) cum.push(cum[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
  // where the front projects onto the line (metres from the line start)
  let sF = 0, best = Infinity;
  for (let i = 1; i < P.length; i++) { const a = P[i - 1], b = P[i], dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, (-a[0] * dx - a[1] * dy) / L2)), d = Math.hypot(a[0] + t * dx, a[1] + t * dy);
    if (d < best) { best = d; sF = cum[i - 1] + t * Math.sqrt(L2); } }
  const at = (s: number) => { let i = 1; while (i < P.length - 1 && cum[i] < s) i++; const a = P[i - 1], b = P[i], L = cum[i] - cum[i - 1] || 1, t = (s - cum[i - 1]) / L;
    const q = [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])], ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L; return { q, n: [-uy, ux] }; };
  const half = 9;   // metres each side, like the map markers
  const mk = (yd: number, extra: any) => { const s = sF - yd * 0.9144; if (s < 15) return null; const { q, n } = at(s);
    return { yd, ...extra, point: ll(q), across: [ll([q[0] - n[0] * half, q[1] - n[1] * half]), ll([q[0] + n[0] * half, q[1] + n[1] * half])], from_tee_yd: Math.round(s / 0.9144), ref: "entrada" }; };
  const club = (guideMarkers || []).filter(m => Number.isFinite(m.to_green) && m.to_green > 0).map(m => mk(Math.round(m.to_green), { c: m.c, on_fairway: true, club_marker: true })).filter(Boolean);
  const virt = (h.markers || []).map((m: any) => mk(m.yd, { on_fairway: m.on_fairway ?? null })).filter(Boolean);
  return { ...h, markers: club.length ? club : virt, markers_ref: "entrada", markers_source: club.length ? "guia_club" : "mapa" };
}
