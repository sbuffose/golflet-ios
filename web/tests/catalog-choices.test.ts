import { test } from "node:test";
import assert from "node:assert/strict";
import { catalogChoices, modelsFor } from "../lib/club-catalog";

test("Titleist irons include the current set", () => {
  const models = modelsFor("Titleist", "iron");
  for (const name of ["T100", "T150", "T200", "T250", "T350", "620 CB", "620 MB", "U505", "T100S", "T300"]) {
    assert.equal(models.includes(name), true, name);
  }
});

test("a model that is not in the catalog can still be used", () => {
  const out = catalogChoices(["T100", "T150"], "CB");
  assert.equal(out.at(-1)?.label, "Usar «CB»");
  assert.equal(out.at(-1)?.custom, true);
});
