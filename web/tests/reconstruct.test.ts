import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { placeShot } from "../lib/reconstruct-core";
import { countsForClub, computeDistances, type ShotOut } from "../lib/shots-calc";
import { HttpError } from "../lib/http-error";

test("a reconstructed shot never becomes a GPS fix, and an unknown place needs no coordinates", async () => {
  process.env.DATABASE_URL ||= "postgres://golflet_test:golflet_test@127.0.0.1:5432/golflet_reconstruct_test";
  const none = placeShot({});
  assert.equal(none.lat, null);
  assert.equal(none.lng, null);
  assert.equal(none.source, "unknown");
  assert.equal(none.distance_m, null);
  assert.equal(none.distance_label, "Sin distancia");
  assert.equal(none.position_label, "Sin ubicación");
  const typed = placeShot({ distance_m: 142 });
  assert.equal(typed.lat, null);
  assert.equal(typed.source, "estimated");
  assert.equal(typed.distance_kind, "estimated");
  assert.equal(typed.distance_m, 142);
  const marked = placeShot({ lat: -34.5, lng: -58.5, end_lat: -34.501, end_lng: -58.5, penalty_strokes: 1 });
  assert.equal(marked.source, "manual");
  assert.equal(marked.end_source, "manual");
  assert.equal(marked.distance_kind, "estimated");
  assert.ok((marked.distance_m || 0) > 50);
  assert.equal(marked.position_label, "Marcado a mano");
  assert.equal(marked.distance_label, "Distancia estimada");
  assert.equal(marked.penalty_strokes, 1);
  assert.notEqual(marked.source, "gps");
  const zero = placeShot({ lat: 0, lng: 0 });
  assert.equal(zero.lat, null);
  const { parseShot } = await import("../lib/shot-input");
  await assert.rejects(() => Promise.resolve().then(() => parseShot({ hole: 1 })), (e: unknown) => e instanceof HttpError && e.status === 400 && /Posición inválida/.test(e.message));
});

test("hand-placed distances do not enter club averages", () => {
  const manual = { id: "m", hole: 1, shot_number: 1, lat: -34.5, lng: -58.5, accuracy_m: null, club: "7i", lie: "fairway", result: "green", taken_at: "2026-11-07T18:00:00Z", source: "manual", distance_kind: "estimated", distance_m: 140, distance_yd: 153, distance_source: null, to_green_m: null, to_green_yd: null } as ShotOut;
  assert.equal(countsForClub(manual), false);
  const gps = { ...manual, source: "gps", distance_kind: "measured", accuracy_m: 4, distance_source: "next_shot" as const };
  assert.equal(countsForClub(gps), true);
  const out = computeDistances([
    { id: "a", hole: 1, shot_number: 1, lat: null, lng: null, accuracy_m: null, club: "7i", lie: null, result: null, taken_at: "2026-11-07T18:00:00Z", source: "unknown" },
    { id: "b", hole: 1, shot_number: 2, lat: -34.5, lng: -58.5, accuracy_m: 3, club: "PW", lie: "fairway", result: "green", taken_at: "2026-11-07T18:01:00Z", source: "gps" },
  ], {});
  assert.equal(out[0].distance_m, null);
  assert.equal(out[0].distance_source, null);
});

test("the reconstruction migration has no procedural block and does not drop data", () => {
  const file = readFileSync(new URL("../db/migrations/0043_manual_shots.sql", import.meta.url), "utf8");
  assert.equal(file.includes("$$"), false);
  assert.equal(/\bdrop table\b/i.test(file), false);
  assert.equal(/\bdelete from\b/i.test(file), false);
  assert.match(file, /alter column lat drop not null/);
  assert.match(file, /origin text not null default 'live'/);
});
