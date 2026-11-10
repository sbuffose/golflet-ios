/** TEST-ONLY. Card yards and the bag keep their real API shape. A driver is not invented. */
import assert from "node:assert/strict";
import test from "node:test";
import { bagClubs, frameHole, isDriverClub, isPutterClub, puttMeters, screenOf, teeClub, VISUAL_ZOOM_MAX, worldTile, yardLabel, yardNumber } from "../lib/play-rules";

const VIEW = { width: 390, height: 844 };

test("a tee map is a number of yards, never the object itself", () => {
  assert.equal(yardNumber({ BLANCO: 380, AZUL: "410" }), 410);
  assert.equal(yardLabel({ BLANCO: 380, AZUL: "410" }), "410 yd");
  assert.equal(yardLabel(380), "380 yd");
  assert.equal(yardLabel("256 yd"), "256 yd");
  assert.equal(yardLabel("156,5"), "157 yd");
  assert.equal(yardNumber({}), null);
  assert.equal(yardLabel(null), "");
  assert.equal(yardLabel(undefined), "");
  assert.equal(yardLabel({ BLANCO: "no" }), "");
  assert.equal(String({ BLANCO: 380 }).includes("[object Object]"), true);
  assert.equal(yardLabel({ BLANCO: 380 }).includes("object"), false);
});

test("the bag uses the club the player stored, and Driver is only the par 4 or 5 tee default", () => {
  const bag = [{ club: "Driver", carry: 300, total: 300 }, { club: "7i", carry: 165, total: 165 }, "SW"];
  assert.deepEqual(bagClubs(bag).map(c => c.id), ["Driver", "7i", "SW"]);
  assert.equal(bagClubs([{ code: "Dr", label: "Driver" }])[0].label, "Driver");
  assert.deepEqual(bagClubs(["Madera 3", ""]).map(c => c.id), ["Madera 3"]);
  assert.equal(teeClub(bag, 4, "", true), "Driver");
  assert.equal(teeClub(bag, 5, "", true), "Driver");
  assert.equal(teeClub(bag, 3, "", true), "");
  assert.equal(teeClub(bag, 4, "7i", true), "7i");
  assert.equal(teeClub(bag, 4, "", false), "");
  assert.equal(teeClub([{ club: "7i", carry: 165, total: 165 }], 4, "", true), "");
  assert.equal(teeClub(["Madera 3"], 4, "", true), "");
  assert.equal(isDriverClub("Dr", "Driver"), true);
  assert.equal(isDriverClub("7i", "7i"), false);
  assert.equal(isPutterClub("Pt", "Putter"), true);
  assert.equal(isPutterClub("PW", "PW"), false);
  assert.equal(puttMeters("2,4"), 2.4);
  assert.equal(puttMeters("2.4"), 2.4);
  assert.equal(puttMeters("0,05"), null);
  assert.equal(puttMeters("80"), null);
  assert.equal(puttMeters("abc"), null);
});

test("a hole with only a green is framed on that green and is not called the tee", () => {
  const green = { lat: -38.03381176, lng: -57.53818687 };
  const seek = frameHole(null, green, "tee", VIEW);
  assert.equal(seek?.mode, "seek");
  assert.equal(frameHole(null, green, "seek", VIEW)?.mode, "seek");
  assert.equal(seek?.aimLat, green.lat);
  assert.equal(seek?.aimLng, green.lng);
  const flag = frameHole(null, green, "flag", VIEW);
  assert.equal(flag?.mode, "flag");
  assert.ok((flag?.z || 0) > 17);
  assert.ok((flag?.z || 0) <= VISUAL_ZOOM_MAX);
  assert.equal(worldTile(green.lat, green.lng, flag?.z || 19)?.z, 17);
  const tee = { lat: -34.6, lng: -58.4 };
  const target = { lat: -34.601, lng: -58.401 };
  const play = frameHole(tee, target, "play", VIEW, tee);
  assert.equal(play?.mode, "play");
  assert.ok(play);
  const flagScreen = screenOf(target.lat, target.lng, play, VIEW);
  const teeScreen = screenOf(tee.lat, tee.lng, play, VIEW);
  assert.ok(flagScreen && teeScreen);
  assert.ok(flagScreen[1] < VIEW.height * 0.42);
  assert.ok(teeScreen[1] > VIEW.height * 0.42);
  assert.ok(play.aimLat < tee.lat && play.aimLat > target.lat);
  assert.equal(worldTile(target.lat, target.lng, play.z)?.z, 17);
});
