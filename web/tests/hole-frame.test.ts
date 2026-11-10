/** TEST-ONLY. Hole framing uses verified ends. Imagery check hits the public course read and Esri, not a fixture JPEG. */
import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { ESRI_BLANK_TILE_SHA256, frameHole, holeSpan, IMAGERY_ZOOM_MAX, knownPoint, screenOf, VISUAL_ZOOM_MAX, worldTile } from "../lib/play-rules";
import { COLORADA_GREEN_AXIS, VIEJA_GREEN_AXIS } from "../lib/golfistics-axis";
import { azulOsmHoles } from "../lib/azul-osm";

const VIEW = { width: 390, height: 844 };

test("a new hole frames the flag, and a missing or absurd end is not invented", () => {
  const flag = { lat: -38.033812, lng: -57.538187 };
  const tee = { lat: flag.lat - 407 / 111320, lng: flag.lng };
  const overview = frameHole(tee, flag, "overview", VIEW);
  assert.ok(overview);
  assert.equal(overview.mode, "overview");
  assert.equal(overview.aimLat, flag.lat);
  assert.ok(overview.bearing != null && (overview.bearing < 8 || overview.bearing > 352));
  const flagScreen = screenOf(flag.lat, flag.lng, overview, VIEW);
  const teeScreen = screenOf(tee.lat, tee.lng, overview, VIEW);
  assert.ok(flagScreen && teeScreen);
  assert.ok(Math.abs(flagScreen[1] - VIEW.height * 0.42) < 2);
  assert.ok(teeScreen[1] > flagScreen[1] + 80);
  assert.ok(teeScreen[1] < VIEW.height);
  const teeCam = frameHole(tee, flag, "tee", VIEW);
  const flagCam = frameHole(tee, flag, "flag", VIEW);
  assert.equal(teeCam?.aimLat, tee.lat);
  assert.equal(flagCam?.aimLat, flag.lat);
  assert.ok((teeCam?.z || 0) >= (overview.z));
  assert.ok((flagCam?.z || 0) > overview.z - 0.01);
  assert.ok(Math.floor(overview.z) <= IMAGERY_ZOOM_MAX);
  assert.equal(worldTile(flag.lat, flag.lng, 19)?.z, IMAGERY_ZOOM_MAX);
  const onlyFlag = frameHole(null, flag, "tee", VIEW);
  assert.equal(onlyFlag?.mode, "seek");
  assert.notEqual(onlyFlag?.mode, "tee");
  assert.equal(onlyFlag?.bearing, null);
  assert.equal(onlyFlag?.aimLat, flag.lat);
  const flagClose = frameHole(tee, flag, "flag", VIEW);
  assert.ok((flagClose?.z || 0) > IMAGERY_ZOOM_MAX);
  assert.ok((flagClose?.z || 0) <= VISUAL_ZOOM_MAX);
  assert.equal(worldTile(flag.lat, flag.lng, flagClose?.z || 19)?.z, IMAGERY_ZOOM_MAX);
  const teeOnly = frameHole(tee, null, "tee", VIEW);
  assert.equal(teeOnly?.mode, "tee");
  assert.equal(teeOnly?.aimLat, tee.lat);
  assert.equal(frameHole(null, null, "overview", VIEW), null);
  assert.equal(frameHole({ lat: 0, lng: 0 }, flag, "overview", VIEW)?.aimLat, flag.lat);
  assert.equal(knownPoint(0, 0), null);
  assert.equal(holeSpan(tee, { lat: tee.lat - 2, lng: tee.lng }), null);
  assert.equal(frameHole(tee, { lat: tee.lat - 2, lng: tee.lng }, "overview", VIEW), null);
  const absurd = { lat: tee.lat - 2, lng: tee.lng };
  const shown = frameHole(null, absurd, "seek", VIEW);
  assert.equal(shown?.bearing, null);
  assert.equal(shown?.aimLat, absurd.lat);
  assert.equal(holeSpan(flag, flag), null);
  for (const axis of [...VIEJA_GREEN_AXIS, ...COLORADA_GREEN_AXIS]) {
    const shown = frameHole(null, axis.center, "seek", VIEW);
    assert.equal(shown?.bearing, null, `hoyo ${axis.hole}`);
    assert.equal(shown?.aimLat, axis.center.lat);
    const far = { lat: axis.center.lat - 2, lng: axis.center.lng };
    assert.equal(holeSpan(far, axis.center), null);
    assert.equal(frameHole(far, axis.center, "overview", VIEW), null);
  }
  const azul = azulOsmHoles();
  assert.equal(azul.length, 18);
  for (const h of azul) {
    const flag = h.green.center;
    assert.ok(flag, `azul ${h.hole}`);
    const tee = h.line[0] || null;
    if (tee && holeSpan(tee, flag)) assert.ok(frameHole(tee, flag, "overview", VIEW)?.bearing != null);
    else assert.equal(frameHole(null, flag, "seek", VIEW)?.bearing, null);
  }
});

test("Cancha Vieja hole 1 sits on the club and zoom 17 is real imagery", { timeout: 30_000 }, async () => {
  const coursesRes = await fetch("https://app.golfistics.com/golf/viewmaster_get_courses_anonimo.php?club=209", { headers: { "User-Agent": "Golflet/1.0" } });
  assert.equal(coursesRes.status, 200);
  const courses = await coursesRes.json() as { course_name?: string }[];
  const name = courses.find(c => /cancha vieja/i.test(c.course_name || ""))?.course_name;
  assert.equal(name, "MAR DEL PLATA CANCHA VIEJA");
  const holesRes = await fetch(`https://app.golfistics.com/golf/viewmaster_get_holes_anonimo.php?course=${encodeURIComponent(name)}&club=209`, { headers: { "User-Agent": "Golflet/1.0" } });
  assert.equal(holesRes.status, 200);
  const holes = await holesRes.json() as { hole_number: number; center_lat: string; center_lng: string }[];
  const hole = holes.find(h => Number(h.hole_number) === 1);
  assert.ok(hole);
  const flag = { lat: Number(hole.center_lat), lng: Number(hole.center_lng) };
  assert.ok(flag.lat < -38.029 && flag.lat > -38.041, `lat ${flag.lat}`);
  assert.ok(flag.lng < -57.534 && flag.lng > -57.545, `lng ${flag.lng}`);
  const tee = { lat: flag.lat - 407 / 111320, lng: flag.lng };
  const frame = frameHole(tee, flag, "overview", VIEW);
  assert.ok(frame);
  const tile = worldTile(flag.lat, flag.lng, frame.z);
  assert.ok(tile);
  assert.equal(tile.z <= IMAGERY_ZOOM_MAX, true);
  const imagery = (z: number, x: number, y: number) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`;
  const good = Buffer.from(await (await fetch(imagery(tile.z, tile.x, tile.y))).arrayBuffer());
  const n = 2 ** 18;
  const x = Math.floor((flag.lng + 180) / 360 * n);
  const s = Math.sin(flag.lat * Math.PI / 180);
  const y = Math.floor((0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n);
  const grey = Buffer.from(await (await fetch(imagery(18, x, y))).arrayBuffer());
  assert.ok(good.length > 8000, `real tile ${good.length}`);
  assert.ok(grey.length < 4000, `placeholder ${grey.length}`);
  assert.notEqual(good.length, grey.length);
  assert.equal(createHash("sha256").update(grey).digest("hex"), ESRI_BLANK_TILE_SHA256);
  assert.notEqual(createHash("sha256").update(good).digest("hex"), ESRI_BLANK_TILE_SHA256);
});
