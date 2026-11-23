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
export type TrackMark = { id: number; lat: number; lng: number; club: string | null; countsStroke: boolean; holed: boolean; penalty: boolean; drop: boolean; lost?: boolean; provisional?: boolean };
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

/** Byte-identical Esri JPEG served with HTTP 200 for "Map data not yet available". */
export const ESRI_BLANK_TILE_SHA256 = "9eafd300d61393184a4abc1d458564cfd1cd9b6f9c4e9c74687045c0a0e5b858";

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

export type FrameMode = "overview" | "tee" | "flag" | "play" | "point" | "seek";
export type HoleFrame = { mode: FrameMode; z: number; cx: number; cy: number; bearing: number | null; aimLat: number; aimLng: number };

/** Visual zoom scales the last real tile. The tile request stays on a real zoom so the picture does not go blank. */
export const VISUAL_ZOOM_MAX = IMAGERY_ZOOM_MAX + 6;

const clampNum = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

function pointFrame(p: LL, mode: FrameMode, z = IMAGERY_ZOOM_MAX): HoleFrame {
  const [cx, cy] = projectLL(p.lat, p.lng);
  return { mode, z, cx, cy, bearing: null, aimLat: p.lat, aimLng: p.lng };
}

export function unprojectLL(x: number, y: number): LL {
  const lng = x * 360 - 180;
  const n = Math.PI - 2 * Math.PI * y;
  const lat = Math.atan(Math.sinh(n)) * 180 / Math.PI;
  return { lat, lng };
}

/** Play camera: ball toward the bottom, flag toward the top, reticle between them.
 *  The bearing is the geographic ball→flag direction. It is a framing choice checked
 *  against the screen, not a claim about another app's camera equation.
 *  Zoom never asks for a tile past the last real imagery; a short putt may scale that tile. */
export function frameAdvance(origin: LL, target: LL, view: { width: number; height: number }): HoleFrame | null {
  const a = knownPoint(origin.lat, origin.lng);
  const b = knownPoint(target.lat, target.lng);
  if (!a || !b) return null;
  const bearing = bearingDeg(a, b);
  const [ox, oy] = projectLL(a.lat, a.lng);
  const [tx, ty] = projectLL(b.lat, b.lng);
  const dist = Math.hypot(tx - ox, ty - oy);
  if (bearing == null || !(dist > 0)) return pointFrame(a, "play");
  const height = Math.max(1, view?.height || 844);
  const spanPx = Math.max(120, height * 0.52);
  const z = clampNum(Math.log2(spanPx / (dist * 256)), 15.5, VISUAL_ZOOM_MAX);
  const frac = 0.32 / 0.52;
  const cx = ox + (tx - ox) * frac;
  const cy = oy + (ty - oy) * frac;
  const aim = unprojectLL(cx, cy);
  return { mode: "play", z, cx, cy, bearing, aimLat: aim.lat, aimLng: aim.lng };
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
    if (mode === "tee") return a ? pointFrame(a, "tee") : (b ? pointFrame(b, "seek", 16) : null);
    if (mode === "flag") return b ? pointFrame(b, "flag", VISUAL_ZOOM_MAX) : (a ? pointFrame(a, "seek", 16) : null);
    if (mode === "seek") return (b || a) ? pointFrame((b || a)!, "seek", 16) : null;
    const only = a || b;
    return only ? pointFrame(only, "point") : null;
  }
  const [fx, fy] = projectLL(b.lat, b.lng);
  const [tx, ty] = projectLL(a.lat, a.lng);
  const dist = Math.hypot(tx - fx, ty - fy);
  if (!(dist > 0)) return null;
  const overviewZ = clampNum(Math.log2(Math.max(96, height * 0.36) / (dist * 256)), 15, IMAGERY_ZOOM_MAX + 0.8);
  const teeZ = clampNum(Math.max(overviewZ + 1.15, IMAGERY_ZOOM_MAX + 0.6), 16, VISUAL_ZOOM_MAX);
  const flagZ = VISUAL_ZOOM_MAX;
  if (mode === "flag") return { mode, z: flagZ, cx: fx, cy: fy, bearing: span.bearing, aimLat: b.lat, aimLng: b.lng };
  if (mode === "tee") return { mode, z: teeZ, cx: tx, cy: ty, bearing: span.bearing, aimLat: a.lat, aimLng: a.lng };
  if (mode === "play") return frameAdvance(ball ? knownPoint(ball.lat, ball.lng) || a : a, b, view);
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

