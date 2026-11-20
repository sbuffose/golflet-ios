import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { cardFromHoles, courseLabelHits, evaluate, holeStrokes, pickOfficialCard, shortName, strokesPlaced } from "../lib/match-core";
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

test("the match screen no longer deals strokes from hole 1", () => {
  const js = readFileSync(new URL("../public/match.js", import.meta.url), "utf8");
  assert.equal(js.includes("hoyo 1 en adelante"), false);
  assert.match(js, /no se pueden ubicar los golpes por hoyo/);
  assert.match(js, /data-miss="strokes"|dash\('strokes'\)/);
  assert.match(js, /shortName/);
});
