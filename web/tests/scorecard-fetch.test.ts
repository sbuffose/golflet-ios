import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  FIRST_DELAY_MS, applyAttempt, artTeeInstant, blankJob, isDue, nextAttempt, planDue, reconcileJob, scorecardLabel,
  type FetchJob, type RoundHit, type TeeSnap,
} from "../lib/scorecard-fetch-core";

const tee = artTeeInstant("2026-11-07", "14:00");
const first = nextAttempt(tee, null);
const afternoon = artTeeInstant("2026-11-07", "19:00");

function job(over: Partial<FetchJob> & Pick<FetchJob, "id">): FetchJob {
  return blankJob({
    userId: "u1", playedAt: tee.toISOString(), date: "2026-11-07", time: "14:00",
    accountId: "acc", source: "site", matricula: "100", hasPassword: true,
    clubCode: "118", courseLabel: "Azul", clubName: "Jockey",
    nextAttemptAt: first.toISOString(), status: "scheduled", ...over,
  });
}

const teeSnap = (over: Partial<TeeSnap> = {}): TeeSnap => ({
  date: "2026-11-07", time: "14:00", gone: false, courseLabel: "Azul", roundId: null,
  clubName: "Jockey", clubCode: "118", accountId: "acc", ...over,
});

test("the first read is five hours after the tee, in Argentina, not at the morning cron", () => {
  assert.equal(FIRST_DELAY_MS, 5 * 60 * 60 * 1000);
  assert.equal(tee.toISOString(), "2026-11-07T17:00:00.000Z");
  assert.equal(first.toISOString(), "2026-11-07T22:00:00.000Z");
  assert.equal(isDue(tee, null, new Date("2026-11-07T21:59:00.000Z")), false);
  assert.equal(isDue(tee, null, new Date("2026-11-07T22:00:00.000Z")), true);
  assert.equal(isDue(tee, null, artTeeInstant("2026-11-07", "06:00")), false);
  assert.equal(nextAttempt(tee, first).toISOString(), "2026-11-07T23:00:00.000Z");
  const late = artTeeInstant("2026-11-07", "23:30");
  assert.equal(nextAttempt(tee, late).toISOString(), new Date(late.getTime() + 24 * 60 * 60 * 1000).toISOString());
  const night = artTeeInstant("2026-11-07", "20:00");
  assert.equal(nextAttempt(night, null).toISOString(), artTeeInstant("2026-11-08", "01:00").toISOString());
  assert.equal(nextAttempt(night, nextAttempt(night, null)).toISOString(), artTeeInstant("2026-11-08", "02:00").toISOString());
});

test("a sync from the morning does not satisfy an afternoon tee, and a sync already running is not a silent skip", () => {
  const stale = planDue([job({ id: "a", lastSyncAt: artTeeInstant("2026-11-07", "06:00").toISOString(), lastSyncStatus: "ok" })], afternoon);
  assert.equal(stale.actions.some(a => a.kind === "sync"), true);
  const fresh = planDue([job({ id: "a", lastSyncAt: new Date(afternoon.getTime() - 30_000).toISOString(), lastSyncStatus: "ok" })], afternoon);
  assert.equal(fresh.actions.some(a => a.kind === "reuse"), true);
  assert.equal(fresh.actions.some(a => a.kind === "sync"), false);
  const busy = planDue([job({ id: "a", syncRunning: true })], afternoon);
  assert.equal(busy.actions[0].kind, "defer");
  const deferred = applyAttempt(job({ id: "a" }), afternoon, { type: "defer", message: "Hay una actualización en curso. Reintentamos en el próximo ciclo." });
  assert.equal(deferred.attemptCount, 0);
  assert.equal(deferred.nextAttemptAt, first.toISOString());
  assert.match(deferred.lastError || "", /en curso/);
});

test("missing credentials and a failed read stay visible and do not pretend the card arrived", () => {
  const nopass = planDue([job({ id: "a", hasPassword: false })], afternoon);
  assert.equal(nopass.actions[0].kind, "credentials");
  assert.match(nopass.actions[0].kind === "credentials" ? nopass.actions[0].reason : "", /contraseña/);
  assert.equal(nopass.actions.some(a => a.kind === "sync"), false);
  const noAccount = planDue([job({ id: "z", accountId: null, source: null, matricula: null, hasPassword: false })], afternoon);
  assert.match(noAccount.actions[0].kind === "credentials" ? noAccount.actions[0].reason : "", /cuenta vinculada/);
  const missing = applyAttempt(job({ id: "a", hasPassword: false }), afternoon, { type: "credentials", message: "Sin contraseña guardada: no podemos buscar la tarjeta." });
  assert.equal(missing.status, "needs_credentials");
  assert.match(missing.lastError || "", /contraseña/);
  assert.match(scorecardLabel(missing.status, missing.nextAttemptAt, missing.lastError, afternoon), /clave guardada/);
  const failed = applyAttempt(job({ id: "a" }), afternoon, { type: "error", message: "El club no respondió" });
  assert.equal(failed.status, "error");
  assert.equal(failed.roundId, null);
  assert.equal(failed.nextAttemptAt, nextAttempt(tee, afternoon).toISOString());
  assert.match(scorecardLabel(failed.status, failed.nextAttemptAt, failed.lastError, afternoon), /El club no respondió/);
  const waiting = applyAttempt(job({ id: "a" }), afternoon, { type: "waiting" });
  assert.equal(waiting.status, "awaiting_card");
  assert.equal(waiting.lastError, null);
});

