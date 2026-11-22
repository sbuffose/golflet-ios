import assert from "node:assert/strict";
import test from "node:test";
import { teeBoxes } from "../lib/play-rules.ts";

const green = { lat: -34.48306, lng: -58.52882 };
const far = { lat: -34.48596, lng: -58.53235 };
const near = { lat: -34.4841, lng: -58.53 };

test("la salida más larga se queda con el centro más lejos, y un solo centro no se pinta de un color", () => {
  const named = teeBoxes({ NEGRO: 414, AMARILLO: 320 }, [{ center: near }, { center: far }], green);
  assert.equal(named[0].name, "NEGRO");
  assert.equal(named[0].yards, 414);
  assert.equal(named[0].lat, far.lat);
  assert.equal(named[1].name, "AMARILLO");
  assert.equal(named[1].lat, near.lat);
  const single = teeBoxes({ AZUL: 409 }, [{ center: far }], green);
  assert.equal(single[0].name, "AZUL");
  assert.equal(single[0].lat, null);
  assert.equal(single[0].lng, null);
});