/** Degrees clockwise from the direction of play. 0 points toward the green: the wind is pushing that way. */
export function windArrow(fromDeg: number | null | undefined, bearing: number | null | undefined): number | null {
  if (fromDeg == null || bearing == null || !Number.isFinite(+fromDeg) || !Number.isFinite(+bearing)) return null;
  return norm(+fromDeg + 180 - +bearing);
}

const WIND_CARDINAL = ["N", "NE", "E", "SE", "S", "SO", "O", "NO"] as const;

/** Where the wind comes from, in eight Spanish compass points. */
export function windCardinal(fromDeg: number | null | undefined): string | null {
  if (fromDeg == null || !Number.isFinite(+fromDeg)) return null;
  return WIND_CARDINAL[Math.round(norm(+fromDeg) / 45) % 8];
}

/** Short face of the wind along the hole. Crosswind from the right is «de derecha». */
export function windSide(fromDeg: number | null | undefined, bearing: number | null | undefined): string | null {
  if (fromDeg == null || bearing == null || !Number.isFinite(+fromDeg) || !Number.isFinite(+bearing)) return null;
  const delta = norm(+fromDeg - +bearing);
  if (delta < 45 || delta >= 315) return "en contra";
  if (delta >= 135 && delta < 225) return "a favor";
  if (delta >= 45 && delta < 135) return "cruzado de derecha";
  return "de izquierda";
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

const M_PER_FT = 0.3048;
const M_PER_IN = 0.0254;

/** On the green the hole is in feet, or in inches under 3 ft. Under one inch is the cup. */
export function greenToHole(meters: number): { text: string; unit: "ft" | "in" | "cup"; n: number } | null {
  if (!Number.isFinite(meters) || meters < 0) return null;
  const inches = Math.round(meters / M_PER_IN);
  if (inches < 1) return { text: "En el hoyo", unit: "cup", n: 0 };
  if (meters / M_PER_FT < 3 - 1e-6) return { text: `${inches} in`, unit: "in", n: inches };
  const feet = Math.round(meters / M_PER_FT);
  return { text: `${feet} ft`, unit: "ft", n: feet };
}

/** The ball is in the cup. Any greater distance is still a shot in play. */
export function inTheCup(meters: number): boolean {
  return greenToHole(meters)?.unit === "cup";
}

/** Under 3 ft, and not already in the cup, the player can hole or concede the next stroke. */
export function shortPutt(meters: number): boolean {
  return greenToHole(meters)?.unit === "in";
}

/**
 * Closing while the ball is still out adds the putt that has not been played.
 * A missing putt count becomes that one stroke. It never lowers the total.
 */
export function scoredClose(strokes: number, putts: number | null, inCup: boolean): { strokes: number; putts: number | null } {
  const n = Math.max(0, Math.round(Number(strokes) || 0));
  if (inCup) return { strokes: n, putts };
  const known = putts == null || !Number.isFinite(putts) ? 0 : Math.max(0, Math.round(putts));
  return { strokes: n + 1, putts: known + 1 };
}

/** A putt the player types. Comma or dot. The map estimate is not rewritten to match it. */
export function puttMeters(value: unknown): number | null {
  let n: number;
  if (typeof value === "number") n = value;
  else if (typeof value === "string") {
    const text = value.trim().replace(",", ".");
    if (!/^\d+(?:\.\d+)?$/.test(text)) return null;
    n = Number(text);
  } else return null;
  if (!Number.isFinite(n) || n < 0.1 || n > 50) return null;
  return Math.round(n * 10) / 10;
}

export function isPutterClub(id: string, label = ""): boolean {
  const face = id.trim();
  const name = String(label || "").trim();
  return /^(pt|putt|putter)$/i.test(face) || /^putter\b/i.test(name) || /^putter\b/i.test(face);
}

export type PuttShot = {
  club?: unknown;
  lie?: unknown;
  intent?: unknown;
  result?: unknown;
  penalty?: boolean;
  recovery?: boolean;
  originGreen?: boolean;
};

/** A putter stroke, or a stroke that started on the green. Recovery and penalties are not putts. */
export function shotCountsAsPutt(shot: PuttShot): boolean {
  if (shot.penalty || shot.recovery || shot.intent === "recovery") return false;
  const result = String(shot.result || "");
  if (result === "penalty" || result === "lost") return false;
  const club = String(shot.club || "");
  if (isPutterClub(club, club)) return true;
  return shot.lie === "green" || shot.originGreen === true;
}

/**
 * Putts already stored on the shots. Null only when none of the strokes say
 * the club or whether they started on the green. Zero is a real count.
 */
export function countedPutts(shots: PuttShot[]): number | null {
  const playable = shots.filter(s => !s.penalty && s.result !== "penalty" && s.result !== "lost");
  if (!playable.length) return null;
  const know = playable.some(s => String(s.club || "").trim() || s.lie || s.originGreen === true || s.originGreen === false);
  if (!know) return null;
  return playable.filter(shotCountsAsPutt).length;
}

/** A scorecard stores yards as a number or as a tee map ({ BLANCO: 445 }). Never stringify the object. */
export function yardNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) && value >= 0 && value < 1000 ? Math.round(value) : null;
  if (typeof value === "string") {
    const text = value.trim();
    const match = text.match(/^(\d+(?:[.,]\d+)?)/);
    if (!match) return null;
    const n = Number(match[1].replace(",", "."));
    return Number.isFinite(n) && n >= 0 && n < 1000 ? Math.round(n) : null;
  }
  if (value && typeof value === "object") {
    const nums = Object.values(value as Record<string, unknown>).map(yardNumber).filter((n): n is number => n != null);
    return nums.length ? Math.max(...nums) : null;
  }
  return null;
}
export function yardLabel(value: unknown): string {
  const n = yardNumber(value);
  return n == null ? "" : `${n} yd`;
}