test("one login covers every due tee, a second player waits, and the 20-hour cron is unchanged", () => {
  const jobs = [
    job({ id: "a", source: "app", matricula: "100", accountId: "a1" }),
    job({ id: "b", source: "app", matricula: "100", accountId: "a2", courseLabel: "Colorada" }),
    job({ id: "c", userId: "u2", source: "app", matricula: "200", accountId: "b1" }),
  ];
  const grouped = planDue(jobs, afternoon, 4);
  const syncs = grouped.actions.filter(a => a.kind === "sync");
  assert.equal(syncs.length, 2);
  assert.deepEqual(syncs[0].kind === "sync" ? syncs[0].jobIds : [], ["a", "b"]);
  const capped = planDue(jobs, afternoon, 1);
  assert.equal(capped.actions.filter(a => a.kind === "sync").length, 1);
  assert.deepEqual(capped.held, ["c"]);
  const cron = readFileSync(new URL("../app/api/cron/sync/route.ts", import.meta.url), "utf8");
  const runner = readFileSync(new URL("../lib/scorecard-fetch.ts", import.meta.url), "utf8");
  assert.match(cron, /interval '20 hours'/);
  assert.equal(runner.includes("interval '20 hours'"), false);
});

test("a changed or cancelled booking is rescheduled, and exactly one card closes the job", () => {
  const rounds: RoundHit[] = [
    { id: "r-azul", date: "2026-11-07", course: "Azul", clubCode: "118", accountId: "acc" },
    { id: "r-mdp", date: "2026-11-07", course: "Cancha Vieja", clubCode: "209", accountId: "other" },
  ];
  const done = reconcileJob(job({ id: "a", teeTimeId: "t1" }), null, rounds, afternoon);
  assert.equal(done.status, "complete");
  assert.equal(done.roundId, "r-azul");
  const two: RoundHit[] = [
    { id: "r1", date: "2026-11-07", course: "Azul", clubCode: "118", accountId: "acc" },
    { id: "r2", date: "2026-11-07", course: "Colorada", clubCode: "118", accountId: "acc" },
  ];
  assert.equal(reconcileJob(job({ id: "a", courseLabel: "Azul" }), null, two, afternoon).roundId, "r1");
  assert.notEqual(reconcileJob(job({ id: "a", courseLabel: null }), null, two, afternoon).status, "complete");
  const moved = reconcileJob(
    job({ id: "a", teeTimeId: "t1", lastAttemptAt: afternoon.toISOString(), attemptCount: 1, status: "awaiting_card" }),
    teeSnap({ time: "16:00" }), [], afternoon,
  );
  assert.equal(moved.time, "16:00");
  assert.equal(moved.attemptCount, 0);
  assert.equal(moved.lastAttemptAt, null);
  assert.equal(moved.nextAttemptAt, artTeeInstant("2026-11-07", "21:00").toISOString());
  const cancelled = reconcileJob(job({ id: "a", teeTimeId: "t1" }), teeSnap({ gone: true }), [], afternoon);
  assert.equal(cancelled.status, "cancelled");
  assert.equal(planDue([cancelled], afternoon).actions.length, 0);
  const back = reconcileJob(cancelled, teeSnap(), [], artTeeInstant("2026-11-07", "10:00"));
  assert.equal(back.status, "scheduled");
  assert.equal(back.nextAttemptAt, first.toISOString());
  const capped = planDue([job({ id: "a", attemptCount: 20, status: "awaiting_card" })], afternoon);
  assert.equal(capped.actions[0].kind, "stop");
});

test("the cron, the table, and the migration are present and the daily schedule stays", () => {
  const vercel = readFileSync(new URL("../vercel.json", import.meta.url), "utf8");
  assert.match(vercel, /\/api\/cron\/scorecard/);
  assert.match(vercel, /\*\/15 \* \* \* \*/);
  assert.match(vercel, /0 9 \* \* \*/);
  const schema = readFileSync(new URL("../db/schema.sql", import.meta.url), "utf8");
  const migration = readFileSync(new URL("../db/migrations/0042_scorecard_fetch.sql", import.meta.url), "utf8");
  assert.match(schema, /create table if not exists scorecard_fetch/);
  assert.match(migration, /create table if not exists scorecard_fetch/);
  assert.match(migration, /scorecard_fetch_tee/);
  assert.match(migration, /scorecard_fetch_live/);
  assert.match(migration, /needs_credentials/);
  assert.equal(migration.includes("delete from"), false);
  assert.equal(migration.includes("drop table"), false);
});
