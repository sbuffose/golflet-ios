/** TRACK fills a hole only when the shots can confirm it. A lost ball never enters a club average. */
import assert from "node:assert/strict";
import test from "node:test";
import { deriveHoleCard } from "../lib/play-rules";
import { countsForClub, type ShotOut } from "../lib/shots-calc";

const drive = { endLie: "fairway" as const, direction: "left" as const };
const green = { endLie: "green" as const };
const putt = { lie: "green", putt: true, originGreen: true, holed: true, endLie: "green" as const };

test("a finished hole confirms putts, side and green, and a par 3 has no fairway", () => {
  const hole = deriveHoleCard(4, [drive, green, putt]);
  assert.equal(hole.putts.state, "track");
  assert.equal(hole.putts.value, 1);
  assert.deepEqual(hole.drive, { value: "left", state: "track" });
  assert.equal(hole.gir.state, "track");
  assert.equal(hole.gir.value, true);
  const par3 = deriveHoleCard(3, [green, putt]);
  assert.equal(par3.drive.state, "na");
  assert.equal(par3.drive.value, null);
});

test("an open hole without a lie stays unconfirmed", () => {
  const hole = deriveHoleCard(4, [{ penalty: false }]);
  assert.equal(hole.putts.state, "unconfirmed");
  assert.equal(hole.putts.value, null);
  assert.equal(hole.drive.state, "unconfirmed");
  assert.equal(hole.gir.state, "unconfirmed");
});

test("the lost ball distance is excluded from the club average", () => {
  const shot = (result: string | null) => ({ source: "gps", club: "Dr", distance_m: 220, distance_kind: "measured", result, accuracy_m: 4 }) as ShotOut;
  assert.equal(countsForClub(shot("lost")), false);
  assert.equal(countsForClub(shot(null)), true);
});
