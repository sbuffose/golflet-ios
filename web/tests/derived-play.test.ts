/** Distances, hole stats, weather rates and private counts. No personal rows. */
import assert from "node:assert/strict";
import test from "node:test";
import { emptyStatFill, shotDistanceLabel, trackHoleSummary } from "../lib/play-rules";
import { tallyHoles, weatherPlay, type PlayRound, type Wx } from "../lib/weather-core";
import { companionKey, privateMetrics, type PastTee } from "../lib/private-metrics-core";

const wx = (condition: Wx["condition"], wind = 10, temp = 18): Wx => ({
  temp_c: temp, precip_mm: condition === "lluvia" ? 4 : 0, rain_hours: condition === "lluvia" ? 2 : 0,
  wind_kmh: wind, gust_kmh: wind, weather_code: condition === "lluvia" ? 61 : 1, condition,
});
const holes18 = (over: number) => Array.from({ length: 18 }, (_, i) => [i + 1, 4, 4 + over]);

test("el Driver guarda las yardas del punto al punto y un putt no es cualquier palo", () => {
  const tee = { lat: -38.037468, lng: -57.538187 };
  const land = { lat: -38.03567, lng: -57.538187 };
  const drive = shotDistanceLabel({ lat: tee.lat, lng: tee.lng, end_lat: land.lat, end_lng: land.lng, distance_m: null, lie: null });
  assert.equal(drive.kind, "yards");
  assert.match(drive.text, / yd$/);
  assert.notEqual(drive.yards, 445);
  const legacy = shotDistanceLabel({ lat: land.lat, lng: land.lng, prev_lat: tee.lat, prev_lng: tee.lng, distance_m: 0, lie: "green" });
  assert.equal(legacy.kind, "yards");
  assert.ok((legacy.yards || 0) > 100);
  const fringe = shotDistanceLabel({ lat: tee.lat, lng: tee.lng, end_lat: tee.lat + 0.00012, end_lng: tee.lng, lie: null, distance_kind: null });
  assert.equal(fringe.kind, "yards");
  const typed = shotDistanceLabel({ lat: land.lat, lng: land.lng, end_lat: land.lat + 0.00002, end_lng: land.lng, lie: "green", distance_m: "2,4", distance_kind: "manual" });
  assert.equal(typed.text, "2,4 m a mano");
  const putt = shotDistanceLabel({ lat: land.lat, lng: land.lng, end_lat: land.lat + 0.00002, end_lng: land.lng, lie: "green" });
  assert.equal(putt.kind, "putt");
  assert.match(putt.text, / m$/);
});

test("los putts salen del green y el centro no completa el hoyo", () => {
  const open = trackHoleSummary(4, [
    { endLie: "fairway" },
    { endLie: null },
    { originGreen: true, endLie: "green" },
  ]);
  assert.equal(open.putts, null);
  assert.equal(open.fir, "fairway");
  assert.equal(open.gir, false);
  const unknown = trackHoleSummary(4, [{ endLie: "fairway" }, { endLie: null }]);
  assert.equal(unknown.gir, null);
  const done = trackHoleSummary(4, [
    { endLie: "fairway" },
    { endLie: "green" },
    { originGreen: true, endLie: null },
    { originGreen: true, holed: true, endLie: null },
  ]);
  assert.equal(done.putts, 2);
  assert.equal(done.gir, true);
  const late = trackHoleSummary(4, [
    { endLie: "rough" },
    { endLie: "bunker" },
    { penalty: true },
    { endLie: "green", originGreen: true, holed: true },
  ]);
  assert.equal(late.gir, false);
  assert.equal(late.fir, "other");
  const pending = trackHoleSummary(5, [{ endLie: null, holed: true }]);
  assert.equal(pending.fir, null);
  assert.equal(pending.gir, null);
  assert.match(pending.lines.join(" "), /falta/);
  assert.equal(emptyStatFill({ putts: 1, gir: null, drive: null, rev: 3 }, { putts: 2, gir: true, fir: "fairway" })?.putts, undefined);
  assert.equal(emptyStatFill({ putts: 1, gir: null, drive: null, rev: 3 }, { putts: 2, gir: true, fir: "fairway" })?.gir, true);
  assert.equal(emptyStatFill({ putts: 1, gir: true, drive: "fairway", rev: 3 }, { putts: 2, gir: false, fir: "other" }), null);
});

test("el clima compara tasas y no suma los golpes", () => {
  const round = (id: string, condition: Wx["condition"], over: number, course = "Cancha Vieja", tee = "Azul"): PlayRound => ({
    round_id: id, date: "2026-10-01", course, tee, differential: over, gross: 72 + over * 18, holes: holes18(over), wx: wx(condition),
  });
  const play = weatherPlay([
    round("a", "lluvia", 1), round("b", "lluvia", 1), round("c", "lluvia", 1),
    round("d", "despejado", 0), round("e", "despejado", 0), round("f", "despejado", 0),
  ]);
  const wet = play.lluvia.find(b => b.key === "lluvia");
  assert.equal(wet?.n, 3);
  assert.equal(wet?.comparable, true);
  assert.equal(wet?.mix?.bogeys.per_18, 18);
  assert.equal(wet?.mix?.birdies.per_18, 0);
  assert.match(wet?.sentence || "", /hubo más bogeys/);
  assert.equal(wet?.sentence?.includes("causa"), false);
  const mixed = weatherPlay([
    round("a", "lluvia", 1, "Cancha Vieja"), round("b", "lluvia", 1, "Cancha Nueva"), round("c", "lluvia", 1, "Azul"),
    round("d", "despejado", 0), round("e", "despejado", 0), round("f", "despejado", 0),
  ]);
  const wetMix = mixed.lluvia.find(b => b.key === "lluvia");
  assert.equal(wetMix?.comparable, false);
  assert.equal(wetMix?.sentence, null);
  assert.match(wetMix?.note || "", /No las comparo/);
  assert.equal(tallyHoles([[1, 4, 3]], false), null);
});

test("los compañeros no se juntan por un token y el número es una cantidad", () => {
  const tee = (id: string, companions: PastTee["companions"], diff: number | null): PastTee => ({
    id, date: "2026-10-0" + id, time: "09:00", club_name: "Mar del Plata Golf Club", course_label: "Cancha Vieja",
    companions, round_id: "r" + id, differential: diff, gross: 80, scores: { eagles: 0, birdies: 2, pars: 8, bogeys: 6, doubles: 2, holes: 18 },
  });
  const m = privateMetrics([
    tee("1", [{ name: "Juan García" }, { name: "García", player_id: "p9" }], 4),
    tee("2", [{ name: "Juan García" }], 5),
    tee("3", [{ name: "García", player_id: "p9" }], 6),
    tee("4", ["Sempe"], null),
  ]);
  const names = m.partners.map(p => p.name);
  assert.ok(names.includes("Juan García"));
  assert.ok(names.includes("García"));
  assert.equal(m.partners.find(p => p.name === "Juan García")?.count, 2);
  assert.equal(m.partners.find(p => p.key === "id:p9")?.count, 2);
  assert.notEqual(companionKey("Juan García")?.key, companionKey("García")?.key);
  assert.equal(m.unit, "salidas");
  assert.equal(m.bands.find(b => b.key === "manana")?.played, 4);
  assert.equal(m.bands.find(b => b.key === "manana")?.scores?.cards, 4);
});
