import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { gearPhoto, gearPlayers, silhouetteSrc } from "../lib/club-gear";

test("a GT2 driver photo is not the fairway, and an unknown hybrid stays a silhouette", () => {
  const driver = gearPhoto("Titleist", "GT2", "driver");
  const wood = gearPhoto("Titleist", "GT2", "fairway");
  assert.equal(driver?.src, "/clubs/models/titleist-gt2-driver.jpg");
  assert.equal(wood?.src, "/clubs/models/titleist-gt2-fairway.jpg");
  assert.notEqual(driver?.src, wood?.src);
  assert.equal(gearPhoto("Titleist", "GT2", "hybrid"), null);
  assert.equal(silhouetteSrc("hybrid"), "/clubs/silhouettes/hybrid.svg");
  assert.equal(gearPhoto("Titleist", "GT3", "driver"), null);
  assert.equal(gearPhoto("Titleist", "T100", "iron"), null);
  assert.equal(gearPhoto("Titleist", "T150", "wedge")?.src, "/clubs/models/titleist-t150-iron.jpg");
  assert.equal(gearPhoto(null, null, "putter"), null);
});

test("tour players are only the ones checked for that exact model", () => {
  const drivers = gearPlayers("Titleist", "GT2", "driver").map(p => p.name);
  assert.deepEqual(drivers, ["Will Zalatoris", "Cameron Young", "Bud Cauley"]);
  const woods = gearPlayers("Titleist", "GT2", "fairway").map(p => p.name);
  assert.deepEqual(woods, ["Cameron Young", "Bud Cauley"]);
  assert.equal(gearPlayers("Titleist", "GT2", "hybrid").length, 0);
  assert.deepEqual(gearPlayers("Titleist", "T150", "iron").map(p => p.name), ["Will Zalatoris"]);
  assert.equal(gearPlayers("Titleist", "T100", "iron").length, 0);
  assert.equal(gearPlayers("Titleist", "", "iron").length, 0);
  for (const player of gearPlayers("Titleist", "GT2", "driver")) {
    assert.match(player.sourceUrl, /^https:\/\/golfwrx.com\//);
    assert.match(player.when, /^2025-/);
  }
});

test("the browser gear file names the same photos and players", () => {
  const js = readFileSync(new URL("../public/club-gear.js", import.meta.url), "utf8");
  for (const src of ["/clubs/models/titleist-gt2-driver.jpg", "/clubs/models/titleist-gt2-fairway.jpg", "/clubs/models/titleist-t150-iron.jpg"]) {
    assert.match(js, new RegExp(src.replace(/[.]/g, "\\.")));
  }
  for (const name of ["Will Zalatoris", "Cameron Young", "Bud Cauley"]) assert.match(js, new RegExp(name));
  assert.doesNotMatch(js, /GT3/);
  assert.doesNotMatch(js, /T100/);
});