export type TeeBox = { name: string; yards: number | null; lat: number | null; lng: number | null };
export type ForeignTee = { point: LL; pin: LL; yards: unknown };

function yardList(value: unknown): number[] {
  if (typeof value === "number" || typeof value === "string") {
    const n = yardNumber(value);
    return n == null ? [] : [n];
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return Object.values(value as Record<string, unknown>).map(yardNumber).filter((n): n is number => n != null);
  }
  return [];
}

/** A measured tee matches a printed tee when the gap stays inside 20 yards, or 4% on a long hole. */
export function teeAgrees(meters: number, yards: number): boolean {
  if (!Number.isFinite(meters) || !Number.isFinite(yards) || yards <= 0) return false;
  return Math.abs(meters / 0.9144 - yards) <= Math.max(20, yards * 0.04);
}

function teeCenter(item: unknown): LL | null {
  if (Array.isArray(item) && item.length >= 2) return knownPoint(item[1], item[0]);
  if (!item || typeof item !== "object") return null;
  const raw = item as { center?: unknown; lat?: unknown; lng?: unknown };
  if (Array.isArray(raw.center)) return knownPoint((raw.center as unknown[])[1], (raw.center as unknown[])[0]);
  if (raw.center && typeof raw.center === "object") {
    const c = raw.center as { lat?: unknown; lng?: unknown };
    return knownPoint(c.lat, c.lng);
  }
  return knownPoint(raw.lat, raw.lng);
}

