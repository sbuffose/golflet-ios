import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { applyHoleScore, bookingCourseName, cardFromHoles, companionLabels, companionsLine, courseChoices, courseFromMarker, courseHandicap, courseLabelHits, evaluate, holeStrokes, pairStanding, pickOfficialCard, resolveOfficialCard, scorecardHoles, shortName, strokesPlaced, strokesReceived } from "../lib/match-core";
import { courseCardFromRow } from "../lib/tee-times-core";

/** Official card already shipped as a fixture (course holes only, no player). */
const azul = (JSON.parse(readFileSync(new URL("../../Golflet/Resources/Fixtures/courses.json", import.meta.url), "utf8")) as { course: string; holes: { hole: number; par: number; hole_hcp: number }[] }[])
  .find(c => c.course === "Azul")!;
const card = cardFromHoles(azul.holes.map(h => ({ hole: h.hole, par: h.par, hcp: h.hole_hcp })));

const players = [
  { id: "me", name: "Ana Costa", hcp: 10, me: true },
  { id: "n:joaquin", name: "Lavalle Joaquín", hcp: 13 },
  { id: "n:augusto", name: "Lavalle Augusto", hcp: 14 },
  { id: "n:mateo", name: "Mateo Ruiz", hcp: 17 },
];

test("strokes land on the lowest stroke indexes of the official card", () => {
  assert.equal(strokesPlaced(card.si), true);
  assert.deepEqual(card.pars.slice(0, 3), [5, 5, 4]);
  assert.equal(card.si[1], 1);
  const three = holeStrokes(3, card.si);
  const holes = three.map((v, i) => v ? i + 1 : 0).filter(Boolean);
  assert.deepEqual(holes, [2, 4, 17]);
  const seven = holeStrokes(7, card.si);
  assert.deepEqual(seven.map((v, i) => v ? i + 1 : 0).filter(Boolean), [1, 2, 4, 8, 10, 17, 18]);
  const twenty = holeStrokes(20, card.si);
  assert.ok(twenty.every(v => v >= 1));
  assert.equal(twenty[1], 2);
  assert.equal(twenty[16], 2);
  assert.equal(twenty[0], 1);
});

test("a 9-hole card uses only those nine indexes", () => {
  const nine = card.si.map((v, i) => i < 9 ? v : null);
  assert.equal(strokesPlaced(nine), true);
  assert.deepEqual(holeStrokes(2, nine).map((v, i) => v ? i + 1 : 0).filter(Boolean), [2, 4]);
  const eleven = holeStrokes(11, nine);
  assert.equal(eleven.slice(9).every(v => v === 0), true);
  assert.equal(eleven.filter(v => v === 2).length, 2);
  assert.equal(eleven.filter(v => v === 1).length, 7);
});

test("missing or broken S.I. does not fall back to holes 1..N", () => {
  const empty = Array(18).fill(null);
  assert.equal(strokesPlaced(empty), false);
  assert.deepEqual(holeStrokes(7, empty), Array(18).fill(0));
  const partial = card.si.slice(); partial[3] = null;
  assert.equal(strokesPlaced(partial), false);
  assert.deepEqual(holeStrokes(4, partial), Array(18).fill(0));
  const dup = card.si.slice(); dup[0] = dup[1];
  assert.equal(strokesPlaced(dup), false);
  const def = { modality: "fourball" as const, scoring: "hcp" as const, allowance: 100, players, sides: [["me", "n:joaquin"], ["n:augusto", "n:mateo"]], si: empty };
  const ev = evaluate(def, {});
  assert.equal(ev.strokes_placed, false);
  assert.deepEqual(ev.strokes, { me: 0, "n:joaquin": 3, "n:augusto": 4, "n:mateo": 7 });
  assert.deepEqual(ev.hole_strokes["n:mateo"], Array(18).fill(0));
});

test("the same card places 3, 4 and 7 on the match", () => {
  const def = { modality: "fourball" as const, scoring: "hcp" as const, allowance: 100, players, sides: [["me", "n:joaquin"], ["n:augusto", "n:mateo"]], si: card.si, pars: card.pars };
  const ev = evaluate(def, {});
  assert.equal(ev.strokes_placed, true);
  assert.deepEqual(ev.strokes, { me: 0, "n:joaquin": 3, "n:augusto": 4, "n:mateo": 7 });
  assert.deepEqual(ev.hole_strokes["n:joaquin"].map((v, i) => v ? i + 1 : 0).filter(Boolean), [2, 4, 17]);
});

