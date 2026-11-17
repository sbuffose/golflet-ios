/** A round without a club scorecard stays out of every shared group number. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { memberStats, type NR } from "../lib/group-stats";
import { periodStats, type PInput } from "../lib/group-period-core";

const card = (over: Partial<NR>): NR => ({
  date: "2026-11-01", year: "2026", course_key: "c", course_label: "Cancha", gross: 80, net: 76, par: 72,
  holes: [[1, 4, 5], [2, 4, 4]], putts: null, gir: null, fir: null, official: true, ...over,
});

const loose = card({
  date: "2026-11-08", official: false, gross: 60, par: 72,
  holes: [[1, 4, 3], [2, 4, 3], [3, 4, 3], [4, 3, 3]],
});

function period(rows: NR[]): PInput {
  return {
    rounds: rows.map(r => ({
      round_id: r.date, date: r.date, course_label: r.course_label, gross: r.gross, net: r.net, par: r.par ?? null,
      holes: r.holes, putts: r.putts, gir: r.gir, fir: r.fir, official: r.official,
    })),
    hiStart: null, hiEnd: null,
    gps: { holes: [], drives: [], full18: [], linked: [] },
  };
}

test("una vuelta no oficial no suma birdies, pares, máximo de birdies ni racha", () => {
  const official = card({});
  const stats = memberStats([official, loose]);
  assert.equal(stats.rounds, 1);
  assert.equal(stats.best_gross, 80);
  assert.equal(stats.types.birdies.total, 0);
  assert.equal(stats.types.pars.total, 1);
  assert.equal(stats.types.max_birdies.total, 0);
  assert.equal(stats.streak, 0);

  const shared = periodStats(period([official, loose]));
  assert.equal(shared.rounds.v, 1);
  assert.equal(shared.birdies.v, 0);
  assert.equal(shared.pars.v, 1);
  assert.equal(shared.max_birdies.v, 0);
  assert.equal(shared.best_gross.extra.score, 80);

  const onlyLoose = periodStats(period([loose]));
  assert.equal(onlyLoose.rounds.v, 0);
  assert.equal(onlyLoose.birdies.v, null);
  assert.equal(onlyLoose.max_birdies.v, null);
});

test("las consultas de grupo, GPS y Con quién jugás dejan afuera official = false", () => {
  const files = [
    "../lib/group-stats.ts",
    "../lib/group-period-core.ts",
    "../lib/groups.ts",
    "../lib/game-metrics.ts",
    "../lib/private-metrics.ts",
    "../lib/data.ts",
    "../lib/live.ts",
  ];
  for (const file of files) {
    const text = readFileSync(new URL(file, import.meta.url), "utf8");
    assert.match(text, /countsInSharedStats|coalesce\([^)]*official/, file);
  }
});