/** The automatic start is a point of THIS hole whose distance matches the yardage on the card.
 *  A center that fits a shorter tee, or another hole's tee, is not used. One center is not painted as a color. */
export function matchingTee(pin: LL | null | undefined, yards: unknown, spots: Array<LL | null | undefined>, foreign: ForeignTee[] = []): LL | null {
  const flag = pin ? knownPoint(pin.lat, pin.lng) : null;
  const names = yardList(yards);
  const uniq: LL[] = [];
  for (const spot of spots) {
    const p = spot ? knownPoint(spot.lat, spot.lng) : null;
    if (!p || uniq.some(u => metersBetween(u, p) < 8)) continue;
    uniq.push(p);
  }
  if (!flag) return null;
  const spanned = uniq.filter(p => holeSpan(p, flag));
  if (names.length < 2 || spanned.length < 2) return spanned[0] || null;
  const longest = Math.max(...names);
  const ranked = spanned.map(p => {
    const got = metersBetween(p, flag) / 0.9144;
    let best = names[0], err = Infinity;
    for (const y of names) {
      const gap = Math.abs(got - y);
      if (gap < err) { err = gap; best = y; }
    }
    return { p, got, best, err, vsLong: Math.abs(got - longest) };
  }).filter(row => names.length < 2 || row.best === longest || teeAgrees(metersBetween(row.p, flag), longest));
  const kept = ranked.filter(row => {
    if (names.length < 2) return true;
    for (const other of foreign) {
      const op = knownPoint(other.point?.lat, other.point?.lng);
      const of = knownPoint(other.pin?.lat, other.pin?.lng);
      const otherNames = yardList(other.yards);
      if (!op || !of || !otherNames.length || metersBetween(row.p, op) > 12) continue;
      const back = Math.max(...otherNames);
      const theirs = Math.abs(metersBetween(row.p, of) / 0.9144 - back);
      if (teeAgrees(metersBetween(row.p, of), back) && row.vsLong > theirs + 5) return false;
    }
    return true;
  });
  kept.sort((a, b) => a.vsLong - b.vsLong || a.err - b.err);
  return kept[0]?.p ?? null;
}

/** Named tees from the card, longest first. A center is that color only when the measured yards agree.
 *  One center is not assigned to a color. A missing match stays empty so the player confirms the tee. */
export function teeBoxes(yards: unknown, polygons: unknown, green: LL | null): TeeBox[] {
  const named: { name: string; yards: number }[] = [];
  if (yards && typeof yards === "object" && !Array.isArray(yards)) {
    for (const [name, value] of Object.entries(yards as Record<string, unknown>)) {
      const n = yardNumber(value);
      if (n != null && name.trim()) named.push({ name: name.trim().toUpperCase(), yards: n });
    }
  } else {
    const n = yardNumber(yards);
    if (n != null) named.push({ name: "SALIDA", yards: n });
  }
  named.sort((a, b) => b.yards - a.yards || a.name.localeCompare(b.name));
  const centers: LL[] = [];
  const list = Array.isArray(polygons) ? polygons : [];
  for (const item of list) {
    const point = teeCenter(item);
    if (point && !centers.some(c => metersBetween(c, point) < 8)) centers.push(point);
  }
  const pin = green && knownPoint(green.lat, green.lng);
  const assign = !!(pin && centers.length > 1 && named.length > 1);
  if (!named.length) {
    return centers.map((c, i) => ({ name: centers.length === 1 ? "SALIDA" : `TEE ${i + 1}`, yards: null, lat: c.lat, lng: c.lng }));
  }
  return named.map(row => {
    if (!assign || !pin) return { name: row.name, yards: row.yards, lat: null, lng: null };
    const hit = centers
      .map(c => ({ c, d: Math.abs(metersBetween(c, pin) / 0.9144 - row.yards) }))
      .filter(x => teeAgrees(metersBetween(x.c, pin), row.yards))
      .sort((a, b) => a.d - b.d)[0];
    return { name: row.name, yards: row.yards, lat: hit?.c.lat ?? null, lng: hit?.c.lng ?? null };
  });
}

