/** Two matrículas never share a Golflet user, a login session, or a sync write. Fixture ids only. */
import assert from "node:assert/strict";
import test from "node:test";
import { bindDecision, loginUserId, matriculaFromCookies, syncWriteAllowed } from "../lib/matricula-guard";

const JUGADOR_A = "user-100001";
const JUGADOR_B = "user-100002";

test("un usuario identificado como 100001 no puede vincular ni sincronizar 100002", () => {
  const blocked = bindDecision({
    userId: JUGADOR_A,
    incoming: "100002",
    identity: "100001",
    clubMatriculas: ["100002", "100001"],
    identityOwnerId: JUGADOR_B,
  });
  assert.equal(blocked.ok, false);
  if (!blocked.ok) assert.equal(blocked.reason, "owned_by_other");

  const sameAccount = bindDecision({
    userId: JUGADOR_A,
    incoming: "100002",
    identity: "100001",
    clubMatriculas: ["100001"],
    identityOwnerId: null,
  });
  assert.equal(sameAccount.ok, false);
  if (!sameAccount.ok) assert.equal(sameAccount.reason, "other_matricula");

  const own = bindDecision({
    userId: JUGADOR_A,
    incoming: "100001",
    identity: "100001",
    clubMatriculas: ["100001", "100002"],
    identityOwnerId: JUGADOR_A,
  });
  assert.equal(own.ok, true);
});

test("el ingreso de una matrícula no abre la sesión de otra", () => {
  const asJugadorA = loginUserId("100001", [
    { userId: JUGADOR_A, identity: "100001", via: "identity" },
    { userId: JUGADOR_B, identity: "100002", via: "identity" },
    { userId: JUGADOR_A, identity: "100001", via: "club" },
  ]);
  const asJugadorB = loginUserId("100002", [
    { userId: JUGADOR_B, identity: "100002", via: "identity" },
    { userId: JUGADOR_A, identity: "100001", via: "club" },
    { userId: JUGADOR_A, identity: "100001", via: "identity" },
  ]);
  const stray = loginUserId("100002", [
    { userId: JUGADOR_A, identity: "100001", via: "club" },
  ]);
  assert.equal(asJugadorA, JUGADOR_A);
  assert.equal(asJugadorB, JUGADOR_B);
  assert.equal(stray, null);
  assert.notEqual(asJugadorA, asJugadorB);
});

test("una sincronización no escribe tarjetas de otra matrícula", () => {
  assert.equal(syncWriteAllowed("100001", "100002"), false);
  assert.equal(syncWriteAllowed("100002", "100001"), false);
  assert.equal(syncWriteAllowed("100002", ""), false);
  assert.equal(syncWriteAllowed("100002", null), false);
  assert.equal(syncWriteAllowed("100002", "100002"), true);
  assert.equal(syncWriteAllowed(" 100002 ", "100002"), true);
});

test("la matrícula se lee de la cookie del club y no de otro campo", () => {
  const cookies = new Map<string, string>([
    ["session", "abc"],
    ["userid", "100002"],
    ["username", "JugadorB"],
  ]);
  assert.equal(matriculaFromCookies(cookies), "100002");
  assert.equal(matriculaFromCookies(new Map([["prefs", "userid%3D100001"]])), "100001");
  assert.equal(matriculaFromCookies(new Map([["blob", "CodigoClub=118&userid=100001"]])), "100001");
  assert.equal(matriculaFromCookies(new Map([["session", "abc"]])), null);
});
