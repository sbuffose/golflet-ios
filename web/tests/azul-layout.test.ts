/** From 2026-11-22 Azul display swaps 3–9 with 12–18. 1, 2, 10 and 11 stay. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { azulBundledMap } from "../lib/azul-osm";
import { AZUL_NINE_SWAP_FROM, azulCurrentLayout, azulNineSwap, relabelAzulHoles } from "../lib/azul-layout";
import { jockeyFallback } from "../lib/jockey-plans";

type CardHole = { hole: number; par: number; hole_hcp: number; yards: { AZUL: number; NEGRO: number } };
const courses = JSON.parse(readFileSync(new URL("../../Golflet/Resources/Fixtures/courses.json", import.meta.url), "utf8")) as { club_code: string; course: string; holes: CardHole[] }[];
const rounds = JSON.parse(readFileSync(new URL("../../Golflet/Resources/Fixtures/rounds.json", import.meta.url), "utf8")) as { date: string; course: string; holes: { hole: number; par: number; hole_hcp: number; yards: number }[] }[];
const card = courses.find(c => c.club_code === "118" && c.course === "Azul")!;
const byHole = (holes: { hole?: number }[], n: number) => holes.find(h => h.hole === n)!;

function withCard(playedOn: string) {
  const stored = azulBundledMap().holes.map(h => {
    const row = card.holes.find(c => c.hole === h.hole)!;
    return { ...h, par: row.par, hcp: row.hole_hcp, yards: row.yards.AZUL, negro: row.yards.NEGRO };
  });
  return relabelAzulHoles(stored, playedOn);
}

test("desde el 22 nov 2026 el 3 muestra el 12 guardado y el 10 no se mueve", () => {
  for (let n = 1; n <= 18; n++) assert.equal(azulNineSwap(azulNineSwap(n)), n);
  assert.equal(azulNineSwap(3), 12);
  assert.equal(azulNineSwap(9), 18);
  assert.equal(azulNineSwap(12), 3);
  assert.equal(azulNineSwap(18), 9);
  for (const n of [1, 2, 10, 11]) assert.equal(azulNineSwap(n), n);
  assert.equal(AZUL_NINE_SWAP_FROM, "2026-11-22");
  assert.equal(azulCurrentLayout("2026-11-22", null), true);
  assert.equal(azulCurrentLayout("2026-10-04", null), false);
  assert.equal(azulCurrentLayout(null, null), false);
  assert.equal(azulCurrentLayout(null, "current"), true);
  assert.equal(azulCurrentLayout("2026-11-22", "legacy"), false);

  const stored3 = azulBundledMap().holes.find(h => h.hole === 3)!;
  const stored12 = azulBundledMap().holes.find(h => h.hole === 12)!;
  const stored10 = azulBundledMap().holes.find(h => h.hole === 10)!;
  const stored1 = azulBundledMap().holes.find(h => h.hole === 1)!;
  assert.ok(Math.abs((stored3.line[0]?.lat ?? 0) - -34.485959) < 1e-6);
  assert.notEqual(stored10.line[0]?.lat, stored1.line[0]?.lat);

  const current = withCard("2026-11-22");
  const legacy = withCard("2026-10-04");
  const hole = (rows: typeof current, n: number) => byHole(rows, n) as (typeof current)[number];

  assert.equal(hole(current, 3).yards, 409);
  assert.equal(hole(current, 3).hcp, 16);
  assert.equal(hole(current, 3).par, 4);
  assert.equal(hole(current, 3).negro, 414);
  assert.equal(hole(current, 3).line[0]?.lat, stored12.line[0]?.lat);
  assert.equal(hole(current, 12).yards, 345);
  assert.equal(hole(current, 12).hcp, 9);
  assert.equal(hole(current, 12).par, 4);
  assert.equal(hole(current, 12).line[0]?.lat, stored3.line[0]?.lat);
  assert.equal(hole(current, 10).par, 5);
  assert.equal(hole(current, 10).hcp, 4);
  assert.equal(hole(current, 10).yards, 483);
  assert.equal(hole(current, 10).line[0]?.lat, stored10.line[0]?.lat);
  assert.equal(hole(current, 1).yards, 485);
  assert.equal(hole(current, 1).negro, 488);
  assert.equal(hole(current, 1).hcp, 5);
  assert.equal(hole(current, 2).yards, 474);
  assert.equal(hole(current, 11).yards, 186);

  assert.equal(hole(legacy, 3).yards, 345);
  assert.equal(hole(legacy, 3).hcp, 9);
  assert.equal(hole(legacy, 3).line[0]?.lat, stored3.line[0]?.lat);
  assert.equal(hole(legacy, 12).yards, 409);
  assert.equal(hole(legacy, 10).line[0]?.lat, hole(current, 10).line[0]?.lat);
  assert.equal(card.holes.find(h => h.hole === 15)?.yards.AZUL, 343);
  assert.equal(card.holes.find(h => h.hole === 16)?.yards.AZUL, 377);
  assert.equal(card.holes.find(h => h.hole === 17)?.yards.AZUL, 490);
});

test("las tarjetas importadas hasta el 4 oct 2026 siguen en el orden viejo", () => {
  const round = rounds.find(r => r.date === "2026-10-04" && r.course === "Azul")!;
  const third = round.holes.find(h => h.hole === 3)!;
  const twelfth = round.holes.find(h => h.hole === 12)!;
  assert.equal(third.par, 4);
  assert.equal(third.hole_hcp, 9);
  assert.equal(third.yards, 345);
  assert.equal(twelfth.yards, 409);
  assert.equal(twelfth.hole_hcp, 16);
  assert.equal(round.holes.map(h => h.hole).join(","), Array.from({ length: 18 }, (_, i) => i + 1).join(","));
});

test("el plan de respaldo intercambia el 3 con el 12 y deja quietos el 1, el 2, el 10 y el 11", () => {
  const azul = jockeyFallback("1:Azul")!;
  const hole = (n: number) => azul.holes.find(h => h.hole === n)!;
  assert.deepEqual(azul.published_holes, Array.from({ length: 18 }, (_, i) => i + 1));
  assert.match(hole(3).why || "", /409 yd/);
  assert.match(hole(12).why || "", /345 yd/);
  assert.match(hole(10).why || "", /483 yd/);
  assert.match(hole(1).why || "", /485 yd/);
  assert.match(hole(2).why || "", /474 yd/);
  assert.match(hole(11).why || "", /186 yd/);
  assert.equal(hole(16).plan_title, "Híbrido al centro y wedge al green");
  assert.equal(hole(17).plan_title, "Hierro largo al centro");
  const colorada = jockeyFallback("1:Colorada")!;
  assert.match(colorada.holes.find(h => h.hole === 1)?.why || "", /425 yd/);
  assert.equal(colorada.holes.find(h => h.hole === 3)?.hole, 3);
});
