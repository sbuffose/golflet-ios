import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createRequire } from "node:module";
import { createWithLedger, normalizeIdempotencyKey, presentCreatedGroup } from "../lib/group-create";
import { HI_UNIDENTIFIED, hiAttribution, hiCardLine, monthColumns, MONTHS_VISIBLE, officialIndex, onCup, puttFeet, strategyChoice, trackCancel, trackDrop, trackEnter, trackNew, trackPenalty, trackReload, trackSet, windPlay, windRelative, coursePickerGroups } from "../lib/play-rules";

const js = createRequire(import.meta.url)("../public/play-rules.js") as typeof import("../lib/play-rules");

test("el viento meteorológico se lee desde donde viene", () => {
  assert.equal(windRelative(90, 90), "contra");
  assert.equal(windRelative(270, 90), "favor");
  assert.equal(windRelative(0, 90), "cruzado");
  const missing = windPlay(7, 180, null, 20).text;
  assert.match(missing, /Sin rumbo verificado/);
  assert.equal(missing.includes("en contra"), false);
  assert.equal(missing.includes("a favor"), false);
  const none = windPlay(7, null, 90, 20).text;
  assert.match(none, /No clasifico el viento/);
  assert.equal(none.includes("en contra"), false);
  assert.equal(js.windRelative(90, 90), "contra");
  assert.equal(js.windPlay(1, 270, 90, 22).text.includes("a favor"), true);
});

test("el índice oficial es el punto fechado más nuevo", () => {
  const history = [{ date: "2026-10-28", hi: 3.1 }, { date: "2026-11-04", hi: 3.7 }];
  assert.equal(officialIndex(3.1, history), 3.7);
  assert.equal(officialIndex(3.1, []), 3.1);
  assert.equal(officialIndex(null, []), null);
});

test("un cambio de hándicap nombra la tarjeta que entra o sale", () => {
  const rounds = [];
  for (let i = 0; i < 20; i++) {
    const day = String(i + 1).padStart(2, "0");
    rounds.push({ round_id: "n" + i, date: `2026-01-${day}`, valid_card: true, gross: 90, differential_computed: i === 0 ? 1 : 12, course: "Nueva", club_name: "Mar del Plata Golf Club" });
  }
  rounds.push({ round_id: "c1", date: "2026-10-20", valid_card: true, gross: 70, differential_computed: 2, course: "Colorada", club_name: "Mar del Plata Golf Club" });
  const move = hiAttribution({ rounds }, "2026-10-01", "2026-11-04");
  assert.equal(move.verified, true);
  assert.equal(move.enteredBest8.length, 1);
  assert.equal(move.enteredBest8[0].course, "Colorada");
  assert.equal(move.agedOut.length, 1);
  assert.equal(move.agedOut[0].id, "n0");
  assert.equal(move.leftBest8.length, 0);
  const line = hiCardLine(move.enteredBest8[0]);
  assert.equal(line, "20 oct 2026 · Colorada · diferencial 2,0 · gross 70");
  assert.equal(line.includes("índice"), false);
  assert.equal(line.includes("Mar del Plata"), false);
  assert.equal(hiCardLine(move.agedOut[0]).includes("Nueva"), true);
  const stayed = [];
  for (let i = 1; i <= 12; i++) stayed.push({ round_id: "bad" + i, date: `2026-02-${String(i).padStart(2, "0")}`, valid_card: true, gross: 95, differential_computed: 20, course: "Nueva" });
  for (let i = 13; i <= 20; i++) stayed.push({ round_id: "good" + i, date: `2026-02-${String(i).padStart(2, "0")}`, valid_card: true, gross: 74, differential_computed: 2, course: "Nueva" });
  stayed.push({ round_id: "better", date: "2026-03-01", valid_card: true, differential_computed: 1, course_label: "Colorada", course: "", club_name: "Mar del Plata Golf Club" });
  const beat = hiAttribution({ rounds: stayed }, "2026-02-20", "2026-03-01");
  assert.equal(beat.enteredBest8[0].course, "Colorada");
  assert.equal(beat.enteredBest8[0].gross, null);
  assert.equal(hiCardLine(beat.enteredBest8[0]).includes("70"), false);
  assert.equal(beat.leftBest8.map(c => c.id).join(","), "good13");
  assert.equal(beat.agedOut.length, 0);
  const joined = stayed.slice(0, 20).concat([{ round_id: "late", date: "2026-03-02", valid_card: true, gross: 99, differential_computed: 30, course: "Azul" }]);
  const onlyWindow = hiAttribution({ rounds: joined }, "2026-03-01", "2026-03-02");
  assert.equal(onlyWindow.enteredWindow.map(c => c.id).join(","), "late");
  assert.equal(onlyWindow.enteredBest8.length, 0);
  const thin = hiAttribution({ rounds: rounds.slice(0, 5) }, "2026-10-01", "2026-11-04");
  assert.equal(thin.verified, false);
  assert.equal(HI_UNIDENTIFIED, "No puedo identificar la tarjeta.");
  assert.equal(js.hiCardLine(move.enteredBest8[0]).includes("diferencial 2,0"), true);
});