const EARTH_M = 6_371_008.8;
function metersBetween(a: LL, b: LL): number {
  const rad = (d: number) => d * Math.PI / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_M * Math.asin(Math.min(1, Math.sqrt(h)));
}
export type ShotLabel = { text: string; yards: number | null; meters: number | null; kind: "yards" | "putt" | "manual" | "missing" | "penalty" };

/**
 * Yards are the tee-or-origin to the endpoint. A putt is an origin on the green, or a distance the player typed.
 * A long shot whose stored lie is the landing is not a putt. The card length is never the shot.
 */
export function shotDistanceLabel(shot: {
  lat?: unknown; lng?: unknown; end_lat?: unknown; end_lng?: unknown;
  prev_lat?: unknown; prev_lng?: unknown;
  lie?: unknown; club?: unknown; distance_m?: unknown; distance_kind?: unknown; penalty?: boolean;
}): ShotLabel {
  if (shot.penalty) return { text: "", yards: null, meters: null, kind: "penalty" };
  const start = knownPoint(shot.lat, shot.lng);
  const end = knownPoint(shot.end_lat, shot.end_lng);
  const prev = knownPoint(shot.prev_lat, shot.prev_lng);
  let from = start, to = end;
  if ((!from || !to) && prev) {
    if (!to && from && metersBetween(prev, from) > 3) { to = from; from = prev; }
    else if (to && !from) from = prev;
    else if (!to && !from) { /* still missing */ }
  }
  const flown = from && to ? metersBetween(from, to) : null;
  if (shot.distance_kind === "manual") {
    const typed = puttMeters(shot.distance_m);
    if (typed == null) return { text: "Sin distancia", yards: null, meters: null, kind: "manual" };
    const typedSpan = greenToHole(typed);
    return { text: `${typedSpan && typedSpan.unit !== "cup" ? typedSpan.text : "En el hoyo"} a mano`, yards: null, meters: typed, kind: "manual" };
  }
  const namedPutter = isPutterClub(String(shot.club || ""), String(shot.club || ""));
  const originGreen = (shot.lie === "green" && (flown == null || flown <= 50)) || namedPutter;
  if (originGreen) {
    const precise = flown != null ? flown : (typeof shot.distance_m === "number" && shot.distance_m > 0 && shot.distance_m <= 50 ? shot.distance_m : null);
    if (precise == null) return { text: "Sin ubicación", yards: null, meters: null, kind: "missing" };
    const span = greenToHole(precise);
    const meters = Math.round(precise * 10) / 10;
    return { text: span && span.unit !== "cup" ? span.text : "En el hoyo", yards: null, meters, kind: "putt" };
  }
  if (flown != null) {
    const yards = Math.round(flown / 0.9144);
    return { text: `${yards} yd`, yards, meters: Math.round(flown * 10) / 10, kind: "yards" };
  }
  return { text: "Sin ubicación", yards: null, meters: null, kind: "missing" };
}

export type ShotFact = { penalty?: boolean; holed?: boolean; lost?: boolean; putt?: boolean; originGreen?: boolean; endLie?: "green" | "fairway" | "bunker" | "water" | "rough" | "other" | null; direction?: "left" | "right" | "center" | null };
export type CardState = "track" | "unconfirmed" | "na";
export type HoleCard = {
  putts: { value: number | null; state: CardState };
  drive: { value: "fairway" | "left" | "right" | "other" | null; state: CardState };
  gir: { value: boolean | null; state: CardState };
};
export type HoleDerived = {
  finished: boolean;
  putts: number | null;
  fir: "fairway" | "other" | null;
  gir: boolean | null;
  lines: string[];
};

