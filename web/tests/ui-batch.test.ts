import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const placesOf = (rows: { v: number }[]) => {
  const out: number[] = [];
  rows.forEach((x, i) => out.push(i && x.v === rows[i - 1].v ? out[i - 1] : i + 1));
  return out;
};

test("tied scores share the same place", () => {
  assert.deepEqual(placesOf([{ v: 4 }, { v: 4 }, { v: 2 }]), [1, 1, 3]);
  assert.deepEqual(placesOf([{ v: 9 }, { v: 7 }, { v: 7 }]), [1, 2, 2]);
});

test("the closed hole can be edited and the satellite note is gone", () => {
  const track = readFileSync(new URL("../public/track.js", import.meta.url), "utf8");
  const sw = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");
  assert.match(track, /Editar hoyo/);
  assert.match(track, /id="play-shot-editor"/);
  assert.doesNotMatch(track, /Satélite real/);
  assert.match(sw, /golflet-v129/);
  const groups = readFileSync(new URL("../public/groups.js", import.meta.url), "utf8");
  assert.match(groups, /x\.v === rows\[i - 1\]\.v/);
  assert.match(groups, /Pocas tarjetas/);
  const css = readFileSync(new URL("../public/style.css", import.meta.url), "utf8");
  assert.doesNotMatch(css, /#B4553F|#75AADB|#2E7D4F/i);
});
