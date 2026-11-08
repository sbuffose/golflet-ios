import assert from "node:assert/strict";
import test from "node:test";
import { companionMode, createReservationRefresh, diffSnaps, latestCardOutcome, nextCheckedAt, shareFlight, type BookingSnap } from "../lib/booking-refresh";
import { verifiedCourse } from "../lib/club-pages";

const snap = (p: Partial<BookingSnap>): BookingSnap => ({
  id: "t1", userId: "me", date: "2026-11-09", time: "09:00", course: null, gone: false, ...p,
});

test("two overlapping entries share one read and a later entry starts another", async () => {
  let calls = 0;
  let release!: () => void;
  const gate = new Promise<void>(r => { release = r; });
  const flights = new Map<string, Promise<number>>();
  const start = () => { calls++; return gate.then(() => calls); };
  const a = shareFlight(flights, "u", start);
  const b = shareFlight(flights, "u", start);
  await Promise.resolve();
  assert.equal(calls, 1);
  release();
  assert.equal(await a, 1);
  assert.equal(await b, 1);
  const c = shareFlight(flights, "u", () => Promise.resolve(++calls));
  assert.equal(await c, 2);
});

test("offline does not count as a club read and a failure does not move checkedAt", async () => {
  let reads = 0;
  const refresh = createReservationRefresh(async () => { reads++; return { status: "error", fresh: false, checked_at: null, last_checked_at: "2026-11-01T12:00:00.000Z" }; });
  const off = await refresh.enter(false);
  assert.equal(off.phase, "offline");
  assert.match(off.note, /Sin conexión/);
  assert.equal(refresh.reads(), 0);
  assert.equal(reads, 0);
  const bad = await refresh.enter(true);
  assert.equal(bad.phase, "error");
  assert.equal(bad.checkedAt, null);
  assert.equal(bad.lastCheckedAt, "2026-11-01T12:00:00.000Z");
  assert.match(bad.note, /Última lectura/);
  assert.equal(reads, 1);
  assert.equal(nextCheckedAt("2026-11-01T12:00:00.000Z", "error", "2026-11-08T12:00:00.000Z"), "2026-11-01T12:00:00.000Z");
  assert.equal(nextCheckedAt("2026-11-01T12:00:00.000Z", "empty", "2026-11-08T12:00:00.000Z"), "2026-11-08T12:00:00.000Z");
});

test("a cancellation, a reschedule and another player's row stay with their owner", () => {
  const before = [snap({}), snap({ id: "other", userId: "them", date: "2026-11-09" })];
  const after = [
    snap({ id: "t1", gone: true }),
    snap({ id: "t2", date: "2026-11-10", time: "10:20", course: "Cancha Vieja" }),
    snap({ id: "other", userId: "them", date: "2026-12-01", course: "Azul" }),
  ];
  const delta = diffSnaps(before, after, "me");
  assert.deepEqual(delta.gone, ["t1"]);
  assert.deepEqual(delta.new, ["t2"]);
  assert.deepEqual(delta.changed, []);
  assert.equal(JSON.stringify(delta).includes("them"), false);
  const moved = diffSnaps([snap({ course: null })], [snap({ course: "Cancha Vieja", time: "08:00" })], "me");
  assert.deepEqual(moved.changed, ["t1"]);
});

test("the course is the venue name, never the tournament title", () => {
  const courses = ["Cancha Vieja", "Cancha Nueva"];
  assert.deepEqual(verifiedCourse({ venue: "Cancha Vieja" }, courses), { course: "Cancha Vieja", how: "fuente" });
  assert.deepEqual(verifiedCourse({ course: "COPA COLO" }, courses), { course: null, how: null });
  assert.deepEqual(verifiedCourse({ venue: "MdP 09:00" }, courses), { course: null, how: null });
});

test("the explicit reservation button re-reads players and a card with zero new rounds stays the old card", () => {
  assert.deepEqual(companionMode("visit"), { light: true });
  assert.deepEqual(companionMode("players"), { light: false });
  assert.equal(latestCardOutcome([]).note, "No hay una clave guardada para leer el club.");
  assert.equal(latestCardOutcome([{ ok: true, newRounds: 0 }]).note, "No hay una tarjeta nueva. La última sigue siendo la que ya ves.");
  assert.equal(latestCardOutcome([{ ok: false, newRounds: 0, message: "El club no respondió." }]).note, "El club no respondió.");
  assert.equal(latestCardOutcome([{ ok: true, newRounds: 1 }]).note, "Llegó una tarjeta nueva.");
  const partial = latestCardOutcome([
    { club: "Norte", ok: true, newRounds: 0 },
    { club: "Sur", ok: false, newRounds: 0, message: "El club no respondió." },
  ]);
  assert.equal(partial.phase, "partial");
  assert.match(partial.note, /Sur/);
  assert.equal(partial.note.includes("La última sigue siendo la que ya ves."), false);
  const imported = latestCardOutcome([
    { club: "Norte", ok: true, newRounds: 1 },
    { club: "Sur", ok: false, newRounds: 0, message: "timeout" },
  ]);
  assert.match(imported.note, /Llegó una tarjeta nueva/);
  assert.match(imported.note, /Sur/);
});