/** Putts count strokes that started on the green. FIR and GIR stay empty unless the lie is known. Nothing here is strokes gained. */
export function trackHoleSummary(par: number | null, shots: ShotFact[]): HoleDerived {
  const finished = shots.some(s => s.holed);
  const puttShots = shots.filter(s => !s.penalty && !s.lost && (s.putt || s.originGreen));
  const knowPutts = shots.some(s => s.putt || s.originGreen || s.endLie);
  const putts = !finished ? null : (puttShots.length || knowPutts ? puttShots.length : null);
  const p = par == null ? null : Number(par);
  let fir: HoleDerived["fir"] = null;
  const firApplies = p === 4 || p === 5;
  if (firApplies) {
    const drive = shots.find(s => !s.penalty && !s.lost);
    if (drive?.endLie === "fairway") fir = "fairway";
    else if (drive && drive.endLie) fir = "other";
  }
  const regulation = p != null ? p - 2 : null;
  let gir: boolean | null = null;
  if (regulation != null) {
    let n = 0, greenAt: number | null = null, unknown = false;
    for (const s of shots) {
      n += 1;
      if (s.endLie === "green" && greenAt == null) greenAt = n;
      else if (!s.penalty && s.endLie == null && greenAt == null && n <= regulation) unknown = true;
    }
    if (greenAt != null) gir = greenAt <= regulation;
    else if (n >= regulation && !unknown) gir = false;
  }
  const lines: string[] = [];
  lines.push(putts == null ? "Putts: se confirman al embocar." : `Putts: ${putts}. Solo putts o golpes que salieron del green.`);
  if (p === 3) lines.push("Fairway: un par 3 no lleva.");
  else if (firApplies) lines.push(fir == null ? "Fairway: falta el lugar de la salida." : `Fairway: ${fir === "fairway" ? "fairway" : "otro lado"}.`);
  else lines.push("Fairway: falta el par del hoyo.");
  lines.push(gir == null ? "Green en regulación: falta saber si la pelota llegó al green." : gir ? `Green en regulación: sí, en ${regulation} o menos.` : "Green en regulación: no.");
  if (!finished) lines.push("El hoyo sigue abierto.");
  return { finished, putts, fir: firApplies ? fir : null, gir, lines };
}

/** Per-hole card from TRACK shots. A missing lie stays unconfirmed. A par 3 has no fairway. Nothing here overwrites a manual mark. */
export function deriveHoleCard(par: number | null, shots: ShotFact[]): HoleCard {
  const sum = trackHoleSummary(par, shots);
  const p = par == null || !Number.isFinite(Number(par)) ? null : Number(par);
  const putts = sum.putts == null
    ? { value: null, state: "unconfirmed" as const }
    : { value: sum.putts, state: "track" as const };
  let drive: HoleCard["drive"];
  if (p === 3) drive = { value: null, state: "na" };
  else if (p !== 4 && p !== 5) drive = { value: null, state: "unconfirmed" };
  else {
    const first = shots.find(s => !s.penalty && !s.lost);
    if (!first) drive = { value: null, state: "unconfirmed" };
    else if (first.direction === "left" || first.direction === "right") drive = { value: first.direction, state: "track" };
    else if (first.endLie === "fairway" || first.direction === "center") drive = { value: "fairway", state: "track" };
    else if (first.endLie) drive = { value: "other", state: "track" };
    else drive = { value: null, state: "unconfirmed" };
  }
  const gir = sum.gir == null
    ? { value: null, state: "unconfirmed" as const }
    : { value: sum.gir, state: "track" as const };
  return { putts, drive, gir };
}

const VS_PAR: Record<number, string> = { [-2]: "Águila", [-1]: "Birdie", 0: "Par", 1: "Bogey", 2: "Doble bogey", 3: "Triple bogey" };

/** Closed-hole line. An unknown putt count does not change the stroke total. */
export function holeCloseText(par: number | null, strokes: number, putts: number | null): { line: string; vs: string | null } {
  const n = Math.max(0, Math.round(strokes));
  const puttLine = putts == null ? "Putts sin confirmar" : `${putts} ${putts === 1 ? "putt" : "putts"}`;
  const p = par == null || !Number.isFinite(Number(par)) ? null : Number(par);
  const diff = p == null ? null : n - p;
  const vs = diff == null ? null : (VS_PAR[diff] || (diff > 0 ? `${diff} sobre el par` : `${Math.abs(diff)} bajo el par`));
  return { line: `${n} ${n === 1 ? "golpe" : "golpes"} · ${puttLine}`, vs };
}