test("shared surnames get a given name and the surname initial", () => {
  const names = ["Lavalle Joaquín", "Lavalle Augusto", "Mateo Ruiz"];
  assert.equal(shortName("Lavalle Joaquín", names), "Joaquín L.");
  assert.equal(shortName("Lavalle Augusto", names), "Augusto L.");
  assert.equal(shortName("Joaquín Lavalle", ["Joaquín Lavalle", "Augusto Lavalle"]), "Joaquín L.");
  assert.equal(shortName("Augusto Lavalle", ["Joaquín Lavalle", "Augusto Lavalle"]), "Augusto L.");
  assert.equal(shortName("Lavalle Cobo Joaquín María", ["Lavalle Cobo Joaquín María", "Lavalle Cobo Augusto"]), "Joaquín L.");
  assert.equal(shortName("Mateo Ruiz", names, true), "Vos");
  assert.equal(companionsLine(names), "con Joaquín L. y Augusto L. +1");
  assert.equal(companionsLine(["Juan", "Pedro", "Ana"]), "con Juan y Pedro +1");
  assert.equal(companionsLine(["Joaquín Lavalle", "Augusto Lavalle"]), "con Joaquín y Augusto");
  assert.deepEqual(companionLabels(["Lavalle Joaquín", "Lavalle Augusto", "Mateo Ruiz"]), ["Joaquín L.", "Augusto L.", "Mateo"]);
  const app = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
  assert.match(app, /GolfletMatchCore\.companionsLine/);
});

test("the official card wins over an empty directory row and nothing is invented", () => {
  const picked = pickOfficialCard([
    { holes: Array.from({ length: 18 }, (_, i) => ({ hole: i + 1, par: null, hcp: null })) },
    { holes: azul.holes.map(h => ({ hole: h.hole, par: h.par, hcp: h.hole_hcp })) },
  ]);
  assert.equal(picked.placed, true);
  assert.equal(picked.si[1], 1);
  const blank = pickOfficialCard([{ holes: [{ hole: 1, par: 4, hcp: null }] }]);
  assert.equal(blank.placed, false);
  assert.equal(blank.pars[0], 4);
  assert.ok(blank.si.every(v => v == null));
  assert.equal(courseLabelHits("Azul", "Jockey Club · Azul"), true);
  assert.equal(courseLabelHits("Cancha Vieja", "Mar del Plata · Cancha Vieja"), true);
  assert.equal(courseLabelHits("Colorada", "Azul"), false);
  assert.equal(courseLabelHits("Azul", "Azulado"), false);
});

test("a course row without tee ratings still exposes par and S.I., and an override replaces the card", () => {
  const row = courseCardFromRow({
    club_id: 1, name: "Norte", tees: {},
    holes: [{ hole: 1, par: 4, hcp: 5 }, { hole: 2, par: 3, hcp: 1 }],
    holes_override: { "2": { hcp: 9 } },
  });
  assert.ok(row);
  assert.deepEqual(row!.tees, {});
  assert.equal(row!.holes[0].hcp, 5);
  assert.equal(row!.holes[1].hcp, 9);
  assert.equal(courseCardFromRow({ club_id: 1, name: "Vacía", tees: {}, holes: [] }), null);
});

test("a booking without a course uses one color square, then the official card of that course", () => {
  const courses = ["Azul", "Colorada"];
  assert.equal(courseFromMarker("Copa del club 18hmp Dom 🟦", courses), "Azul");
  assert.equal(courseFromMarker("Programa COLO 🟥", courses), "Colorada");
  assert.equal(courseFromMarker("Copa 🟥🟦", courses), null);
  assert.equal(courseFromMarker("Copa sin marca", courses), null);
  assert.equal(bookingCourseName({ course_label: null, event_name: "Copa del club 🟦" }, courses), "Azul");
  assert.equal(bookingCourseName({ course_label: "Jockey Club Argentino", event_name: "Copa del club 🟦" }, courses), null);
  const resolved = resolveOfficialCard(
    { course_label: null, event_name: "Copa del club 🟦" },
    null,
    [{ course: "Azul", holes: azul.holes.map(h => ({ hole: h.hole, par: h.par, hcp: h.hole_hcp })) }, { course: "Colorada", holes: [{ hole: 1, par: 4, hcp: 7 }] }],
  );
  assert.equal(resolved.course, "Azul");
  assert.equal(resolved.placed, true);
  assert.equal(resolved.si[1], 1);
  assert.equal(resolved.pars[0], 5);
  const both = resolveOfficialCard({ course_label: null, event_name: "Copa 🟥🟦" }, null, [{ course: "Azul", holes: azul.holes }], [{ course: "Azul", official: true, holes: [[1, 5, 1]] }]);
  assert.equal(both.course, null);
  assert.equal(both.placed, false);
  assert.ok(both.si.every(v => v == null));
  assert.ok(both.pars.every(v => v == null));
});

