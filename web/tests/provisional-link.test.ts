import assert from "node:assert/strict";
import test from "node:test";
import { holeGaps, listedIds, pairIsEligible, pendingLabel, planProvisionalLinks, strokeTotal, type OfficialCard, type ProvRound } from "../lib/provisional-link";

const live = (over: Partial<ProvRound> = {}): ProvRound => ({
  id: "live-1", date: "2026-11-22", course: "Azul", matricula: "100", roundId: null, ...over,
});
const card = (over: Partial<OfficialCard> = {}): OfficialCard => ({
  id: "card-1", date: "2026-11-22", course: "Jockey Club Argentino · Azul", matricula: "100",
  holes: [{ hole: 1, strokes: 4 }, { hole: 3, strokes: 5 }], ...over,
});

test("one provisional and one card of the same day, course and matricula link once", () => {
  const first = planProvisionalLinks([live()], [card()]);
  assert.deepEqual(first.links, [{ liveId: "live-1", roundId: "card-1" }]);
  assert.deepEqual(first.asks, []);
  const again = planProvisionalLinks([live({ roundId: "card-1" })], [card()]);
  assert.deepEqual(again.links, []);
  assert.deepEqual(again.asks, []);
});

test("a different course or matricula does not link", () => {
  assert.deepEqual(planProvisionalLinks([live()], [card({ course: "Colorada" })]).links, []);
  assert.deepEqual(planProvisionalLinks([live()], [card({ matricula: "200" })]).links, []);
  assert.deepEqual(planProvisionalLinks([live({ date: "2026-11-21" })], [card()]).links, []);
});

test("two candidates stay unlinked and ask", () => {
  const twoLives = planProvisionalLinks([live(), live({ id: "live-2" })], [card()]);
  assert.deepEqual(twoLives.links, []);
  assert.equal(twoLives.asks.length, 1);
  assert.deepEqual(twoLives.asks[0].liveIds, ["live-1", "live-2"]);
  const twoCards = planProvisionalLinks([live()], [card(), card({ id: "card-2" })]);
  assert.deepEqual(twoCards.links, []);
  assert.deepEqual(twoCards.asks[0].roundIds, ["card-1", "card-2"]);
});

test("a confirmed pair is accepted and a pair already used is not", () => {
  const rows = [live(), live({ id: "live-2" })];
  assert.equal(pairIsEligible(rows[0], card(), rows), true);
  assert.equal(pairIsEligible(live({ roundId: "other" }), card(), [live({ roundId: "other" })]), false);
  assert.equal(pairIsEligible(live(), card(), [live({ id: "other", roundId: "card-1" })]), false);
});

test("the official score stays and a different track total is only marked", () => {
  const holes = [{ hole: 1, strokes: 4 }, { hole: 3, strokes: 5 }];
  const totals = strokeTotal([
    { hole: 1, penalty: 0 }, { hole: 1, penalty: 0 }, { hole: 1, penalty: 0 }, { hole: 1, penalty: 0 },
    { hole: 3, penalty: 2 }, { hole: 3, penalty: 0 },
  ]);
  assert.deepEqual(holeGaps(totals, holes), [3]);
  assert.deepEqual(holes, [{ hole: 1, strokes: 4 }, { hole: 3, strokes: 5 }]);
});

test("a linked round is the card, not a second row", () => {
  const shown = listedIds([{ id: "card-1" }], [{ id: "live-1", roundId: "card-1" }, { id: "live-2", roundId: null }]);
  assert.deepEqual(shown.cards, ["card-1"]);
  assert.deepEqual(shown.pending, ["live-2"]);
});

test("today's missing card is En juego and a past open round is Tarjeta pendiente", () => {
  assert.equal(pendingLabel("2026-11-22", "2026-11-22", false, true), "En juego");
  assert.equal(pendingLabel("2026-11-21", "2026-11-22", false, true), "Tarjeta pendiente");
  assert.equal(pendingLabel("2026-11-21", "2026-11-22", false, false), null);
  assert.equal(pendingLabel("2026-11-22", "2026-11-22", true, true), null);
  assert.equal(["En juego", "Tarjeta pendiente"].includes("Sin cargar"), false);
});