test("el gráfico mensual usa abreviaturas y marca el año", () => {
  const cols = monthColumns([
    { month: "2025-11", birdies: 1, pars: 4 },
    { month: "2025-12", birdies: 2, pars: 3 },
    { month: "2026-01", birdies: 0, pars: 1 },
  ]);
  assert.equal(MONTHS_VISIBLE, 6);
  assert.deepEqual(cols.map(c => c.shortLabel), ["nov", "dic", "ene"]);
  assert.equal(cols[2].showsYear, true);
  assert.match(cols[0].detail, /noviembre 2025/);
  assert.equal(js.monthColumns([{ month: "2026-04", birdies: 1, pars: 1 }])[0].shortLabel, "abr");
});

test("el selector separa el club de las canchas", () => {
  const groups = coursePickerGroups([
    { course_id: "209-vieja", club_code: "209", club_name: "Mar del Plata Golf Club", course_label: "Cancha Vieja", distance_km: 12 },
    { course_id: "209-nueva", club_code: "209", club_name: "Mar del Plata Golf Club", course_label: "Cancha Nueva" },
    { course_id: "118-solo", club_code: "118", club_name: "Jockey Club", course_label: "Jockey Club" },
  ]);
  assert.equal(groups[0].club, "Mar del Plata Golf Club");
  assert.equal(groups[0].distance, "12 km");
  assert.deepEqual(groups[0].rows.map(r => r.name), ["Cancha Vieja", "Cancha Nueva"]);
  assert.equal(groups[1].rows[0].name, "Jugar esta cancha");
});

test("un nivel sin plan no hereda el texto general", () => {
  const general = { plan: "Driver al centro", tee_club: "Driver" };
  const missing = strategyChoice({}, "bajo", general);
  assert.equal(missing.missing, true);
  assert.match(missing.plan, /hándicap bajo/);
  assert.equal(missing.plan.includes("Driver"), false);
  const hit = strategyChoice({ scratch: { plan: "Al centro de la calle", tee_club: null } }, "bajo", general);
  assert.equal(hit.plan, "Al centro de la calle");
});

test("la mira confirma tee, bandera y el hoyo solo en la copa", () => {
  let s = trackNew();
  s = trackSet(s, { lat: 1, lng: 1 });
  assert.equal(s.phase, "confirmFlag");
  s = trackSet(s, { lat: 1.001, lng: 1 });
  assert.equal(s.phase, "tracking");
  const far = trackEnter(s, { lat: 1.01, lng: 1 }, "7i", false);
  assert.equal(far.holed, false);
  assert.equal(far.state.marks[0].countsStroke, true);
  assert.equal(onCup(1.2), true);
  assert.equal(onCup(1.3), false);
  assert.equal(puttFeet(10), Math.round(10 * 3.28084));
  assert.equal(puttFeet(1), null);
  const holed = trackEnter(far.state, { lat: 1.001, lng: 1 }, "Pt", true);
  assert.equal(holed.holed, true);
  let pen = trackPenalty(far.state);
  pen = trackEnter(pen, { lat: 2, lng: 2 }, null, false).state;
  assert.equal(pen.phase, "relief");
  assert.equal(pen.marks.at(-1)?.penalty, true);
  const again = trackReload(pen);
  assert.equal(again.phase, "tracking");
  assert.equal(again.ball?.lat, far.state.marks[0].lat);
  assert.equal(again.marks.length, pen.marks.length);
  const drop = trackSet(trackDrop(pen), { lat: 3, lng: 3 });
  assert.equal(drop.marks.at(-1)?.countsStroke, false);
  assert.equal(drop.phase, "tracking");
  const undone = trackCancel(pen);
  assert.equal(undone.marks.some(m => m.penalty), false);
  assert.equal(js.onCup(1.2), true);
  assert.equal(js.trackEnter(js.trackNew(), { lat: 0, lng: 0 }, null, true).recorded, false);
});

test("crear un grupo devuelve el nombre y no junta dos pedidos distintos", () => {
  const body = presentCreatedGroup({ id: "g1", name: "Scratch" }, [], { url: "/g/abc" }, null);
  assert.equal(body.name, "Scratch");
  assert.equal(body.id, "g1");
  assert.equal(body.group.photo_url, null);
  assert.equal(body.invited.length, 0);
  const ledger = new Map();
  let n = 0;
  const a = createWithLedger(ledger, "u", "k1", "Scratch", () => "id" + (++n));
  const retry = createWithLedger(ledger, "u", "k1", "Scratch", () => "id" + (++n));
  const other = createWithLedger(ledger, "u", "k2", "Scratch", () => "id" + (++n));
  assert.equal(retry.replay, true);
  assert.equal(retry.id, a.id);
  assert.equal(other.replay, false);
  assert.notEqual(other.id, a.id);
  assert.equal(other.name, "Scratch");
  assert.equal(normalizeIdempotencyKey("  abc  "), "abc");
  assert.equal(normalizeIdempotencyKey(""), null);
  const schema = readFileSync(new URL("../db/schema.sql", import.meta.url), "utf8");
  assert.match(schema, /cmp_create_key/);
  assert.equal(/unique\s*\(\s*name\s*\)/i.test(schema), false);
});
