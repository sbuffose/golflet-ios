/* Generated from lib/match-core.ts by web-build/gen-match-core.mjs. Do not edit. */
"use strict";
var GolfletMatchCore = (() => {
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

  // lib/match-core.ts
  var match_core_exports = {};
  __export(match_core_exports, {
    DEFAULT_ALLOWANCE: () => DEFAULT_ALLOWANCE,
    HOLES: () => HOLES,
    aggregate: () => aggregate,
    courseHandicap: () => courseHandicap,
    evaluate: () => evaluate,
    holeStrokes: () => holeStrokes,
    marksOf: () => marksOf,
    matchPlay: () => matchPlay,
    myOutcome: () => myOutcome,
    normName: () => normName,
    playOrder: () => playOrder,
    playerKey: () => playerKey,
    playingHcp: () => playingHcp,
    roundHalfUp: () => roundHalfUp,
    siOrder: () => siOrder,
    statusText: () => statusText,
    strokesReceived: () => strokesReceived,
    teeOf: () => teeOf
  });
  var marksOf = (s) => s && typeof s === "object" && s._m && typeof s._m === "object" ? s._m : {};
  var HOLES = 18;
  var DEFAULT_ALLOWANCE = { fourball: 85, single: 100, metralleta: 100 };
  function roundHalfUp(x) {
    const c = Math.round(x * 1e6) / 1e6;
    return Math.floor(c + 0.5);
  }
  function strokesReceived(hcps, allowance) {
    if (!hcps.length) return [];
    const low = Math.min(...hcps);
    return hcps.map((h) => roundHalfUp((h - low) * allowance / 100));
  }
  function siOrder(si) {
    const idx = Array.from({ length: HOLES }, (_, i) => i);
    return idx.sort((a, b) => {
      const x = si[a], y = si[b];
      if (x != null && y != null) return x - y || a - b;
      if (x != null) return -1;
      if (y != null) return 1;
      return a - b;
    });
  }
  function holeStrokes(s, si) {
    const out = new Array(HOLES).fill(0);
    if (!(s > 0)) return out;
    const base = Math.floor(s / HOLES), extra = s % HOLES, ord = siOrder(si);
    ord.forEach((h, r) => {
      out[h] = base + (r < extra ? 1 : 0);
    });
    return out;
  }
  function courseHandicap(index, t) {
    if (index == null || !t || !(Number(t.slope) > 0) || !Number.isFinite(Number(t.course_rating)) || !(Number(t.par) > 0)) return null;
    return roundHalfUp(index * Number(t.slope) / 113 + (Number(t.course_rating) - Number(t.par)));
  }
  function teeOf(def, p) {
    if (!def.tees?.length || !p.tee) return null;
    const k = p.tee.toLowerCase(), g = p.gender || "C";
    return def.tees.find((t) => t.tee.toLowerCase() === k && (t.gender || "C") === g) || def.tees.find((t) => t.tee.toLowerCase() === k && !t.gender) || null;
  }
  function playingHcp(def, p) {
    const t = teeOf(def, p), ch = courseHandicap(p.hcp, t);
    if (ch != null) return { index: p.hcp, tee: t.tee, course_handicap: ch, base: ch, source: "course", note: null };
    if (p.hcp == null) return { index: null, tee: p.tee ?? null, course_handicap: null, base: null, source: "none", note: "sin h\xE1ndicap" };
    const why = !def.tees?.length ? null : !p.tee ? "sin salida elegida: juega con el \xEDndice" : !t ? "esa salida no est\xE1 en los datos del club: juega con el \xEDndice" : "la salida no tiene slope / course rating / par: juega con el \xEDndice";
    return { index: p.hcp, tee: p.tee ?? null, course_handicap: null, base: p.hcp, source: "index", note: why };
  }
  function playOrder(start = 1) {
    const s = start >= 1 && start <= HOLES ? start - 1 : 0;
    return Array.from({ length: HOLES }, (_, k) => (s + k) % HOLES);
  }
  var hasScore = (v) => typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 20;
  function statusText(up, remaining, finished) {
    const m = Math.abs(up);
    if (finished) return m === 0 ? "Empate" : remaining > 0 ? `${m}&${remaining}` : `${m} arriba`;
    if (m === 0) return "All square";
    return m === remaining ? `Dormie (${m} arriba)` : `${m} arriba`;
  }
  function matchPlay(A, B, scores, strokes, start = 1, conc = [], done = []) {
    const all = [...A, ...B], holes = [];
    let up = 0, played = 0, closed = false;
    const best = (side, h) => {
      const v = side.map((id) => {
        const g = scores[id]?.[h];
        return hasScore(g) && g > 0 ? g - (strokes[id]?.[h] || 0) : null;
      }).filter((x) => x != null);
      return v.length ? Math.min(...v) : null;
    };
    for (const h of playOrder(start)) {
      if (closed) break;
      const c = conc[h];
      if (c === 0 || c === 1) {
        holes.push({ hole: h + 1, a: best(A, h), b: best(B, h), w: c === 0 ? "A" : "B", dado: true });
        played++;
        up += c === 0 ? 1 : -1;
        if (Math.abs(up) > HOLES - played) closed = true;
        continue;
      }
      if (!(all.every((id) => hasScore(scores[id]?.[h])) || done[h] === true && all.some((id) => hasScore(scores[id]?.[h])))) continue;
      const a = best(A, h), b = best(B, h), w = a == null && b == null ? "H" : a == null ? "B" : b == null ? "A" : a < b ? "A" : b < a ? "B" : "H";
      holes.push({ hole: h + 1, a, b, w });
      played++;
      up += w === "A" ? 1 : w === "B" ? -1 : 0;
      if (Math.abs(up) > HOLES - played) closed = true;
    }
    const remaining = HOLES - played, finished = closed || remaining === 0;
    return { up, played, remaining, finished, dormie: !finished && up !== 0 && Math.abs(up) === remaining, text: statusText(up, remaining, finished), result: finished ? up > 0 ? "A" : up < 0 ? "B" : "H" : null, margin: Math.abs(up), holes };
  }
  function evaluate(def, scores) {
    const P = def.players, hcpMode = def.scoring === "hcp", al = Number.isFinite(def.allowance) ? def.allowance : DEFAULT_ALLOWANCE[def.modality];
    const DONE = marksOf(scores).done || [];
    const playing = Object.fromEntries(P.map((p) => [p.id, playingHcp(def, p)]));
    const baseOf = (id) => {
      const p = P.find((x) => x.id === id);
      return p ? playingHcp(def, p).base ?? 0 : 0;
    };
    const strokesOf = (ids2) => {
      const hs2 = ids2.map(baseOf);
      const s = hcpMode ? strokesReceived(hs2, al) : hs2.map(() => 0);
      return Object.fromEntries(ids2.map((id, k) => [id, s[k]]));
    };
    const hsOf = (st) => Object.fromEntries(Object.entries(st).map(([id, s]) => [id, holeStrokes(s, def.si)]));
    const name = (id) => P.find((p) => p.id === id)?.name || id, start = def.start_hole || 1;
    if (def.modality === "metralleta") {
      const ids2 = P.map((p) => p.id), strokes2 = strokesOf(ids2), pairs = [];
      for (let i = 0; i < ids2.length; i++) for (let j = i + 1; j < ids2.length; j++) {
        const st = strokesOf([ids2[i], ids2[j]]);
        pairs.push({ a: ids2[i], b: ids2[j], strokes: st, state: matchPlay([ids2[i]], [ids2[j]], scores, hsOf(st), start, [], DONE) });
      }
      const table = ids2.map((id) => ({ id, name: name(id), won: 0, tied: 0, lost: 0, holes_up: 0, open: 0 }));
      for (const pr of pairs) {
        const ra = table.find((t) => t.id === pr.a), rb = table.find((t) => t.id === pr.b), s = pr.state;
        ra.holes_up += s.up;
        rb.holes_up -= s.up;
        if (!s.finished) {
          ra.open++;
          rb.open++;
        } else if (s.result === "H") {
          ra.tied++;
          rb.tied++;
        } else if (s.result === "A") {
          ra.won++;
          rb.lost++;
        } else {
          rb.won++;
          ra.lost++;
        }
      }
      table.sort((x, y) => y.won - x.won || y.holes_up - x.holes_up || x.lost - y.lost || x.name.localeCompare(y.name, "es"));
      const finished = pairs.length > 0 && pairs.every((p) => p.state.finished);
      return { modality: "metralleta", strokes: strokes2, hole_strokes: hsOf(strokes2), sides: ids2.map((i) => [i]), main: null, pairs, table, finished, summary: finished ? `Gan\xF3 ${table[0]?.name ?? ""}` : `${pairs.filter((p) => p.state.finished).length}/${pairs.length} partidos terminados`, playing };
    }
    const sides = def.modality === "single" ? [[P[0]?.id], [P[1]?.id]].map((s) => s.filter(Boolean)) : def.sides || [];
    const ids = sides.flat(), strokes = strokesOf(ids), hs = hsOf(strokes), main = matchPlay(sides[0] || [], sides[1] || [], scores, hs, start, marksOf(scores).conc || [], DONE);
    const sideName = (k) => (sides[k] || []).map(name).join(" / ");
    const lead = main.up > 0 ? sideName(0) : main.up < 0 ? sideName(1) : "";
    return { modality: def.modality, strokes, hole_strokes: hs, sides, main, pairs: [], table: [], finished: main.finished, summary: main.up === 0 ? main.text : `${lead} ${main.text}`, playing };
  }
  function normName(s) {
    return String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-zñ0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
  }
  function playerKey(p) {
    return p.me ? "me" : p.club_id != null && String(p.club_id) !== "" ? `c:${p.club_id}` : `n:${normName(p.name)}`;
  }
  var rec = () => ({ w: 0, t: 0, l: 0, holes: 0, n: 0, form: [] });
  var add = (r, res, margin, mine) => {
    r.n++;
    const f = res === "H" ? "E" : res === mine ? "G" : "P";
    if (res === "H") r.t++;
    else if (res === mine) {
      r.w++;
      r.holes += margin;
    } else {
      r.l++;
      r.holes -= margin;
    }
    r.form.push(f);
    if (r.form.length > 8) r.form.shift();
  };
  function aggregate(ms, me = "me") {
    const names = {}, H = /* @__PURE__ */ new Map(), PV = /* @__PURE__ */ new Map(), PT = /* @__PURE__ */ new Map();
    const order = (x, y) => x === me ? -1 : y === me ? 1 : x < y ? -1 : x > y ? 1 : 0;
    const h2h = (x, y) => {
      const [a, b] = order(x, y) <= 0 ? [x, y] : [y, x], k = `${a}|${b}`;
      if (!H.has(k)) H.set(k, { a, b, individual: rec(), fourball_opp: rec(), fourball_partner: rec(), last: null });
      return { e: H.get(k), flip: a !== x };
    };
    const flipRes = (r) => r === "A" ? "B" : r === "B" ? "A" : "H";
    const overall = rec(), byM = { fourball: rec(), single: rec(), metralleta: rec() };
    const mine = (m, res, margin, side) => {
      add(overall, res, margin, side);
      add(byM[m], res, margin, side);
    };
    const sorted = [...ms].sort((x, y) => x.date < y.date ? -1 : x.date > y.date ? 1 : x.id < y.id ? -1 : 1);
    for (const m of sorted) {
      const R = m.result;
      if (!R?.finished) continue;
      for (const p of m.def.players) names[p.id] = p.name;
      const last = (text) => ({ date: m.date, text, modality: m.def.modality, match_id: m.id });
      if (m.def.modality === "metralleta" || m.def.modality === "single") {
        const list = m.def.modality === "single" ? [{ a: R.sides[0][0], b: R.sides[1][0], state: R.main }] : R.pairs.map((p) => ({ a: p.a, b: p.b, state: p.state }));
        for (const pr of list) {
          if (!pr.state?.finished || !pr.state.result) continue;
          const { e, flip } = h2h(pr.a, pr.b), res = flip ? flipRes(pr.state.result) : pr.state.result;
          if (pr.a === me || pr.b === me) mine(m.def.modality, pr.state.result, pr.state.margin, pr.a === me ? "A" : "B");
          add(e.individual, res, pr.state.margin, "A");
          e.last = last(`${res === "H" ? "Empate" : `${names[res === "A" ? e.a : e.b]} ${pr.state.text}`}`);
        }
        continue;
      }
      const [S0, S1] = R.sides, st = R.main;
      if (!st?.finished || !st.result || S0?.length !== 2 || S1?.length !== 2) continue;
      const txt = st.result === "H" ? "Empate" : `${(st.result === "A" ? S0 : S1).map((i) => names[i]).join(" / ")} ${st.text}`;
      for (const x of S0) for (const y of S1) {
        const { e, flip } = h2h(x, y);
        add(e.fourball_opp, flip ? flipRes(st.result) : st.result, st.margin, "A");
        e.last = last(txt);
      }
      for (const [S, mine2] of [[S0, "A"], [S1, "B"]]) {
        const { e } = h2h(S[0], S[1]);
        add(e.fourball_partner, st.result, st.margin, mine2);
        e.last = last(txt);
      }
      const key = (S) => [...S].sort(order).join("+"), k0 = key(S0), k1 = key(S1);
      const mineFirst2 = S0.includes(me) ? true : S1.includes(me) ? false : k0 <= k1;
      const [P0, P1, mySide] = mineFirst2 ? [S0, S1, "A"] : [S1, S0, "B"], pk = `${key(P0)}|${key(P1)}`;
      if (!PV.has(pk)) PV.set(pk, { pair: [...P0].sort(order), vs: [...P1].sort(order), rec: rec(), last: null });
      const pv = PV.get(pk);
      add(pv.rec, st.result, st.margin, mySide);
      pv.last = last(txt);
      const meSide = S0.includes(me) ? S0 : S1.includes(me) ? S1 : null;
      if (meSide) mine("fourball", st.result, st.margin, meSide === S0 ? "A" : "B");
      if (meSide) {
        const partner = meSide.find((i) => i !== me);
        if (!PT.has(partner)) PT.set(partner, { partner, rec: rec(), last: null });
        const pt = PT.get(partner);
        add(pt.rec, st.result, st.margin, meSide === S0 ? "A" : "B");
        pt.last = last(txt);
      }
    }
    const mineFirst = (x, y) => Number((y.a ?? y.pair?.[0]) === me) - Number((x.a ?? x.pair?.[0]) === me);
    return { names, h2h: [...H.values()].sort(mineFirst), pairs: [...PV.values()].sort(mineFirst), partners: [...PT.values()], matches: sorted.filter((m) => m.result?.finished).length, overall, by_modality: byM };
  }
  function myOutcome(R, me = "me") {
    if (!R) return { res: null, text: null };
    if (R.modality === "metralleta") {
      const row = R.table.find((t) => t.id === me);
      if (!row) return { res: null, text: R.summary };
      const res = !R.finished ? null : R.table[0]?.id === me ? "G" : row.won > row.lost ? "G" : row.won === row.lost ? "E" : "P";
      return { res, text: `${row.won}-${row.tied}-${row.lost}` };
    }
    const st = R.main;
    if (!st) return { res: null, text: null };
    const side = R.sides[0]?.includes(me) ? "A" : R.sides[1]?.includes(me) ? "B" : null;
    if (!st.finished || !st.result) return { res: null, text: st.text };
    return { res: st.result === "H" ? "E" : side == null ? null : st.result === side ? "G" : "P", text: st.text };
  }
  return __toCommonJS(match_core_exports);
})();
