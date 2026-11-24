import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { attachEquipment, gearPhoto, gearPlayers, silhouetteSrc } from "../lib/club-gear";

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

test("the yardage bag picks up the model confirmed in Mi bolsa", () => {
  const bag = [{ club: "Driver", carry: 285 }, { club: "Madera 3", carry: 230 }, { club: "PW", carry: 120 }, { club: "Putter" }];
  const gear = [
    { code: "Dr", label: "Driver", brand: "Titleist", model: "GT2" },
    { code: "3W", label: "Madera 3", brand: "Titleist", model: "GT2" },
    { code: "PW", label: "Pitching wedge" },
    { code: "Pt", label: "Putter" },
  ];
  const rows = attachEquipment(bag, gear);
  assert.equal(rows[0].brand, "Titleist");
  assert.equal(rows[0].model, "GT2");
  assert.equal(rows[0].category, "driver");
  assert.equal(gearPhoto(rows[0].brand, rows[0].model, rows[0].category)?.src, "/clubs/models/titleist-gt2-driver.jpg");
  assert.equal(gearPhoto(rows[1].brand, rows[1].model, rows[1].category)?.src, "/clubs/models/titleist-gt2-fairway.jpg");
  assert.equal(rows[2].brand, undefined);
  assert.equal(rows[2].category, "wedge");
  assert.equal(rows[3].category, "putter");
  assert.equal(bag[0].brand, undefined);
});

test("the browser gear file names the same photos and players", () => {
  const js = readFileSync(new URL("../public/club-gear.js", import.meta.url), "utf8");
  for (const src of ["/clubs/models/titleist-gt2-driver.jpg", "/clubs/models/titleist-gt2-fairway.jpg", "/clubs/models/titleist-t150-iron.jpg"]) {
    assert.match(js, new RegExp(src.replace(/[.]/g, "\\.")));
  }
  for (const name of ["Will Zalatoris", "Cameron Young", "Bud Cauley"]) assert.match(js, new RegExp(name));
  assert.match(js, /attach:\s*function/);
  assert.doesNotMatch(js, /GT3/);
  assert.doesNotMatch(js, /T100/);
});
