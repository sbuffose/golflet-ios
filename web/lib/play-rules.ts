/** Pure play rules shared by the web client, the metric API and the tests.
 *  Meteorological wind is where it comes FROM. A shot is holed only on the cup. */

export type LL = { lat: number; lng: number };

/** Same rule as validLatLng: a blank endpoint is unknown, a numeric zero is real, and (0, 0) is not a point. */
export function knownPoint(lat: unknown, lng: unknown): LL | null {
  const a = knownCoord(lat), b = knownCoord(lng);
  if (a == null || b == null || Math.abs(a) > 90 || Math.abs(b) > 180 || (a === 0 && b === 0)) return null;
  return { lat: a, lng: b };
}
function knownCoord(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const text = value.trim();
    if (!text || !/^[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[-+]?\d+)?$/i.test(text)) return null;
    const n = Number(text);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}
export type WindRel = "favor" | "contra" | "cruzado" | "unavailable";
export type TrackPhase = "confirmTee" | "confirmFlag" | "tracking" | "penaltyWhere" | "relief" | "drop";
export type TrackMark = { id: number; lat: number; lng: number; club: string | null; countsStroke: boolean; holed: boolean; penalty: boolean; drop: boolean };
export type TrackState = { phase: TrackPhase; tee: LL | null; flag: LL | null; ball: LL | null; marks: TrackMark[]; nextID: number };

export const CUP_M = 1.2;
export const PUTT_M = 25;
export const MONTHS_VISIBLE = 6;
export const MES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
export const MES_FULL = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

const norm = (d: number) => ((d % 360) + 360) % 360;

/** Esri World Imagery at Cancha Vieja hole 1 serves real golf pixels through zoom 17.
 *  Zoom 18 and 19 answer HTTP 200 with the grey "Map data not yet available" tile. */
export const IMAGERY_ZOOM_MAX = 17;

export function projectLL(lat: number, lng: number): [number, number] {
  const x = (lng + 180) / 360;
  const s = Math.sin(lat * Math.PI / 180);
  const y = 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI);
  return [x, y];
}

function havMeters(a: LL, b: LL): number | null {
  if (![a.lat, a.lng, b.lat, b.lng].every(Number.isFinite)) return null;
  const Re = 6371000, t = (x: number) => x * Math.PI / 180, dLa = t(b.lat - a.lat), dLo = t(b.lng - a.lng);
  const h = Math.sin(dLa / 2) ** 2 + Math.cos(t(a.lat)) * Math.cos(t(b.lat)) * Math.sin(dLo / 2) ** 2;
  return 2 * Re * Math.asin(Math.sqrt(h));
}

/** A hole axis exists only when both ends are known and the distance is one hole. Nothing is invented. */
export function holeSpan(tee: LL | null | undefined, flag: LL | null | undefined): { meters: number; bearing: number } | null {
  const a = tee ? knownPoint(tee.lat, tee.lng) : null;
  const b = flag ? knownPoint(flag.lat, flag.lng) : null;
  if (!a || !b || (a.lat === b.lat && a.lng === b.lng)) return null;
  const meters = havMeters(a, b);
  const bearing = bearingDeg(a, b);
  if (meters == null || bearing == null || meters < 40 || meters > 700) return null;
  return { meters, bearing };
}

export type FrameMode = "overview" | "tee" | "flag" | "play" | "point";
export type HoleFrame = { mode: FrameMode; z: number; cx: number; cy: number; bearing: number | null; aimLat: number; aimLng: number };

const clampNum = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

function pointFrame(p: LL): HoleFrame {
  const [cx, cy] = projectLL(p.lat, p.lng);
  return { mode: "point", z: IMAGERY_ZOOM_MAX, cx, cy, bearing: null, aimLat: p.lat, aimLng: p.lng };
}

