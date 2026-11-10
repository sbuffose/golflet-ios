/** Colorada tees are the OSM hole ways. Cancha Vieja has none. Nothing is projected from the card. */
import assert from "node:assert/strict";
import test from "node:test";
import { coloradaOsmHole, isJockeyColorada } from "../lib/colorada-osm";
import { COLORADA_GREEN_AXIS, VIEJA_GREEN_AXIS } from "../lib/golfistics-axis";
import { holeSpan } from "../lib/play-rules";

test("Colorada 1–18 uses the OSM tee and the Golfistics green; Vieja has no tee", () => {
  assert.equal(isJockeyColorada("118", "Colorada"), true);
  assert.equal(isJockeyColorada("118", "Cancha Colorada"), true);
  assert.equal(isJockeyColorada("209", "Cancha Vieja"), false);
  assert.equal(isJockeyColorada("118", "Azul"), false);
  for (const axis of COLORADA_GREEN_AXIS) {
    const osm = coloradaOsmHole(axis.hole);
    assert.ok(osm, `hoyo ${axis.hole} sin way`);
    assert.equal(osm.ref, `${axis.hole}C`);
    assert.ok(osm.end_m <= 70, `hoyo ${axis.hole} extremo a ${osm.end_m} m`);
    const span = holeSpan(osm.tee, axis.center);
    assert.ok(span, `hoyo ${axis.hole} no tiene rumbo`);
    assert.ok(span.meters >= 40 && span.meters <= 700);
  }
  assert.equal(coloradaOsmHole(19), null);
  for (const axis of VIEJA_GREEN_AXIS) {
    assert.ok(axis.center.lat < -38);
    assert.equal(isJockeyColorada("209", "Cancha Vieja"), false);
  }
});
