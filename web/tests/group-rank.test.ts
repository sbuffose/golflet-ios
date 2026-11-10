import test from "node:test";
import assert from "node:assert/strict";
import { grossSpread, groupWindow, inWindow, maxBirdiesInRound, memberStats, scoreStreak, worstHoles, type NR } from "../lib/group-stats";

const card = (over: Partial<NR>): NR => ({
  date: "2026-10-01", year: "2026", course_key: "c", course_label: "Cancha", gross: 80, net: 76, par: 72,
  holes: [[1, 4, 4], [2, 3, 1], [3, 5, 5]], putts: null, gir: null, fir: null, ...over,
});

test("un hoyo en uno sale de un score 1 y el gross de 9 no entra al promedio", () => {
  const nine = card({ nine: true, date: "2026-10-02", gross: 40, holes: [[1, 4, 3]] });
  const full = card({ holes: [[1, 4, 3], [2, 3, 1], [3, 4, 4]] });
  const st = memberStats([full, nine]);
  assert.equal(st.rounds, 1);
  assert.equal(st.cards_9, 1);
  assert.equal(st.avg_gross, 80);
  assert.equal(st.best_gross, 80);
  assert.equal(st.types.aces.total, 1);
  assert.equal(st.types.birdies.total, 2);
  assert.equal(maxBirdiesInRound([full, nine]), 1);
});

test("la racha y el desvío usan solo tarjetas de 18 con par", () => {
  const rows = [
    card({ date: "2026-10-01", gross: 70, par: 72 }),
    card({ date: "2026-10-08", gross: 72, par: 72 }),
    card({ date: "2026-10-15", gross: 80, par: 72 }),
    card({ date: "2026-10-16", nine: true, gross: 30, par: 36 }),
  ];
  assert.equal(scoreStreak(rows), 2);
  assert.equal(grossSpread(rows).n, 3);
  assert.ok(grossSpread([card({})]).sd == null);
});

test("los peores hoyos piden dos scores y no inventan un hoyo", () => {
  const a = card({ holes: [[7, 4, 7], [8, 3, 3]] });
  const b = card({ date: "2026-10-09", holes: [[7, 4, 6], [9, 4, 8]] });
  const worst = worstHoles([a, b]);
  assert.equal(worst[0]?.hole, 7);
  assert.equal(worst.some(h => h.hole === 8 || h.hole === 9), false);
});

test("semana, mes, trimestre, semestre y año son períodos de calendario, con el anterior", () => {
  const now = new Date("2026-11-10T15:00:00Z");
  const week = groupWindow("1w", now);
  assert.deepEqual([week.since, week.until, week.prevSince, week.prevUntil], ["2026-11-09", "2026-11-16", "2026-11-02", "2026-11-09"]);
  const month = groupWindow("1m", now);
  assert.equal(month.since, "2026-11-01");
  assert.equal(month.prevSince, "2026-10-01");
  const quarter = groupWindow("3q", now);
  assert.equal(quarter.since, "2026-10-01");
  assert.equal(quarter.prevSince, "2026-07-01");
  const half = groupWindow("6s", now);
  assert.equal(half.since, "2026-07-01");
  assert.equal(half.prevSince, "2026-01-01");
  const year = groupWindow("12y", now);
  assert.deepEqual([year.since, year.until, year.prevSince], ["2026-01-01", "2027-01-01", "2025-01-01"]);
  assert.equal(groupWindow("all", now).prevSince, null);
  assert.equal(inWindow("2026-11-09", week.since, week.until), true);
  assert.equal(inWindow("2026-11-16", week.since, week.until), false);
  assert.equal(week.min, 1);
  assert.equal(year.min, 4);
});
