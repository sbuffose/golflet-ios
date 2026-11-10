/* Generated from lib/play-rules.ts by web-build/gen-play-rules.mjs. Do not edit. */
(function (root) {
  var exports = {};
"use strict";
/** Pure play rules shared by the web client, the metric API and the tests.
 *  Meteorological wind is where it comes FROM. A shot is holed only on the cup. */
Object.defineProperty(exports, "__esModule", { value: true });
exports.HI_UNIDENTIFIED = exports.VISUAL_ZOOM_MAX = exports.ESRI_BLANK_TILE_SHA256 = exports.IMAGERY_ZOOM_MAX = exports.MES_FULL = exports.MES = exports.MONTHS_VISIBLE = exports.PUTT_M = exports.CUP_M = void 0;
exports.knownPoint = knownPoint;
exports.projectLL = projectLL;
exports.holeSpan = holeSpan;
exports.unprojectLL = unprojectLL;
exports.frameAdvance = frameAdvance;
exports.frameHole = frameHole;
exports.screenOf = screenOf;
exports.worldTile = worldTile;
exports.bearingDeg = bearingDeg;
exports.windRelative = windRelative;
exports.windPlay = windPlay;
exports.onCup = onCup;
exports.puttFeet = puttFeet;
exports.puttMeters = puttMeters;
exports.isPutterClub = isPutterClub;
exports.yardNumber = yardNumber;
exports.yardLabel = yardLabel;
exports.shotDistanceLabel = shotDistanceLabel;
exports.trackHoleSummary = trackHoleSummary;
exports.deriveHoleCard = deriveHoleCard;
exports.holeCloseText = holeCloseText;
exports.emptyStatFill = emptyStatFill;
exports.bagClubs = bagClubs;
exports.isDriverClub = isDriverClub;
exports.teeClub = teeClub;
exports.trackNew = trackNew;
exports.trackSet = trackSet;
exports.trackEnter = trackEnter;
exports.trackLost = trackLost;
exports.trackPenalty = trackPenalty;
exports.trackReload = trackReload;
exports.trackDrop = trackDrop;
exports.trackCancel = trackCancel;
exports.monthColumns = monthColumns;
exports.coursePickerGroups = coursePickerGroups;
exports.strategyChoice = strategyChoice;
exports.officialIndex = officialIndex;
exports.hiCardLine = hiCardLine;
exports.hiAttribution = hiAttribution;
exports.matchRoundCourse = matchRoundCourse;
/** Same rule as validLatLng: a blank endpoint is unknown, a numeric zero is real, and (0, 0) is not a point. */
function knownPoint(lat, lng) {
    const a = knownCoord(lat), b = knownCoord(lng);
    if (a == null || b == null || Math.abs(a) > 90 || Math.abs(b) > 180 || (a === 0 && b === 0))
        return null;
    return { lat: a, lng: b };
}
function knownCoord(value) {
    if (typeof value === "number")
        return Number.isFinite(value) ? value : null;
    if (typeof value === "string") {
        const text = value.trim();
        if (!text || !/^[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[-+]?\d+)?$/i.test(text))
            return null;
        const n = Number(text);
        return Number.isFinite(n) ? n : null;
    }
    return null;
}
exports.CUP_M = 1.2;
exports.PUTT_M = 25;
exports.MONTHS_VISIBLE = 6;
exports.MES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
exports.MES_FULL = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const norm = (d) => ((d % 360) + 360) % 360;
/** Esri World Imagery at Cancha Vieja hole 1 serves real golf pixels through zoom 17.
 *  Zoom 18 and 19 answer HTTP 200 with the grey "Map data not yet available" tile. */
exports.IMAGERY_ZOOM_MAX = 17;
/** Byte-identical Esri JPEG served with HTTP 200 for "Map data not yet available". */
exports.ESRI_BLANK_TILE_SHA256 = "9eafd300d61393184a4abc1d458564cfd1cd9b6f9c4e9c74687045c0a0e5b858";
function projectLL(lat, lng) {
    const x = (lng + 180) / 360;
    const s = Math.sin(lat * Math.PI / 180);
    const y = 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI);
    return [x, y];
}
function havMeters(a, b) {
    if (![a.lat, a.lng, b.lat, b.lng].every(Number.isFinite))
        return null;
    const Re = 6371000, t = (x) => x * Math.PI / 180, dLa = t(b.lat - a.lat), dLo = t(b.lng - a.lng);
    const h = Math.sin(dLa / 2) ** 2 + Math.cos(t(a.lat)) * Math.cos(t(b.lat)) * Math.sin(dLo / 2) ** 2;
    return 2 * Re * Math.asin(Math.sqrt(h));
}
/** A hole axis exists only when both ends are known and the distance is one hole. Nothing is invented. */
function holeSpan(tee, flag) {
    const a = tee ? knownPoint(tee.lat, tee.lng) : null;
    const b = flag ? knownPoint(flag.lat, flag.lng) : null;
    if (!a || !b || (a.lat === b.lat && a.lng === b.lng))
        return null;
    const meters = havMeters(a, b);
    const bearing = bearingDeg(a, b);
    if (meters == null || bearing == null || meters < 40 || meters > 700)
        return null;
    return { meters, bearing };
}
/** Visual zoom may scale the last real tile by up to three levels. The tile request stays on a real zoom. */
exports.VISUAL_ZOOM_MAX = exports.IMAGERY_ZOOM_MAX + 3;
const clampNum = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
function pointFrame(p, mode, z = exports.IMAGERY_ZOOM_MAX) {
    const [cx, cy] = projectLL(p.lat, p.lng);
    return { mode, z, cx, cy, bearing: null, aimLat: p.lat, aimLng: p.lng };
}
function unprojectLL(x, y) {
    const lng = x * 360 - 180;
    const n = Math.PI - 2 * Math.PI * y;
    const lat = Math.atan(Math.sinh(n)) * 180 / Math.PI;
    return { lat, lng };
}
/** Play camera: ball toward the bottom, flag toward the top, reticle between them.
 *  The bearing is the geographic ball→flag direction. It is a framing choice checked
 *  against the screen, not a claim about another app's camera equation.
 *  Zoom never asks for a tile past the last real imagery; a short putt may scale that tile. */
function frameAdvance(origin, target, view) {
    const a = knownPoint(origin.lat, origin.lng);
    const b = knownPoint(target.lat, target.lng);
    if (!a || !b)
        return null;
    const bearing = bearingDeg(a, b);
    const [ox, oy] = projectLL(a.lat, a.lng);
    const [tx, ty] = projectLL(b.lat, b.lng);
    const dist = Math.hypot(tx - ox, ty - oy);
    if (bearing == null || !(dist > 0))
        return pointFrame(a, "play");
    const height = Math.max(1, view?.height || 844);
    const spanPx = Math.max(120, height * 0.52);
    const z = clampNum(Math.log2(spanPx / (dist * 256)), 15.5, exports.VISUAL_ZOOM_MAX);
    const frac = 0.32 / 0.52;
    const cx = ox + (tx - ox) * frac;
    const cy = oy + (ty - oy) * frac;
    const aim = unprojectLL(cx, cy);
    return { mode: "play", z, cx, cy, bearing, aimLat: aim.lat, aimLng: aim.lng };
}
/** Overview puts the reticle on the flag, tee down-screen. Tee and flag cameras move to that end. */
function frameHole(tee, flag, mode, view, ball) {
    const a = tee ? knownPoint(tee.lat, tee.lng) : null;
    const b = flag ? knownPoint(flag.lat, flag.lng) : null;
    const span = holeSpan(a, b);
    const height = Math.max(1, view?.height || 844);
    if (!span || !a || !b) {
        if (a && b)
            return null;
        if (mode === "tee")
            return a ? pointFrame(a, "tee") : (b ? pointFrame(b, "seek", 16) : null);
        if (mode === "flag")
            return b ? pointFrame(b, "flag", exports.VISUAL_ZOOM_MAX) : (a ? pointFrame(a, "seek", 16) : null);
        if (mode === "seek")
            return (b || a) ? pointFrame((b || a), "seek", 16) : null;
        const only = a || b;
        return only ? pointFrame(only, "point") : null;
    }
    const [fx, fy] = projectLL(b.lat, b.lng);
    const [tx, ty] = projectLL(a.lat, a.lng);
    const dist = Math.hypot(tx - fx, ty - fy);
    if (!(dist > 0))
        return null;
    const overviewZ = clampNum(Math.log2(Math.max(96, height * 0.36) / (dist * 256)), 15, exports.IMAGERY_ZOOM_MAX + 0.8);
    const teeZ = clampNum(Math.max(overviewZ + 1.15, exports.IMAGERY_ZOOM_MAX + 0.6), 16, exports.VISUAL_ZOOM_MAX);
    const flagZ = exports.VISUAL_ZOOM_MAX;
    if (mode === "flag")
        return { mode, z: flagZ, cx: fx, cy: fy, bearing: span.bearing, aimLat: b.lat, aimLng: b.lng };
    if (mode === "tee")
        return { mode, z: teeZ, cx: tx, cy: ty, bearing: span.bearing, aimLat: a.lat, aimLng: a.lng };
    if (mode === "play")
        return frameAdvance(ball ? knownPoint(ball.lat, ball.lng) || a : a, b, view);
    return { mode: "overview", z: overviewZ, cx: fx, cy: fy, bearing: span.bearing, aimLat: b.lat, aimLng: b.lng };
}
function screenOf(lat, lng, cam, view) {
    const p = knownPoint(lat, lng);
    if (!p)
        return null;
    const [x, y] = projectLL(p.lat, p.lng);
    const n = 2 ** cam.z;
    const px = (x - cam.cx) * n * 256, py = (y - cam.cy) * n * 256;
    const rad = -(cam.bearing || 0) * Math.PI / 180, c = Math.cos(rad), s = Math.sin(rad);
    return [view.width / 2 + px * c - py * s, view.height * 0.42 + px * s + py * c];
}
function worldTile(lat, lng, z) {
    const p = knownPoint(lat, lng);
    if (!p)
        return null;
    const zi = Math.max(0, Math.min(exports.IMAGERY_ZOOM_MAX, Math.floor(z)));
    const n = 2 ** zi;
    const [x, y] = projectLL(p.lat, p.lng);
    const tx = Math.floor(x * n), ty = Math.floor(y * n);
    if (!Number.isFinite(tx) || !Number.isFinite(ty))
        return null;
    return { z: zi, x: tx, y: ty };
}
function bearingDeg(a, b) {
    if (!a || !b || !Number.isFinite(a.lat) || !Number.isFinite(a.lng) || !Number.isFinite(b.lat) || !Number.isFinite(b.lng))
        return null;
    const t = (x) => x * Math.PI / 180, dLo = t(b.lng - a.lng);
    const y = Math.sin(dLo) * Math.cos(t(b.lat));
    const x = Math.cos(t(a.lat)) * Math.sin(t(b.lat)) - Math.sin(t(a.lat)) * Math.cos(t(b.lat)) * Math.cos(dLo);
    return norm(Math.atan2(y, x) * 180 / Math.PI);
}
/** Wind FROM the direction of play is into the face. Missing bearing or direction stays unclassified. */
function windRelative(fromDeg, bearing) {
    if (fromDeg == null || bearing == null || !Number.isFinite(+fromDeg) || !Number.isFinite(+bearing))
        return "unavailable";
    const delta = norm(+fromDeg - +bearing);
    if (delta < 45 || delta >= 315)
        return "contra";
    if (delta >= 135 && delta < 225)
        return "favor";
    return "cruzado";
}
function windPlay(hole, fromDeg, bearing, speedKmh) {
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
function onCup(meters) {
    return Number.isFinite(meters) && meters >= 0 && meters <= exports.CUP_M;
}
function puttFeet(meters) {
    if (!Number.isFinite(meters) || meters <= exports.CUP_M || meters > exports.PUTT_M)
        return null;
    return Math.round(meters * 3.28084);
}
/** A putt the player types. Comma or dot. The map estimate is not rewritten to match it. */
function puttMeters(value) {
    let n;
    if (typeof value === "number")
        n = value;
    else if (typeof value === "string") {
        const text = value.trim().replace(",", ".");
        if (!/^\d+(?:\.\d+)?$/.test(text))
            return null;
        n = Number(text);
    }
    else
        return null;
    if (!Number.isFinite(n) || n < 0.1 || n > 50)
        return null;
    return Math.round(n * 10) / 10;
}
function isPutterClub(id, label = "") {
    return /^(pt|putter)$/i.test(id.trim()) || /^putter\b/i.test(String(label || "").trim());
}
/** A scorecard stores yards as a number or as a tee map ({ BLANCO: 445 }). Never stringify the object. */
function yardNumber(value) {
    if (typeof value === "number")
        return Number.isFinite(value) && value >= 0 && value < 1000 ? Math.round(value) : null;
    if (typeof value === "string") {
        const text = value.trim();
        const match = text.match(/^(\d+(?:[.,]\d+)?)/);
        if (!match)
            return null;
        const n = Number(match[1].replace(",", "."));
        return Number.isFinite(n) && n >= 0 && n < 1000 ? Math.round(n) : null;
    }
    if (value && typeof value === "object") {
        const nums = Object.values(value).map(yardNumber).filter((n) => n != null);
        return nums.length ? Math.max(...nums) : null;
    }
    return null;
}
function yardLabel(value) {
    const n = yardNumber(value);
    return n == null ? "" : `${n} yd`;
}
const EARTH_M = 6371008.8;
function metersBetween(a, b) {
    const rad = (d) => d * Math.PI / 180;
    const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * EARTH_M * Math.asin(Math.min(1, Math.sqrt(h)));
}
const fmtM = (m) => (Math.round(m * 10) / 10).toFixed(1).replace(".", ",");
/**
 * Yards are the tee-or-origin to the endpoint. A putt is an origin on the green, or a distance the player typed.
 * A long shot whose stored lie is the landing is not a putt. The card length is never the shot.
 */
function shotDistanceLabel(shot) {
    if (shot.penalty)
        return { text: "", yards: null, meters: null, kind: "penalty" };
    const start = knownPoint(shot.lat, shot.lng);
    const end = knownPoint(shot.end_lat, shot.end_lng);
    const prev = knownPoint(shot.prev_lat, shot.prev_lng);
    let from = start, to = end;
    if ((!from || !to) && prev) {
        if (!to && from && metersBetween(prev, from) > 3) {
            to = from;
            from = prev;
        }
        else if (to && !from)
            from = prev;
        else if (!to && !from) { /* still missing */ }
    }
    const flown = from && to ? metersBetween(from, to) : null;
    if (shot.distance_kind === "manual") {
        const typed = puttMeters(shot.distance_m);
        if (typed == null)
            return { text: "Sin metros", yards: null, meters: null, kind: "manual" };
        return { text: `${fmtM(typed)} m a mano`, yards: null, meters: typed, kind: "manual" };
    }
    const originGreen = shot.lie === "green" && (flown == null || flown <= 50);
    if (originGreen) {
        const meters = flown != null ? Math.round(flown * 10) / 10 : (typeof shot.distance_m === "number" && shot.distance_m > 0 && shot.distance_m <= 50 ? Math.round(shot.distance_m * 10) / 10 : null);
        if (meters == null)
            return { text: "Sin ubicación", yards: null, meters: null, kind: "missing" };
        return { text: `${fmtM(meters)} m`, yards: null, meters, kind: "putt" };
    }
    if (flown != null) {
        const yards = Math.round(flown / 0.9144);
        return { text: `${yards} yd`, yards, meters: Math.round(flown * 10) / 10, kind: "yards" };
    }
    return { text: "Sin ubicación", yards: null, meters: null, kind: "missing" };
}
/** Putts count strokes that started on the green. FIR and GIR stay empty unless the lie is known. Nothing here is strokes gained. */
function trackHoleSummary(par, shots) {
    const finished = shots.some(s => s.holed);
    const puttShots = shots.filter(s => !s.penalty && !s.lost && (s.putt || s.originGreen));
    const knowPutts = shots.some(s => s.putt || s.originGreen || s.endLie);
    const putts = !finished ? null : (puttShots.length || knowPutts ? puttShots.length : null);
    const p = par == null ? null : Number(par);
    let fir = null;
    const firApplies = p === 4 || p === 5;
    if (firApplies) {
        const drive = shots.find(s => !s.penalty && !s.lost);
        if (drive?.endLie === "fairway")
            fir = "fairway";
        else if (drive && drive.endLie)
            fir = "other";
    }
    const regulation = p != null ? p - 2 : null;
    let gir = null;
    if (regulation != null) {
        let n = 0, greenAt = null, unknown = false;
        for (const s of shots) {
            n += 1;
            if (s.endLie === "green" && greenAt == null)
                greenAt = n;
            else if (!s.penalty && s.endLie == null && greenAt == null && n <= regulation)
                unknown = true;
        }
        if (greenAt != null)
            gir = greenAt <= regulation;
        else if (n >= regulation && !unknown)
            gir = false;
    }
    const lines = [];
    lines.push(putts == null ? "Putts: se confirman al embocar." : `Putts: ${putts}. Solo putts o golpes que salieron del green.`);
    if (p === 3)
        lines.push("Fairway: un par 3 no lleva.");
    else if (firApplies)
        lines.push(fir == null ? "Fairway: falta el lugar de la salida." : `Fairway: ${fir === "fairway" ? "fairway" : "otro lado"}.`);
    else
        lines.push("Fairway: falta el par del hoyo.");
    lines.push(gir == null ? "Green en regulación: falta saber si la pelota llegó al green." : gir ? `Green en regulación: sí, en ${regulation} o menos.` : "Green en regulación: no.");
    if (!finished)
        lines.push("El hoyo sigue abierto.");
    return { finished, putts, fir: firApplies ? fir : null, gir, lines };
}
/** Per-hole card from TRACK shots. A missing lie stays unconfirmed. A par 3 has no fairway. Nothing here overwrites a manual mark. */
function deriveHoleCard(par, shots) {
    const sum = trackHoleSummary(par, shots);
    const p = par == null || !Number.isFinite(Number(par)) ? null : Number(par);
    const putts = sum.putts == null
        ? { value: null, state: "unconfirmed" }
        : { value: sum.putts, state: "track" };
    let drive;
    if (p === 3)
        drive = { value: null, state: "na" };
    else if (p !== 4 && p !== 5)
        drive = { value: null, state: "unconfirmed" };
    else {
        const first = shots.find(s => !s.penalty && !s.lost);
        if (!first)
            drive = { value: null, state: "unconfirmed" };
        else if (first.direction === "left" || first.direction === "right")
            drive = { value: first.direction, state: "track" };
        else if (first.endLie === "fairway" || first.direction === "center")
            drive = { value: "fairway", state: "track" };
        else if (first.endLie)
            drive = { value: "other", state: "track" };
        else
            drive = { value: null, state: "unconfirmed" };
    }
    const gir = sum.gir == null
        ? { value: null, state: "unconfirmed" }
        : { value: sum.gir, state: "track" };
    return { putts, drive, gir };
}
const VS_PAR = { [-2]: "Águila", [-1]: "Birdie", 0: "Par", 1: "Bogey", 2: "Doble bogey", 3: "Triple bogey" };
/** Closed-hole line. Putts stay unconfirmed when no shot is a putter or started on the green. */
function holeCloseText(par, strokes, putts) {
    const n = Math.max(0, Math.round(strokes));
    const puttLine = putts == null ? "Putts sin confirmar" : `${putts} ${putts === 1 ? "putt" : "putts"}`;
    const p = par == null || !Number.isFinite(Number(par)) ? null : Number(par);
    const diff = p == null ? null : n - p;
    const vs = diff == null ? null : (VS_PAR[diff] || (diff > 0 ? `${diff} sobre el par` : `${Math.abs(diff)} bajo el par`));
    return { line: `${n} ${n === 1 ? "golpe" : "golpes"} · ${puttLine}`, vs };
}
/** Copy only the derived fields the card does not already have. A stored value stays. */
function emptyStatFill(stored, derived) {
    const body = { rev: (Number(stored?.rev) || 0) + 1 };
    let n = 0;
    if (derived.putts != null && (stored == null || stored.putts == null)) {
        body.putts = derived.putts;
        n++;
    }
    if (derived.gir != null && (stored == null || stored.gir == null)) {
        body.gir = derived.gir;
        n++;
    }
    if (derived.fir && (stored == null || stored.drive == null)) {
        body.drive = derived.fir;
        n++;
    }
    return n ? body : null;
}
/** Accepts the bag API (`{club,carry,total}` or a name string) and `{code,label}` rows. Drops blanks. Does not invent a club. */
function bagClubs(raw) {
    const list = Array.isArray(raw) ? raw : [];
    const out = [];
    const seen = new Set();
    for (const item of list) {
        const text = typeof item === "string" ? item.trim() : "";
        const row = item && typeof item === "object" ? item : null;
        const id = String(row ? (row.code || row.id || row.club || row.name || row.label || "") : text).trim();
        if (!id || seen.has(id.toLowerCase()))
            continue;
        seen.add(id.toLowerCase());
        const label = String(row ? (row.label || row.club || row.name || id) : text || id).trim() || id;
        out.push({ id, label });
    }
    return out;
}
function isDriverClub(id, label = "") {
    return /^(dr|driver|d)$/i.test(id.trim()) || /^driver\b/i.test(label.trim());
}
/** Driver on a par 4 or 5 tee shot only when that club is in the bag and the player has not already chosen. */
function teeClub(bag, par, chosen, fromTee) {
    const pick = String(chosen ?? "").trim();
    if (pick)
        return pick;
    if (!fromTee)
        return "";
    const n = typeof par === "number" ? par : Number(par);
    if (n !== 4 && n !== 5)
        return "";
    const hit = bagClubs(bag).find(c => isDriverClub(c.id, c.label));
    return hit?.id || "";
}
function copyState(s) {
    return { ...s, tee: s.tee ? { ...s.tee } : null, flag: s.flag ? { ...s.flag } : null, ball: s.ball ? { ...s.ball } : null, marks: s.marks.map(m => ({ ...m })) };
}
function trackNew() {
    return { phase: "confirmTee", tee: null, flag: null, ball: null, marks: [], nextID: 1 };
}
function trackSet(state, at) {
    const next = copyState(state);
    if (state.phase === "confirmTee") {
        next.tee = { ...at };
        next.ball = { ...at };
        next.phase = "confirmFlag";
    }
    else if (state.phase === "confirmFlag") {
        next.flag = { ...at };
        next.phase = "tracking";
    }
    else if (state.phase === "drop") {
        next.ball = { ...at };
        next.marks.push({ id: next.nextID, lat: at.lat, lng: at.lng, club: null, countsStroke: false, holed: false, penalty: false, drop: true });
        next.nextID += 1;
        next.phase = "tracking";
    }
    return next;
}
function trackEnter(state, at, club, cup, snapToFlag = false) {
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
function trackLost(state, at, club) {
    if (state.phase !== "tracking" && state.phase !== "penaltyWhere")
        return state;
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
function trackPenalty(state) {
    if (state.phase !== "tracking")
        return state;
    const next = copyState(state);
    next.phase = "penaltyWhere";
    return next;
}
function trackReload(state) {
    if (state.phase !== "relief")
        return state;
    const next = copyState(state);
    const prior = [...state.marks].reverse().find(m => m.countsStroke && !m.penalty);
    next.ball = prior ? { lat: prior.lat, lng: prior.lng } : (state.tee ? { ...state.tee } : state.ball);
    next.phase = "tracking";
    return next;
}
function trackDrop(state) {
    if (state.phase !== "relief")
        return state;
    const next = copyState(state);
    next.phase = "drop";
    return next;
}
function trackCancel(state) {
    const next = copyState(state);
    if (state.phase === "penaltyWhere") {
        next.phase = "tracking";
        return next;
    }
    if (state.phase === "relief" || state.phase === "drop") {
        if (next.marks.length && next.marks[next.marks.length - 1].penalty)
            next.marks.pop();
        next.phase = "tracking";
        return next;
    }
    return state;
}
function monthColumns(rows) {
    const ordered = rows.filter(r => /^\d{4}-\d{2}$/.test(r.month)).slice().sort((a, b) => a.month < b.month ? -1 : a.month > b.month ? 1 : 0);
    return ordered.map((r, i) => {
        const year = +r.month.slice(0, 4), month = +r.month.slice(5, 7);
        const prev = i ? +ordered[i - 1].month.slice(0, 4) : null;
        const full = `${exports.MES_FULL[month - 1] || ""} ${year}`.trim();
        const birdie = r.birdies === 1 ? "1 birdie" : `${r.birdies} birdies`;
        const par = r.pars === 1 ? "1 par" : `${r.pars} pares`;
        return { id: r.month, year, month, birdies: r.birdies, pars: r.pars, shortLabel: exports.MES[month - 1] || "", showsYear: prev !== year, fullLabel: full, detail: `${full} · ${birdie} · ${par}` };
    });
}
const fold = (s) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
function coursePickerGroups(courses) {
    const groups = [];
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
        if (g.rows.length === 1 && fold(g.rows[0].name) === fold(g.club))
            g.rows[0] = { ...g.rows[0], name: "Jugar esta cancha" };
    }
    return groups;
}
function strategyChoice(variants, level, general) {
    const v = variants || {};
    if (!level)
        return { missing: false, plan: general.plan || "", club: general.tee_club || "" };
    const key = level === "bajo" ? (v.bajo ? "bajo" : (v.scratch ? "scratch" : "")) : (v[level] ? level : "");
    const label = level === "bajo" ? "hándicap bajo" : level === "medio" ? "hándicap medio" : level === "alto" ? "hándicap alto" : level;
    const hit = key ? v[key] : null;
    if (!hit)
        return { missing: true, plan: `No hay un plan verificado para ${label}.`, club: "" };
    return { missing: !hit.plan, plan: hit.plan || `No hay un plan verificado para ${label}.`, club: hit.tee_club || "" };
}
function officialIndex(player, history) {
    const dated = (history || []).filter(h => h && h.hi != null && h.date);
    if (!dated.length)
        return player == null || !Number.isFinite(+player) ? null : +player;
    let best = dated[0], at = 0;
    dated.forEach((h, i) => { if (h.date > best.date || (h.date === best.date && i >= at)) {
        best = h;
        at = i;
    } });
    return +best.hi;
}
exports.HI_UNIDENTIFIED = "No puedo identificar la tarjeta.";
const HI_MES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
function hiCardLine(card) {
    const [y, m, d] = String(card.date).slice(0, 10).split("-");
    const bits = [`${+d} ${HI_MES[+m - 1] || ""} ${y}`.replace(/\s+/g, " ").trim()];
    const course = String(card.course || "").trim();
    if (course)
        bits.push(course);
    const diff = (Math.round(card.differential * 10) / 10).toFixed(1).replace(".", ",");
    bits.push(`diferencial ${diff}`);
    if (card.gross != null && Number.isFinite(+card.gross))
        bits.push(`gross ${card.gross}`);
    return bits.join(" · ");
}
function best8(cards) {
    return cards.map((c, i) => ({ c, i })).sort((a, b) => a.c.differential - b.c.differential || (a.c.date < b.c.date ? 1 : a.c.date > b.c.date ? -1 : b.i - a.i)).slice(0, 8).map(x => x.c);
}
const emptyShift = () => ({ verified: false, enteredBest8: [], leftBest8: [], agedOut: [], enteredWindow: [] });
/** Best 8 of each date's last 20. A course name is never enough, and the registration club is never a card. */
function hiAttribution(D, prevDate, date) {
    if (!prevDate)
        return emptyShift();
    const all = (D.rounds || [])
        .filter((r) => r.valid_card && !r.is_9_holes && r.differential_computed != null && r.date)
        .map((r) => ({
        id: String(r.round_id ?? r.id),
        date: String(r.date).slice(0, 10),
        course: String((r.course_label && String(r.course_label).trim()) || (r.course && String(r.course).trim()) || "").trim(),
        differential: +r.differential_computed,
        gross: r.gross == null || r.gross === "" ? null : +r.gross,
    }))
        .sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : a.id < b.id ? -1 : 1);
    const upTo = (d) => all.filter(c => c.date <= d);
    const prevPool = upTo(prevDate).slice(-20);
    const curPool = upTo(date).slice(-20);
    if (prevPool.length < 20 || curPool.length < 20)
        return emptyShift();
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
const foldCourse = (value) => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
const courseWords = (course) => [course.course, course.course_label, course.label, course.vm_course, ...(course.course_aliases || []), ...(course.aliases || [])].map(foldCourse).filter(Boolean);
const clubWords = (course) => [course.club_name, course.club, ...(course.club_aliases || [])].map(foldCourse).filter(Boolean);
const clubCodesOf = (course) => {
    const codes = [String(course.club_code || "").trim()];
    const id = String(course.course_id || "").trim();
    const prefix = /^(\d{1,5})-/.exec(id);
    if (prefix)
        codes.push(prefix[1]);
    return [...new Set(codes.filter(Boolean))];
};
/** A round with a club only opens that club's geometry. A unique course name is enough only when the round names no club. */
function matchRoundCourse(official, courses) {
    const wanted = foldCourse(official?.course);
    if (!wanted)
        return null;
    const named = (courses || []).filter(course => courseWords(course).includes(wanted));
    const roundCode = String(official?.club_code || "").trim();
    const roundClub = foldCourse(official?.club_name);
    const roundId = String(official?.course_id || "").trim();
    if (!roundCode && !roundClub && !roundId)
        return named.length === 1 ? named[0] : null;
    const agreed = named.filter(course => {
        if (roundId && course.course_id && roundId !== String(course.course_id))
            return false;
        const codes = clubCodesOf(course);
        if (roundCode && codes.length && codes.some(code => code !== roundCode))
            return false;
        const names = clubWords(course);
        if (roundClub && names.length && !names.includes(roundClub)) {
            return !!(roundCode && codes.length && codes.every(code => code === roundCode));
        }
        if (roundCode && codes.length && codes.every(code => code === roundCode))
            return true;
        if (roundClub && names.includes(roundClub))
            return true;
        return false;
    });
    return agreed.length === 1 ? agreed[0] : null;
}

  root.GolfletRules = exports;
  if (typeof module === "object" && module.exports) module.exports = exports;
})(typeof globalThis !== "undefined" ? globalThis : this);