/** Overview puts the reticle on the flag, tee down-screen. Tee and flag cameras move to that end. */
export function frameHole(
  tee: LL | null | undefined,
  flag: LL | null | undefined,
  mode: FrameMode,
  view: { width: number; height: number },
  ball?: LL | null,
): HoleFrame | null {
  const a = tee ? knownPoint(tee.lat, tee.lng) : null;
  const b = flag ? knownPoint(flag.lat, flag.lng) : null;
  const span = holeSpan(a, b);
  const height = Math.max(1, view?.height || 844);
  if (!span || !a || !b) {
    if (a && b) return null;
    const only = a || b;
    return only ? pointFrame(only) : null;
  }
  const [fx, fy] = projectLL(b.lat, b.lng);
  const [tx, ty] = projectLL(a.lat, a.lng);
  const dist = Math.hypot(tx - fx, ty - fy);
  if (!(dist > 0)) return null;
  const overviewZ = clampNum(Math.log2(Math.max(96, height * 0.36) / (dist * 256)), 15, IMAGERY_ZOOM_MAX + 0.8);
  const tight = clampNum(overviewZ + 1.15, 16, IMAGERY_ZOOM_MAX + 0.8);
  if (mode === "flag") return { mode, z: tight, cx: fx, cy: fy, bearing: span.bearing, aimLat: b.lat, aimLng: b.lng };
  if (mode === "tee") return { mode, z: tight, cx: tx, cy: ty, bearing: span.bearing, aimLat: a.lat, aimLng: a.lng };
  if (mode === "play") {
    const aim = ball ? knownPoint(ball.lat, ball.lng) : a;
    if (!aim) return null;
    const [ax, ay] = projectLL(aim.lat, aim.lng);
    return { mode: "play", z: overviewZ, cx: ax, cy: ay, bearing: span.bearing, aimLat: aim.lat, aimLng: aim.lng };
  }
  return { mode: "overview", z: overviewZ, cx: fx, cy: fy, bearing: span.bearing, aimLat: b.lat, aimLng: b.lng };
}

export function screenOf(lat: number, lng: number, cam: { z: number; cx: number; cy: number; bearing: number | null }, view: { width: number; height: number }): [number, number] | null {
  const p = knownPoint(lat, lng);
  if (!p) return null;
  const [x, y] = projectLL(p.lat, p.lng);
  const n = 2 ** cam.z;
  const px = (x - cam.cx) * n * 256, py = (y - cam.cy) * n * 256;
  const rad = -(cam.bearing || 0) * Math.PI / 180, c = Math.cos(rad), s = Math.sin(rad);
  return [view.width / 2 + px * c - py * s, view.height * 0.42 + px * s + py * c];
}

export function worldTile(lat: number, lng: number, z: number): { z: number; x: number; y: number } | null {
  const p = knownPoint(lat, lng);
  if (!p) return null;
  const zi = Math.max(0, Math.min(IMAGERY_ZOOM_MAX, Math.floor(z)));
  const n = 2 ** zi;
  const [x, y] = projectLL(p.lat, p.lng);
  const tx = Math.floor(x * n), ty = Math.floor(y * n);
  if (!Number.isFinite(tx) || !Number.isFinite(ty)) return null;
  return { z: zi, x: tx, y: ty };
}

export function bearingDeg(a: LL | null | undefined, b: LL | null | undefined): number | null {
  if (!a || !b || !Number.isFinite(a.lat) || !Number.isFinite(a.lng) || !Number.isFinite(b.lat) || !Number.isFinite(b.lng)) return null;
  const t = (x: number) => x * Math.PI / 180, dLo = t(b.lng - a.lng);
  const y = Math.sin(dLo) * Math.cos(t(b.lat));
  const x = Math.cos(t(a.lat)) * Math.sin(t(b.lat)) - Math.sin(t(a.lat)) * Math.cos(t(b.lat)) * Math.cos(dLo);
  return norm(Math.atan2(y, x) * 180 / Math.PI);
}

/** Wind FROM the direction of play is into the face. Missing bearing or direction stays unclassified. */
export function windRelative(fromDeg: number | null | undefined, bearing: number | null | undefined): WindRel {
  if (fromDeg == null || bearing == null || !Number.isFinite(+fromDeg) || !Number.isFinite(+bearing)) return "unavailable";
  const delta = norm(+fromDeg - +bearing);
  if (delta < 45 || delta >= 315) return "contra";
  if (delta >= 135 && delta < 225) return "favor";
  return "cruzado";
}

export function windPlay(hole: number, fromDeg: number | null | undefined, bearing: number | null | undefined, speedKmh: number | null | undefined): { relative: WindRel; text: string } {
  if (bearing == null || !Number.isFinite(+bearing)) {
    return { relative: "unavailable", text: `Hoyo ${hole} · Sin rumbo verificado del tee al green. No clasifico el viento.` };
  }
  if (fromDeg == null || !Number.isFinite(+fromDeg)) {
    return { relative: "unavailable", text: `Hoyo ${hole} · El horario no dice de dónde viene. No clasifico el viento.` };
  }
  const relative = windRelative(fromDeg, bearing);
  const label = relative === "contra" ? "en contra" : relative === "favor" ? "a favor" : "cruzado";
  const sp = speedKmh == null || !Number.isFinite(+speedKmh) ? "" : ` · ${Math.round(+speedKmh)} km/h`;
  return { relative, text: `Hoyo ${hole} · ${label}${sp}` };
}

