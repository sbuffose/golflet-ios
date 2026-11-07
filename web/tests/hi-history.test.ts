import { test } from "node:test";
import assert from "node:assert/strict";
import { hiRangeForm, parseHiHistory } from "../lib/golfistics";
const opts = (a: number, b: number, sel: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i).map(v => `<option ${v === sel ? "selected " : ""}value="${String(v).padStart(2, "0")}">${v}</option>`).join("");
const page = `<form name="frmgra9" method="post">Desde: <select name="dia" >${opts(1, 31, 2)}</select><select name="mes" >${opts(1, 12, 5)}</select><select name="anio" >${opts(2020, 2031, 2026)}</select>
 Hasta: <select name="diah" >${opts(1, 31, 29)}</select><select name="mesh" >${opts(1, 12, 10)}</select><select name="anioh" >${opts(2020, 2031, 2026)}</select>
 <input class="btn" type="submit" value="Actualizar" ><input type=hidden name=a value='' ><input type=hidden name=b value='x' ></form>
 <table><tr><td>22/10/26</td><td>Club Test</td><td>Activa</td><td>13.6</td></tr><tr><td>15/10/26</td><td>Club Test</td><td>Activa</td><td>13.6</td></tr></table>`;
test("HI report range form: earliest offered year → today, hidden fields kept", () => {
  assert.deepEqual(hiRangeForm(page, "2026-10-29"), { dia: "01", mes: "01", anio: "2020", diah: "29", mesh: "10", anioh: "2026", a: "", b: "x" });
});
test("HI report without the filter form → null (default window only)", () => {
  assert.equal(hiRangeForm("<table><tr><td>22/10/26</td></tr></table>"), null);
});
test("HI rows parse, equal consecutive values are kept (weekly revisions, no collapsing)", () => {
  const h = parseHiHistory(page);
  assert.equal(h.length, 2); assert.deepEqual(h.map(x => [x.date, x.hi]), [["2026-10-22", 13.6], ["2026-10-15", 13.6]]);
});
import { monthlyScores, roundCounts } from "../lib/metrics";
test("monthly birdies/pars only from real cards", () => {
  const h18 = Array.from({ length: 18 }, (_, i) => [i + 1, 4, i < 2 ? 3 : i < 10 ? 4 : 5]);
  assert.deepEqual(roundCounts({ holes: h18 }), { eagles: 0, birdies: 2, pars: 8, bogeys: 8, doubles: 0 });
  assert.equal(roundCounts({ holes: h18.slice(0, 9) }), null);
  assert.equal(roundCounts({ is_9_holes: true, holes: h18 }), null);
  assert.deepEqual(monthlyScores([{ date: "2026-06-16", holes: h18 }, { date: "2026-06-20", holes: [] }, { date: "2026-07-01", holes: h18 }]),
    [{ month: "2026-06", birdies: 2, pars: 8, rounds: 1 }, { month: "2026-07", birdies: 2, pars: 8, rounds: 1 }]);
});

import { metricDetail, parseOpts } from "../lib/metrics";
const day = (i: number) => new Date(Date.UTC(2026, 0, 1) + i * 86400e3).toISOString().slice(0, 10);
const clubName = "MAR DEL PLATA GOLF CLUB";

test("handicap history keeps the registration club and does not use it as the cause", () => {
  // 20 Colorada cards, then Azul. The revision before Azul only has 11 cards, so the move is not a verified best-8.
  const base = Array.from({ length: 20 }, (_, i) => ({
    round_id: `b${i}`, date: day(i), course: "Colorada", course_label: null, valid_card: true, gross: 85, is_9_holes: false, differential_computed: 10,
  }));
  const impact = { round_id: "new", date: day(21), course: "Azul", course_label: null, valid_card: true, gross: 72, is_9_holes: false, differential_computed: 5 };
  const D = {
    player: { handicap_index: 8.5 },
    courses: [{ key: "1:Azul", label: "Azul" }],
    hi_history: [
      { date: day(10), club: clubName, hi: 10 },
      { date: day(22), club: clubName, hi: 8.5 },
      { date: day(29), club: clubName, hi: 8.5 },
    ],
    rounds: [...base, impact],
  };
  const h: any = metricDetail(D, "handicap", parseOpts(new URL("http://x/?scope=all")));
  assert.equal(h.history[0].club, clubName);
  assert.equal(h.history[0].course, null);
  assert.equal(h.history[0].verified, true);
  assert.deepEqual(h.history[0].entered_best8, []);
  assert.equal(h.history[1].club, clubName);
  assert.equal(h.history[1].course, null);
  assert.equal(h.history[1].verified, false);
  assert.deepEqual(h.history[1].entered_best8, []);
  assert.equal(h.history[2].club, clubName);
  assert.equal(h.history[2].course, null);
  assert.equal(h.history[2].verified, false);
  for (const row of h.history) {
    for (const list of [row.entered_best8, row.left_best8, row.aged_out, row.entered_window]) {
      assert.equal(list.some((c: any) => String(c.course).includes("MAR DEL PLATA")), false);
    }
  }
});

test("a verified index move names the scorecard that entered, not the registration club", () => {
  const base = Array.from({ length: 20 }, (_, i) => ({
    round_id: `b${i}`, date: day(i), course: "Colorada", course_label: null, valid_card: true, gross: 90, is_9_holes: false, differential_computed: i === 0 ? 1 : 12,
  }));
  const impact = { round_id: "new", date: day(21), course: "Azul", course_label: null, valid_card: true, gross: 72, is_9_holes: false, differential_computed: 2 };
  const D = {
    player: { handicap_index: 8.5 },
    courses: [],
    hi_history: [
      { date: day(19), club: clubName, hi: 10 },
      { date: day(22), club: clubName, hi: 8.5 },
    ],
    rounds: [...base, impact],
  };
  const h: any = metricDetail(D, "handicap", parseOpts(new URL("http://x/?scope=all")));
  const move = h.history[0];
  assert.equal(move.club, clubName);
  assert.equal(move.course, null);
  assert.equal(move.verified, true);
  assert.equal(move.entered_best8.length, 1);
  assert.equal(move.entered_best8[0].id, "new");
  assert.equal(move.entered_best8[0].course, "Azul");
  assert.equal(move.entered_best8[0].differential, 2);
  assert.equal(move.entered_best8[0].gross, 72);
  assert.equal(move.aged_out[0].id, "b0");
  assert.equal(move.aged_out[0].course, "Colorada");
  assert.equal(String(JSON.stringify(move.entered_best8)).includes(clubName), false);
});