test("an official scorecard of the same course fills par and never a stroke index", () => {
  const holes = scorecardHoles([{ course: "Azul", official: true, holes: [[1, 5, 1], [2, 4, 9]] }, { course: "Colorada", official: true, holes: [[1, 3, 4]] }], "Azul");
  assert.deepEqual(holes, [{ hole: 1, par: 5 }, { hole: 2, par: 4 }]);
  const cardOnly = resolveOfficialCard({ course_label: "Azul" }, null, [], [{ course: "Azul", official: true, holes: [[1, 5, 1]] }], ["Azul", "Colorada"]);
  assert.equal(cardOnly.course, "Azul");
  assert.equal(cardOnly.placed, false);
  assert.equal(cardOnly.pars[0], 5);
  assert.ok(cardOnly.si.every(v => v == null));
  const other = resolveOfficialCard({ course_label: null, event_name: "Dom 🟦" }, null, [], [{ course: "Colorada", official: true, holes: [[1, 3, 4]] }], ["Azul", "Colorada"]);
  assert.equal(other.course, "Azul");
  assert.ok(other.pars.every(v => v == null));
});

test("fourball strokes use the chosen course tee and change between Azul and Colorada", () => {
  const hi = [3.1, 6.1, 7.1, 10.1];
  const ch = (slope: number, rating: number) => hi.map(h => courseHandicap(h, { tee: "x", slope, course_rating: rating, par: 72 }));
  const azul = ch(123, 70.2), colorada = ch(122, 71.1);
  assert.deepEqual(azul, [2, 5, 6, 9]);
  assert.deepEqual(colorada, [2, 6, 7, 10]);
  assert.deepEqual(strokesReceived(azul as number[], 85), [0, 3, 3, 6]);
  assert.deepEqual(strokesReceived(colorada as number[], 85), [0, 3, 4, 7]);
  assert.deepEqual(strokesReceived(hi, 85), [0, 3, 3, 6]);
  const players = [
    { id: "me", name: "Ana Costa", hcp: 3.1, tee: "Azul", gender: "C" as const },
    { id: "n:joaquin", name: "Lavalle Joaquín", hcp: 6.1, tee: "Azul", gender: "C" as const },
    { id: "n:augusto", name: "Lavalle Augusto", hcp: 7.1, tee: "Azul", gender: "C" as const },
    { id: "n:mateo", name: "Mateo Ruiz", hcp: 10.1, tee: "Azul", gender: "C" as const },
  ];
  const sides = [["me", "n:joaquin"], ["n:augusto", "n:mateo"]];
  const onAzul = evaluate({ modality: "fourball", scoring: "hcp", allowance: 85, players, sides, si: Array(18).fill(null), tees: [{ tee: "Azul", gender: "C", slope: 123, course_rating: 70.2, par: 72 }] }, {});
  const onColorada = evaluate({
    modality: "fourball", scoring: "hcp", allowance: 85, sides, si: Array(18).fill(null),
    players: players.map(p => ({ ...p, tee: "Rojo" })),
    tees: [{ tee: "Rojo", gender: "C", slope: 122, course_rating: 71.1, par: 72 }],
  }, {});
  assert.deepEqual(onAzul.strokes, { me: 0, "n:joaquin": 3, "n:augusto": 3, "n:mateo": 6 });
  assert.deepEqual(onColorada.strokes, { me: 0, "n:joaquin": 3, "n:augusto": 4, "n:mateo": 7 });
});

test("the course question appears only when the club has two libretas and the booking names neither", () => {
  assert.deepEqual(courseChoices(null, ["Azul", "Colorada"]), ["Azul", "Colorada"]);
  assert.equal(courseChoices("Azul", ["Azul", "Colorada"]), null);
  assert.equal(courseChoices(null, ["Azul"]), null);
  assert.equal(courseFromMarker("Copa sin marca", ["Azul", "Colorada"]), null);
  const js = readFileSync(new URL("../public/match.js", import.meta.url), "utf8");
  assert.match(js, /¿En qué cancha juegan\?/);
  assert.match(js, /TEES = base\?\.tees \|\| \[\]/);
  assert.match(js, /id="cancha-pregunta"/);
  assert.match(js, /method: 'POST'/);
});

