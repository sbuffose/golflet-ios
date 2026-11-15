/** Two matrículas never share a Golflet user, a login session, or a sync write. Fixture ids only. */
import assert from "node:assert/strict";
import test from "node:test";
import { bindDecision, loginUserId, matriculaFromCookies, syncWriteAllowed } from "../lib/matricula-guard";

const RODRIGO = "user-72291";
const SEBASTIAN = "user-94506";

test("un usuario identificado como 72291 no puede vincular ni sincronizar 94506", () => {
  const blocked = bindDecision({
    userId: RODRIGO,
    incoming: "94506",
    identity: "72291",
    clubMatriculas: ["94506", "72291"],
    identityOwnerId: SEBASTIAN,
  });
  assert.equal(blocked.ok, false);
  if (!blocked.ok) assert.equal(blocked.reason, "owned_by_other");

  const sameAccount = bindDecision({
    userId: RODRIGO,
    incoming: "94506",
    identity: "72291",
    clubMatriculas: ["72291"],
    identityOwnerId: null,
  });
  assert.equal(sameAccount.ok, false);
  if (!sameAccount.ok) assert.equal(sameAccount.reason, "other_matricula");

  const own = bindDecision({
    userId: RODRIGO,
    incoming: "72291",
    identity: "72291",
    clubMatriculas: ["72291", "94506"],
    identityOwnerId: RODRIGO,
  });
  assert.equal(own.ok, true);
});

test("el ingreso de una matrícula no abre la sesión de otra", () => {
  const asRodrigo = loginUserId("72291", [
    { userId: RODRIGO, identity: "72291", via: "identity" },
    { userId: SEBASTIAN, identity: "94506", via: "identity" },
    { userId: RODRIGO, identity: "72291", via: "club" },
  ]);
  const asSebastian = loginUserId("94506", [
    { userId: SEBASTIAN, identity: "94506", via: "identity" },
    { userId: RODRIGO, identity: "72291", via: "club" },
    { userId: RODRIGO, identity: "72291", via: "identity" },
  ]);
  const stray = loginUserId("94506", [
    { userId: RODRIGO, identity: "72291", via: "club" },
  ]);
  assert.equal(asRodrigo, RODRIGO);
  assert.equal(asSebastian, SEBASTIAN);
  assert.equal(stray, null);
  assert.notEqual(asRodrigo, asSebastian);
});

test("una sincronización no escribe tarjetas de otra matrícula", () => {
  assert.equal(syncWriteAllowed("72291", "94506"), false);
  assert.equal(syncWriteAllowed("94506", "72291"), false);
  assert.equal(syncWriteAllowed("94506", ""), false);
  assert.equal(syncWriteAllowed("94506", null), false);
  assert.equal(syncWriteAllowed("94506", "94506"), true);
  assert.equal(syncWriteAllowed(" 94506 ", "94506"), true);
});

test("la matrícula se lee de la cookie del club y no de otro campo", () => {
  const cookies = new Map<string, string>([
    ["session", "abc"],
    ["userid", "94506"],
    ["username", "Buffo"],
  ]);
  assert.equal(matriculaFromCookies(cookies), "94506");
  assert.equal(matriculaFromCookies(new Map([["prefs", "userid%3D72291"]])), "72291");
  assert.equal(matriculaFromCookies(new Map([["blob", "CodigoClub=118&userid=72291"]])), "72291");
  assert.equal(matriculaFromCookies(new Map([["session", "abc"]])), null);
});
