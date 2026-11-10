/** course_map_hole is [lng, lat]. The fixture is the production export, slimmed. Nothing else hardcodes those points. */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { courseMapEnds, overlayCourseMapHole } from "../lib/course-map-geom";
import { holeSpan } from "../lib/play-rules";

const rows = JSON.parse(readFileSync(new URL("./fixtures/course-map-holes.json", import.meta.url), "utf8")) as {
  club_code: string; course: string; hole: number; data: any;
}[];
const of = (course: string) => rows.filter(r => r.course === course).sort((a, b) => a.hole - b.hole);

test("course_map_hole is the tee and the green, and Vieja 7 and 16 are absent", () => {
  const vieja = of("Cancha Vieja");
  assert.deepEqual(vieja.map(r => r.hole), [1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 13, 14, 15, 17, 18]);
  for (const row of vieja) {
    const ends = courseMapEnds(row.data);
    assert.ok(ends.tee && ends.center, `hoyo ${row.hole}`);
    assert.ok(ends.tee.lat < -38 && ends.tee.lng < -57, `hoyo ${row.hole} quedó invertido`);
    const span = holeSpan(ends.tee, ends.center);
    assert.ok(span && span.meters >= 40 && span.meters <= 700, `hoyo ${row.hole} sin rumbo`);
    assert.ok((ends.polygon || []).length >= 3);
  }
  for (const course of ["Colorada", "Azul"]) {
    const holes = of(course);
    assert.equal(holes.length, 18);
    for (const row of holes) {
      const ends = courseMapEnds(row.data);
      const tee = ends.tee;
      const flag = ends.center;
      if (tee && flag) {
        const span = holeSpan(tee, flag);
        assert.ok(span, `${course} ${row.hole}`);
      } else {
        assert.ok(tee || flag, `${course} ${row.hole} no tiene ningún extremo`);
      }
    }
  }
  const colorada1 = courseMapEnds(of("Colorada").find(r => r.hole === 1)!.data);
  assert.equal(colorada1.center, null);
  assert.ok(colorada1.tee);
  const kept = overlayCourseMapHole({ tee: null, green: { center: { lat: -34.49, lng: -58.53 } } }, of("Colorada").find(r => r.hole === 1)!.data);
  assert.equal(kept.green.center.lat, -34.49);
  assert.ok(kept.tee);
  assert.equal(kept.tee.lat, colorada1.tee!.lat);
  const hole4 = overlayCourseMapHole({ tee: { lat: 1, lng: 2 }, green: { center: { lat: -34.49, lng: -58.53 } } }, of("Colorada").find(r => r.hole === 4)!.data);
  assert.ok(hole4.tee);
  assert.notEqual(hole4.tee.lat, 1);
  assert.ok(hole4.tee.lat < -34);
});