test("the match screen no longer deals strokes from hole 1", () => {
  const js = readFileSync(new URL("../public/match.js", import.meta.url), "utf8");
  assert.equal(js.includes("hoyo 1 en adelante"), false);
  assert.match(js, /<small class="gm-siwarn">Sin el S\.I\. de la cancha no se pueden ubicar los golpes por hoyo\.<\/small>/);
  assert.match(js, /if \(!placed\) return cell\(h, ''\)/);
  assert.equal(js.includes("dash('strokes')"), false);
  assert.equal(js.includes('data-miss="strokes"'), false);
  assert.match(js, /shortName/);
  assert.match(js, /Trackear golpes/);
  assert.match(js, /pairStanding/);
});

const blank = () => Array(18).fill(null);
const trio = {
  modality: "metralleta" as const, scoring: "gross" as const, allowance: 100, si: Array(18).fill(null),
  players: [
    { id: "me", name: "Fixture Vos", hcp: 0 },
    { id: "joaquin", name: "Joaquín Lavalle", hcp: 0 },
    { id: "augusto", name: "Augusto Lavalle", hcp: 0 },
  ],
};
const line = (ev: ReturnType<typeof evaluate>, index: number) => {
  const pair = ev.pairs[index];
  return pairStanding(pair.a, pair.b, pair.state, id => shortName(trio.players.find(p => p.id === id)?.name || id, trio.players.map(p => p.name), id === "me")).text;
};

test("the board says who is up, all square, and a finished 3&2", () => {
  const me = blank(), joaquin = blank(), augusto = blank();
  me[0] = 4; joaquin[0] = 5; me[1] = 4; joaquin[1] = 5; joaquin[2] = 4; augusto[2] = 5;
  const live = evaluate(trio, { me, joaquin, augusto });
  assert.deepEqual(live.pairs.map((_, i) => line(live, i)), ["Vos 2 arriba", "All square", "Joaquín L. 1 arriba"]);
  assert.equal(live.summary.includes("partidos terminados"), false);

  const tied = blank();
  tied[0] = 4;
  const square = evaluate(trio, { me: tied, joaquin: [...tied], augusto: [...tied] });
  assert.deepEqual(square.pairs.map(p => p.state.text), ["All square", "All square", "All square"]);

  const win = blank(), mid = blank(), last = blank();
  for (let hole = 0; hole < 3; hole++) { win[hole] = 4; mid[hole] = 5; last[hole] = 6; }
  for (let hole = 3; hole < 16; hole++) { win[hole] = 4; mid[hole] = 4; last[hole] = 4; }
  const done = evaluate(trio, { me: win, joaquin: mid, augusto: last });
  assert.deepEqual(done.pairs.map((_, i) => line(done, i)), ["Ganó Vos 3&2", "Ganó Vos 3&2", "Ganó Joaquín L. 3&2"]);
  assert.equal(done.finished, true);
});

test("a stroke on the first index turns a lost hole into a half", () => {
  const si = Array.from({ length: 18 }, (_, i) => i + 1);
  const players = [{ id: "me", name: "Ana", hcp: 0 }, { id: "beto", name: "Beto", hcp: 1 }];
  const scores = { me: [4, ...Array(17).fill(null)], beto: [5, ...Array(17).fill(null)] };
  const gross = evaluate({ modality: "metralleta", scoring: "gross", allowance: 100, players, si }, scores);
  const net = evaluate({ modality: "metralleta", scoring: "hcp", allowance: 100, players, si }, scores);
  assert.equal(pairStanding("me", "beto", gross.pairs[0].state, () => "Beto").text, "Vos 1 arriba");
  assert.equal(net.pairs[0].strokes.beto, 1);
  assert.equal(net.pairs[0].state.up, 0);
  assert.equal(pairStanding("me", "beto", net.pairs[0].state, () => "Beto").text, "All square");
});

test("the track total replaces the hole and is not added on top", () => {
  const start = { me: [4, ...Array(17).fill(null)] };
  const next = applyHoleScore(start, "me", 1, 5);
  assert.equal(next.me[0], 5);
  assert.equal(applyHoleScore(next, "me", 1, 5).me[0], 5);
  assert.equal(applyHoleScore(start, "me", 1, 0), start);
});