export function onCup(meters: number): boolean {
  return Number.isFinite(meters) && meters >= 0 && meters <= CUP_M;
}
export function puttFeet(meters: number): number | null {
  if (!Number.isFinite(meters) || meters <= CUP_M || meters > PUTT_M) return null;
  return Math.round(meters * 3.28084);
}

function copyState(s: TrackState): TrackState {
  return { ...s, tee: s.tee ? { ...s.tee } : null, flag: s.flag ? { ...s.flag } : null, ball: s.ball ? { ...s.ball } : null, marks: s.marks.map(m => ({ ...m })) };
}
export function trackNew(): TrackState {
  return { phase: "confirmTee", tee: null, flag: null, ball: null, marks: [], nextID: 1 };
}
export function trackSet(state: TrackState, at: LL): TrackState {
  const next = copyState(state);
  if (state.phase === "confirmTee") { next.tee = { ...at }; next.ball = { ...at }; next.phase = "confirmFlag"; }
  else if (state.phase === "confirmFlag") { next.flag = { ...at }; next.phase = "tracking"; }
  else if (state.phase === "drop") {
    next.ball = { ...at };
    next.marks.push({ id: next.nextID, lat: at.lat, lng: at.lng, club: null, countsStroke: false, holed: false, penalty: false, drop: true });
    next.nextID += 1;
    next.phase = "tracking";
  }
  return next;
}
export function trackEnter(state: TrackState, at: LL, club: string | null, cup: boolean): { state: TrackState; recorded: boolean; holed: boolean } {
  const next = copyState(state);
  if (state.phase === "tracking") {
    const holed = !!cup;
    const spot = holed && state.flag ? { ...state.flag } : { ...at };
    next.marks.push({ id: next.nextID, lat: spot.lat, lng: spot.lng, club, countsStroke: true, holed, penalty: false, drop: false });
    next.nextID += 1;
    next.ball = spot;
    next.phase = "tracking";
    return { state: next, recorded: true, holed };
  }
  if (state.phase === "penaltyWhere") {
    next.marks.push({ id: next.nextID, lat: at.lat, lng: at.lng, club, countsStroke: true, holed: false, penalty: true, drop: false });
    next.nextID += 1;
    next.phase = "relief";
    return { state: next, recorded: true, holed: false };
  }
  return { state, recorded: false, holed: false };
}
export function trackPenalty(state: TrackState): TrackState {
  if (state.phase !== "tracking") return state;
  const next = copyState(state);
  next.phase = "penaltyWhere";
  return next;
}
export function trackReload(state: TrackState): TrackState {
  if (state.phase !== "relief") return state;
  const next = copyState(state);
  const prior = [...state.marks].reverse().find(m => m.countsStroke && !m.penalty);
  next.ball = prior ? { lat: prior.lat, lng: prior.lng } : (state.tee ? { ...state.tee } : state.ball);
  next.phase = "tracking";
  return next;
}
export function trackDrop(state: TrackState): TrackState {
  if (state.phase !== "relief") return state;
  const next = copyState(state);
  next.phase = "drop";
  return next;
}
export function trackCancel(state: TrackState): TrackState {
  const next = copyState(state);
  if (state.phase === "penaltyWhere") { next.phase = "tracking"; return next; }
  if (state.phase === "relief" || state.phase === "drop") {
    if (next.marks.length && next.marks[next.marks.length - 1].penalty) next.marks.pop();
    next.phase = "tracking";
    return next;
  }
  return state;
}

