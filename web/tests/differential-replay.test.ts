import { test } from "node:test";
import assert from "node:assert/strict";
import { replayDifferential } from "../lib/differential";

test("80 on 69.4 / 124 replays to 9.7 and a missing PCC stays missing", () => {
  const out = replayDifferential(80, 69.4, 124, null);
  assert.equal(out.value, 9.7);
  assert.equal(out.pcc, "missing");
});

test("a missing slope does not invent a differential or a zero PCC", () => {
  const out = replayDifferential(80, 69.4, null, null);
  assert.equal(out.value, null);
  assert.equal(out.pcc, "missing");
});
