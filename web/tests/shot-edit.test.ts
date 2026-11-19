import assert from "node:assert/strict";
import test from "node:test";
import { deleteLine, excludeLine, postedStrokes } from "../lib/shot-edit";

test("borrar un golpe dice si el score del hoyo cambia", () => {
  assert.equal(deleteLine(5, null), "El hoyo pasa de 5 a 4 golpes. Las distancias de este palo se recalculan.");
  assert.match(deleteLine(5, 5), /sigue en 5/);
  assert.match(deleteLine(5, 5), /pasan de 5 a 4/);
  assert.match(excludeLine, /sigue en el hoyo/);
  assert.equal(postedStrokes([[1, 4, 5], [2, 3, 4]], 1), 5);
  assert.equal(postedStrokes([{ hole: 1, strokes: 6 }], 1), 6);
  assert.equal(postedStrokes(null, 1), null);
});

test("las caras del grupo cuentan al dueño y no inventan una foto", async () => {
  process.env.DATABASE_URL ||= "postgres://golflet_test:golflet_test@127.0.0.1:5432/golflet_reconstruct_test";
  const { shapeGroupFaces } = await import("../lib/groups");
  const faces = shapeGroupFaces([
    { member_id: "a", user_id: "u1", role: "admin", name: "Ana Pérez", photo: false, shareProfile: true },
    { member_id: "b", user_id: "u2", role: "member", name: "Luis Gómez", photo: true, shareProfile: false },
  ], "g-familia", "u1");
  assert.equal(faces.length, 2);
  assert.equal(faces[0].is_owner, true);
  assert.equal(faces[0].photo_url, null);
  assert.equal(faces[1].photo_url, null);
  assert.equal(faces[0].initials, "AP");
});