export type MonthCol = { id: string; year: number; month: number; birdies: number; pars: number; shortLabel: string; showsYear: boolean; fullLabel: string; detail: string };
export function monthColumns(rows: { month: string; birdies: number; pars: number }[]): MonthCol[] {
  const ordered = rows.filter(r => /^\d{4}-\d{2}$/.test(r.month)).slice().sort((a, b) => a.month < b.month ? -1 : a.month > b.month ? 1 : 0);
  return ordered.map((r, i) => {
    const year = +r.month.slice(0, 4), month = +r.month.slice(5, 7);
    const prev = i ? +ordered[i - 1].month.slice(0, 4) : null;
    const full = `${MES_FULL[month - 1] || ""} ${year}`.trim();
    const birdie = r.birdies === 1 ? "1 birdie" : `${r.birdies} birdies`;
    const par = r.pars === 1 ? "1 par" : `${r.pars} pares`;
    return { id: r.month, year, month, birdies: r.birdies, pars: r.pars, shortLabel: MES[month - 1] || "", showsYear: prev !== year, fullLabel: full, detail: `${full} · ${birdie} · ${par}` };
  });
}

const fold = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
export type PickerCourse = { course_id: string; club_code?: string | null; club_name?: string | null; course_label?: string | null; label?: string | null; distance_km?: number | null };
export function coursePickerGroups(courses: PickerCourse[]) {
  const groups: { code: string; club: string; distance: string | null; rows: { id: string; name: string }[] }[] = [];
  for (const c of courses) {
    const code = String(c.club_code || c.club_name || "club");
    let g = groups.find(x => x.code === code);
    if (!g) {
      const km = c.distance_km;
      g = { code, club: c.club_name || "Club", distance: km != null && Number.isFinite(+km) ? `${km} km` : null, rows: [] };
      groups.push(g);
    }
    g.rows.push({ id: c.course_id, name: c.course_label || c.label || "Cancha" });
  }
  for (const g of groups) {
    if (g.rows.length === 1 && fold(g.rows[0].name) === fold(g.club)) g.rows[0] = { ...g.rows[0], name: "Jugar esta cancha" };
  }
  return groups;
}

export function strategyChoice(variants: Record<string, { plan?: string | null; tee_club?: string | null } | null | undefined> | null | undefined, level: string, general: { plan?: string | null; tee_club?: string | null }) {
  const v = variants || {};
  if (!level) return { missing: false, plan: general.plan || "", club: general.tee_club || "" };
  const key = level === "bajo" ? (v.bajo ? "bajo" : (v.scratch ? "scratch" : "")) : (v[level] ? level : "");
  const label = level === "bajo" ? "hándicap bajo" : level === "medio" ? "hándicap medio" : level === "alto" ? "hándicap alto" : level;
  const hit = key ? v[key] : null;
  if (!hit) return { missing: true, plan: `No hay un plan verificado para ${label}.`, club: "" };
  return { missing: !hit.plan, plan: hit.plan || `No hay un plan verificado para ${label}.`, club: hit.tee_club || "" };
}

export function officialIndex(player: number | null | undefined, history: { date: string; hi: number }[]): number | null {
  const dated = (history || []).filter(h => h && h.hi != null && h.date);
  if (!dated.length) return player == null || !Number.isFinite(+player) ? null : +player;
  let best = dated[0], at = 0;
  dated.forEach((h, i) => { if (h.date > best.date || (h.date === best.date && i >= at)) { best = h; at = i; } });
  return +best.hi;
}

export const HI_UNIDENTIFIED = "No puedo identificar la tarjeta.";
const HI_MES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

export type HICard = { id: string; date: string; course: string; differential: number; gross: number | null };
export type HIShift = {
  verified: boolean;
  enteredBest8: HICard[];
  leftBest8: HICard[];
  agedOut: HICard[];
  enteredWindow: HICard[];
};

export function hiCardLine(card: HICard): string {
  const [y, m, d] = String(card.date).slice(0, 10).split("-");
  const bits = [`${+d} ${HI_MES[+m - 1] || ""} ${y}`.replace(/\s+/g, " ").trim()];
  const course = String(card.course || "").trim();
  if (course) bits.push(course);
  const diff = (Math.round(card.differential * 10) / 10).toFixed(1).replace(".", ",");
  bits.push(`diferencial ${diff}`);
  if (card.gross != null && Number.isFinite(+card.gross)) bits.push(`gross ${card.gross}`);
  return bits.join(" · ");
}

type Card = HICard;
function best8(cards: Card[]): Card[] {
  return cards.map((c, i) => ({ c, i })).sort((a, b) => a.c.differential - b.c.differential || (a.c.date < b.c.date ? 1 : a.c.date > b.c.date ? -1 : b.i - a.i)).slice(0, 8).map(x => x.c);
}
const emptyShift = (): HIShift => ({ verified: false, enteredBest8: [], leftBest8: [], agedOut: [], enteredWindow: [] });

