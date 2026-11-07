/* Generated from lib/play-rules.ts by web-build/gen-play-rules.mjs. Do not edit. */
(function (root) {
  var exports = {};
"use strict";
/** Pure play rules shared by the web client, the metric API and the tests.
 *  Meteorological wind is where it comes FROM. A shot is holed only on the cup. */
Object.defineProperty(exports, "__esModule", { value: true });
exports.HI_UNIDENTIFIED = exports.MES_FULL = exports.MES = exports.MONTHS_VISIBLE = exports.PUTT_M = exports.CUP_M = void 0;
exports.bearingDeg = bearingDeg;
exports.windRelative = windRelative;
exports.windPlay = windPlay;
exports.onCup = onCup;
exports.puttFeet = puttFeet;
exports.trackNew = trackNew;
exports.trackSet = trackSet;
exports.trackEnter = trackEnter;
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
exports.CUP_M = 1.2;
exports.PUTT_M = 25;
exports.MONTHS_VISIBLE = 6;
exports.MES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
exports.MES_FULL = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const norm = (d) => ((d % 360) + 360) % 360;
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
function trackEnter(state, at, club, cup) {
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

  root.GolfletRules = exports;
  if (typeof module === "object" && module.exports) module.exports = exports;
})(typeof globalThis !== "undefined" ? globalThis : this);