/** Copy only the derived fields the card does not already have. A stored value stays. */
export function emptyStatFill(
  stored: { putts?: number | null; gir?: boolean | null; drive?: string | null; rev?: number | null } | null,
  derived: { putts: number | null; gir: boolean | null; fir: "fairway" | "other" | null },
): { putts?: number; gir?: boolean; drive?: string; rev: number } | null {
  const body: { putts?: number; gir?: boolean; drive?: string; rev: number } = { rev: (Number(stored?.rev) || 0) + 1 };
  let n = 0;
  if (derived.putts != null && (stored == null || stored.putts == null)) { body.putts = derived.putts; n++; }
  if (derived.gir != null && (stored == null || stored.gir == null)) { body.gir = derived.gir; n++; }
  if (derived.fir && (stored == null || stored.drive == null)) { body.drive = derived.fir; n++; }
  return n ? body : null;
}

export type BagClubOption = { id: string; label: string };

/** Accepts the bag API (`{club,carry,total}` or a name string) and `{code,label}` rows. Drops blanks. Does not invent a club. */
export function bagClubs(raw: unknown): BagClubOption[] {
  const list = Array.isArray(raw) ? raw : [];
  const out: BagClubOption[] = [];
  const seen = new Set<string>();
  for (const item of list) {
    const text = typeof item === "string" ? item.trim() : "";
    const row = item && typeof item === "object" ? item as Record<string, unknown> : null;
    const id = String(row ? (row.code || row.id || row.club || row.name || row.label || "") : text).trim();
    if (!id || seen.has(id.toLowerCase())) continue;
    seen.add(id.toLowerCase());
    const label = String(row ? (row.label || row.club || row.name || id) : text || id).trim() || id;
    out.push({ id, label });
  }
  return out;
}

export function isDriverClub(id: string, label = ""): boolean {
  return /^(dr|driver|d)$/i.test(id.trim()) || /^driver\b/i.test(label.trim());
}

/** Driver on a par 4 or 5 tee shot only when that club is in the bag and the player has not already chosen. */
export function teeClub(bag: unknown, par: unknown, chosen: unknown, fromTee: boolean): string {
  const pick = String(chosen ?? "").trim();
  if (pick) return pick;
  if (!fromTee) return "";
  const n = typeof par === "number" ? par : Number(par);
  if (n !== 4 && n !== 5) return "";
  const hit = bagClubs(bag).find(c => isDriverClub(c.id, c.label));
  return hit?.id || "";
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
export function trackEnter(state: TrackState, at: LL, club: string | null, cup: boolean, snapToFlag = false): { state: TrackState; recorded: boolean; holed: boolean } {
  const next = copyState(state);
  if (state.phase === "tracking") {
    const holed = !!cup;
    const spot = holed && snapToFlag && state.flag ? { ...state.flag } : { ...at };
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
/** Stroke and distance. The ball last seen stays as a lost stroke. The next ball is back at its start, and the following stroke is the third. */
export function trackLost(state: TrackState, at: LL, club: string | null): TrackState {
  if (state.phase !== "tracking" && state.phase !== "penaltyWhere") return state;
  const next = copyState(state);
  const origin = state.ball || state.tee;
  next.marks.push({ id: next.nextID, lat: at.lat, lng: at.lng, club, countsStroke: true, holed: false, penalty: false, drop: false, lost: true });
  next.nextID += 1;
  next.marks.push({ id: next.nextID, lat: at.lat, lng: at.lng, club: null, countsStroke: true, holed: false, penalty: true, drop: false });
  next.nextID += 1;
  next.ball = origin ? { ...origin } : next.ball;
  next.phase = "tracking";
  return next;
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
