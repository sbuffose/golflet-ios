/** A missing coordinate stays missing. Numeric zero is a real coordinate. (0, 0) is not a saved point. */
import assert from "node:assert/strict";
import test from "node:test";
import { validLatLng } from "../lib/geo";
import { knownPoint } from "../lib/play-rules";
import { placeShot } from "../lib/reconstruct-core";

const cases: { lat: unknown; lng: unknown; point: { lat: number; lng: number } | null }[] = [
  { lat: null, lng: null, point: null },
  { lat: undefined, lng: undefined, point: null },
  { lat: "", lng: "", point: null },
  { lat: "  ", lng: "\n", point: null },
  { lat: "null", lng: "0", point: null },
  { lat: null, lng: -58.4, point: null },
  { lat: "", lng: -58.4, point: null },
  { lat: -34.6, lng: "", point: null },
  { lat: "0", lng: "0", point: null },
  { lat: 0, lng: 0, point: null },
  { lat: 0, lng: -58.4, point: { lat: 0, lng: -58.4 } },
  { lat: -34.6, lng: 0, point: { lat: -34.6, lng: 0 } },
  { lat: " -34.6 ", lng: "-58.4", point: { lat: -34.6, lng: -58.4 } },
  { lat: 91, lng: 0, point: null },
  { lat: 0, lng: 181, point: null },
  { lat: false, lng: 1, point: null },
];

test("a blank shot endpoint is unknown and a numeric zero is not turned into a missing point", () => {
  for (const row of cases) {
    assert.deepEqual(knownPoint(row.lat, row.lng), row.point, `${String(row.lat)},${String(row.lng)}`);
    assert.deepEqual(validLatLng(row.lat, row.lng), row.point, `${String(row.lat)},${String(row.lng)}`);
  }
  const missing = placeShot({ lat: null, lng: null, end_lat: null, end_lng: null, distance_m: null });
  assert.equal(missing.lat, null);
  assert.equal(missing.end_lat, null);
  assert.equal(missing.distance_m, null);
  assert.equal(missing.position_label, "Sin ubicación");
  assert.equal(missing.distance_label, "Sin distancia");
  const partial = placeShot({ lat: null, lng: -58.4, end_lat: "", end_lng: -58.4 });
  assert.equal(partial.lat, null);
  assert.equal(partial.lng, null);
  assert.equal(partial.end_lat, null);
  const equator = placeShot({ lat: 0, lng: -58.4 });
  assert.equal(equator.lat, 0);
  assert.equal(equator.lng, -58.4);
  assert.equal(equator.source, "manual");
  const island = placeShot({ lat: 0, lng: 0 });
  assert.equal(island.lat, null);
  assert.equal(island.lng, null);
});
