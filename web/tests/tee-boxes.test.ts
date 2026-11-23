import assert from "node:assert/strict";
import test from "node:test";
import { matchingTee, teeBoxes } from "../lib/play-rules.ts";

const green = { lat: -34.4830601, lng: -58.5288192 };
const back = { lat: -34.4854229, lng: -58.5323458 };
const yellow = { lat: -34.4851158, lng: -58.5319504 };
const north = (yards: number) => ({ lat: green.lat - yards * 0.9144 / 111320, lng: green.lng });

test("cada color se queda con el centro que mide sus yardas, y un solo centro no se pinta", () => {
  const named = teeBoxes({ NEGRO: 414, AMARILLO: 320 }, [{ center: north(320) }, { center: north(414) }], green);
  assert.equal(named[0].name, "NEGRO");
  assert.equal(named[0].yards, 414);
  assert.ok(Math.abs((named[0].lat ?? 0) - north(414).lat) < 1e-6);
  assert.equal(named[1].name, "AMARILLO");
  assert.ok(Math.abs((named[1].lat ?? 0) - north(320).lat) < 1e-6);
  const single = teeBoxes({ AZUL: 409 }, [{ center: north(409) }], green);
  assert.equal(single[0].name, "AZUL");
  assert.equal(single[0].lat, null);
  assert.equal(single[0].lng, null);
});

test("el hoyo 10 de la Azul no arranca en el tee corto ni en un centro de otro hoyo", () => {
  const card = { NEGRO: 488, AZUL: 485, BLANCO: 446, AMARILLO: 403 };
  const boxes = teeBoxes(card, [{ center: yellow }, { center: back }], green);
  const by = (name: string) => boxes.find(b => b.name === name)!;
  assert.equal(by("NEGRO").lat, null);
  assert.equal(by("AZUL").lat, null);
  assert.equal(by("BLANCO").lat, back.lat);
  assert.equal(by("AMARILLO").lat, yellow.lat);
  const junk = { lat: -34.48335, lng: -58.52905 };
  const start = matchingTee(green, card, [junk, yellow, back]);
  assert.equal(start, null);
});