/** Best 8 of each date's last 20. A course name is never enough, and the registration club is never a card. */
export function hiAttribution(D: { rounds?: any[] }, prevDate: string | null, date: string): HIShift {
  if (!prevDate) return emptyShift();
  const all: Card[] = (D.rounds || [])
    .filter((r: any) => r.valid_card && !r.is_9_holes && r.differential_computed != null && r.date)
    .map((r: any) => ({
      id: String(r.round_id ?? r.id),
      date: String(r.date).slice(0, 10),
      course: String((r.course_label && String(r.course_label).trim()) || (r.course && String(r.course).trim()) || "").trim(),
      differential: +r.differential_computed,
      gross: r.gross == null || r.gross === "" ? null : +r.gross,
    }))
    .sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : a.id < b.id ? -1 : 1);
  const upTo = (d: string) => all.filter(c => c.date <= d);
  const prevPool = upTo(prevDate).slice(-20);
  const curPool = upTo(date).slice(-20);
  if (prevPool.length < 20 || curPool.length < 20) return emptyShift();
  const prevBest = best8(prevPool), curBest = best8(curPool);
  const prevBestIDs = new Set(prevBest.map(c => c.id)), curBestIDs = new Set(curBest.map(c => c.id));
  const prevWindowIDs = new Set(prevPool.map(c => c.id)), curWindowIDs = new Set(curPool.map(c => c.id));
  return {
    verified: true,
    enteredBest8: curBest.filter(c => !prevBestIDs.has(c.id)),
    leftBest8: prevBest.filter(c => curWindowIDs.has(c.id) && !curBestIDs.has(c.id)),
    agedOut: prevBest.filter(c => !curWindowIDs.has(c.id)),
    enteredWindow: curPool.filter(c => !prevWindowIDs.has(c.id) && !curBestIDs.has(c.id)),
  };
}

export type RoundCourseRef = {
  course?: string | null;
  club_name?: string | null;
  club_code?: string | null;
  course_id?: string | null;
};
export type GpsCourseRef = {
  course_id?: string | null;
  club_code?: string | null;
  club_name?: string | null;
  club?: string | null;
  club_aliases?: Array<string | null> | null;
  course?: string | null;
  course_label?: string | null;
  label?: string | null;
  vm_course?: string | null;
  course_aliases?: Array<string | null> | null;
  aliases?: Array<string | null> | null;
};

const foldCourse = (value: unknown) => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
const courseWords = (course: GpsCourseRef) => [course.course, course.course_label, course.label, course.vm_course, ...(course.course_aliases || []), ...(course.aliases || [])].map(foldCourse).filter(Boolean);
const clubWords = (course: GpsCourseRef) => [course.club_name, course.club, ...(course.club_aliases || [])].map(foldCourse).filter(Boolean);
const clubCodesOf = (course: GpsCourseRef) => {
  const codes = [String(course.club_code || "").trim()];
  const id = String(course.course_id || "").trim();
  const prefix = /^(\d{1,5})-/.exec(id);
  if (prefix) codes.push(prefix[1]);
  return [...new Set(codes.filter(Boolean))];
};

/** A round with a club only opens that club's geometry. A unique course name is enough only when the round names no club. */
export function matchRoundCourse(official: RoundCourseRef | null | undefined, courses: GpsCourseRef[] | null | undefined): GpsCourseRef | null {
  const wanted = foldCourse(official?.course);
  if (!wanted) return null;
  const named = (courses || []).filter(course => courseWords(course).includes(wanted));
  const roundCode = String(official?.club_code || "").trim();
  const roundClub = foldCourse(official?.club_name);
  const roundId = String(official?.course_id || "").trim();
  if (!roundCode && !roundClub && !roundId) return named.length === 1 ? named[0] : null;
  const agreed = named.filter(course => {
    if (roundId && course.course_id && roundId !== String(course.course_id)) return false;
    const codes = clubCodesOf(course);
    if (roundCode && codes.length && codes.some(code => code !== roundCode)) return false;
    const names = clubWords(course);
    if (roundClub && names.length && !names.includes(roundClub)) {
      return !!(roundCode && codes.length && codes.every(code => code === roundCode));
    }
    if (roundCode && codes.length && codes.every(code => code === roundCode)) return true;
    if (roundClub && names.includes(roundClub)) return true;
    return false;
  });
  return agreed.length === 1 ? agreed[0] : null;
}
