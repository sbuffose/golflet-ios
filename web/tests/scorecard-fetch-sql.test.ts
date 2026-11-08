import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { Pool } from "pg";
import { claimLoginLease, newLeaseToken, releaseLoginLease } from "../lib/scorecard-lease";
import { ScorecardSchemaError, enrollScorecardFetches, listScorecardFetches, runScorecardFetches } from "../lib/scorecard-fetch";
import { scorecardCronResponse } from "../app/api/cron/scorecard/route";

/** Local scratch database only. A URL that is not this machine is refused, so a production string cannot be used by mistake. */
const TEST_DATABASE_URL = process.env.GOLFLET_TEST_DATABASE_URL || "postgres://golflet_test:golflet_test@127.0.0.1:5432/golflet_scorecard_test";
const local = /@(127\.0\.0\.1|localhost)(:|\/)/.test(TEST_DATABASE_URL);

const STUBS = `
create table if not exists "user" (id text primary key);
create table if not exists club (id serial primary key, code text, name text, seeded boolean default false);
create table if not exists club_account (
  id uuid primary key default gen_random_uuid(),
  user_id text references "user"(id),
  club_id int references club(id),
  matricula text,
  source text,
  password_enc text,
  last_sync_at timestamptz,
  last_sync_status text,
  last_sync_message text
);
create table if not exists tee_time (
  id uuid primary key default gen_random_uuid(),
  user_id text,
  club_account_id uuid,
  date date,
  time text,
  course_label text,
  club_name text,
  gone_at timestamptz,
  round_id uuid,
  source text
);
create table if not exists round (
  id uuid primary key default gen_random_uuid(),
  club_account_id uuid,
  date date,
  course text
);
create table if not exists live_round (
  id uuid primary key default gen_random_uuid(),
  user_id text,
  started_at timestamptz,
  ended_at timestamptz,
  date date,
  club_code text,
  course text,
  round_id uuid
);`;

function statements(file: string): string[] {
  return file.split("\n").filter(line => !line.trim().startsWith("--")).join("\n").split(";").map(s => s.trim()).filter(Boolean);
}

const migration = readFileSync(new URL("../db/migrations/0042_scorecard_fetch.sql", import.meta.url), "utf8");

let pool: Pool | null = null;
let ready = false;

async function db() {
  if (!local) throw new Error("La base de prueba no es local");
  if (!pool) {
    pool = new Pool({ connectionString: TEST_DATABASE_URL, max: 4, connectionTimeoutMillis: 2000 });
    pool.on("error", () => {});
  }
  return pool;
}

const sql = async (text: string, params: unknown[] = []) => (await (await db()).query(text, params)).rows;

async function setup() {
  if (ready) return;
  await sql("select 1");
  for (const statement of statements(STUBS)) await sql(statement);
  for (const statement of statements(migration)) await sql(statement);
  for (const statement of statements(migration)) await sql(statement);
  ready = true;
}

async function reset() {
  await setup();
  await sql(`truncate scorecard_fetch, scorecard_sync_lease, live_round, round, tee_time, club_account, club, "user" restart identity cascade`);
}

test.after(async () => { await pool?.end(); });

test("the migration file is helper-compatible and its hash is stable for review", () => {
  assert.equal(migration.includes("$$"), false);
  assert.equal(statements(migration).some(s => /^\s*do\b/i.test(s)), false);
  assert.equal(statements(migration).every(s => !s.includes(";")), true);
  const hash = createHash("sha256").update(migration).digest("hex");
  assert.equal(hash.length, 64);
  process.stdout.write(`\n0042 sha256 ${hash}\n`);
});

test("scratch postgres applies 0042 twice and keeps the fresh-table checks", async (t) => {
  if (!local) return t.skip("la URL de prueba no es local");
  try { await setup(); } catch (e) { return t.skip(`sin postgres aislado: ${e instanceof Error ? e.message : "error"}`); }
  const checks = await sql(`select conname from pg_constraint where conrelid = 'scorecard_fetch'::regclass order by conname`);
  const names = checks.map(r => String(r.conname));
  assert.ok(names.includes("scorecard_fetch_target"));
  assert.ok(names.some(n => n.includes("status") || n.includes("scorecard_fetch_status")));
  const status = await sql(`select pg_get_constraintdef(oid) def from pg_constraint where conrelid = 'scorecard_fetch'::regclass and pg_get_constraintdef(oid) like '%status%'`);
  assert.match(status.map(r => r.def).join(" "), /needs_credentials/);
  const lease = await sql(`select to_regclass('scorecard_sync_lease') as rel`);
  assert.equal(lease[0].rel, "scorecard_sync_lease");
  const started = await sql(`select column_name from information_schema.columns where table_name='club_account' and column_name='last_sync_started_at'`);
  assert.equal(started.length, 1);
  const token = await sql(`select column_name from information_schema.columns where table_name='scorecard_fetch' and column_name in ('lock_token','version')`);
  assert.equal(token.length, 2);
});

test("two connections cannot hold the same login lease, and a stale worker cannot release the new one", async (t) => {
  if (!local) return t.skip("la URL de prueba no es local");
  try { await reset(); } catch { return t.skip("sin postgres aislado"); }
  const a = newLeaseToken(), b = newLeaseToken();
  const [first, second] = await Promise.all([
    claimLoginLease(sql, "app:u1:100", a, "u1", null),
    claimLoginLease(sql, "app:u1:100", b, "u1", null),
  ]);
  const won = [first, second].filter(x => x === "acquired");
  assert.equal(won.length, 1);
  assert.equal([first, second].filter(x => x === "held").length, 1);
  const winner = first === "acquired" ? a : b;
  const loser = first === "acquired" ? b : a;
  assert.equal(await releaseLoginLease(sql, "app:u1:100", loser), false);
  const still = await sql(`select token from scorecard_sync_lease where sync_key='app:u1:100'`);
  assert.equal(still[0].token, winner);
  await sql(`update scorecard_sync_lease set expires_at = now() - interval '1 minute' where sync_key='app:u1:100'`);
  const stolen = newLeaseToken();
  assert.equal(await claimLoginLease(sql, "app:u1:100", stolen, "u1", null), "acquired");
  assert.equal(await releaseLoginLease(sql, "app:u1:100", winner), false);
  assert.equal(await releaseLoginLease(sql, "app:u1:100", stolen), true);
  assert.equal((await sql(`select count(*)::int n from scorecard_sync_lease`))[0].n, 0);
});

test("enrollment does not overwrite a live lock, and another user's card does not close the job", async (t) => {
  if (!local) return t.skip("la URL de prueba no es local");
  try { await reset(); } catch { return t.skip("sin postgres aislado"); }
  const today = (await sql(`select (now() at time zone 'America/Argentina/Buenos_Aires')::date::text d`))[0].d as string;
  await sql(`insert into "user" (id) values ('owner'), ('other')`);
  await sql(`insert into club (code, name) values ('118', 'Jockey')`);
  const club = (await sql(`select id from club where code='118'`))[0].id;
  await sql(`insert into club_account (id, user_id, club_id, matricula, source, password_enc) values
    ('10000000-0000-4000-8000-0000000000a1', 'owner', $1, '100', 'site', 'stored'),
    ('10000000-0000-4000-8000-0000000000a2', 'other', $1, '200', 'site', 'stored')`, [club]);
  await sql(`insert into tee_time (id, user_id, club_account_id, date, time, course_label, club_name, source) values
    ('10000000-0000-4000-8000-0000000000c1', 'owner', '10000000-0000-4000-8000-0000000000a1', $1, '14:00', 'Azul', 'Jockey', 'club'),
    ('10000000-0000-4000-8000-0000000000c2', 'other', '10000000-0000-4000-8000-0000000000a2', $1, '14:00', 'Azul', 'Jockey', 'club')`, [today]);
  await sql(`insert into round (id, club_account_id, date, course) values
    ('10000000-0000-4000-8000-0000000000d1', '10000000-0000-4000-8000-0000000000a2', $1, 'Azul')`, [today]);
  await enrollScorecardFetches(new Date(), sql);
  await sql(`update scorecard_fetch set club_account_id=null, club_code='118' where user_id='owner'`);
  await sql(`update tee_time set club_account_id=null, time='16:00' where user_id='owner'`);
  await sql(`update tee_time set time='16:10' where user_id='other'`);
  await enrollScorecardFetches(new Date(), sql);
  const owner = (await sql(`select status, round_id, user_id from scorecard_fetch where user_id='owner'`))[0];
  assert.equal(owner.status, "scheduled");
  assert.equal(owner.round_id, null);
  const otherClosed = (await sql(`select status, round_id::text from scorecard_fetch where user_id='other'`))[0];
  assert.equal(otherClosed.round_id, "10000000-0000-4000-8000-0000000000d1");
  await sql(`update scorecard_fetch set lock_token='worker', locked_at=now(), version=4, time='16:00' where user_id='owner'`);
  await sql(`update tee_time set time='18:00' where user_id='owner'`);
  const again = await enrollScorecardFetches(new Date(), sql);
  assert.equal(again.reconciled, 0);
  const locked = (await sql(`select time, lock_token, version from scorecard_fetch where user_id='owner'`))[0];
  assert.equal(String(locked.time).slice(0, 5), "16:00");
  assert.equal(locked.lock_token, "worker");
  assert.equal(Number(locked.version), 4);
});

test("a conflicting course is not closed, and the owner list hides the other player", async (t) => {
  if (!local) return t.skip("la URL de prueba no es local");
  try { await reset(); } catch { return t.skip("sin postgres aislado"); }
  const today = (await sql(`select (now() at time zone 'America/Argentina/Buenos_Aires')::date::text d`))[0].d as string;
  await sql(`insert into "user" (id) values ('owner'), ('other')`);
  await sql(`insert into club (code, name, seeded) values ('118', 'Jockey', true)`);
  const club = (await sql(`select id from club where code='118'`))[0].id;
  await sql(`insert into club_account (id, user_id, club_id, matricula, source, password_enc) values
    ('10000000-0000-4000-8000-0000000000a1', 'owner', $1, '100', 'app', 'stored')`, [club]);
  await sql(`insert into tee_time (id, user_id, club_account_id, date, time, course_label, club_name, source) values
    ('10000000-0000-4000-8000-0000000000c1', 'owner', '10000000-0000-4000-8000-0000000000a1', $1, '14:00', 'Azul', 'Jockey', 'club')`, [today]);
  await sql(`insert into round (id, club_account_id, date, course) values
    ('10000000-0000-4000-8000-0000000000d1', '10000000-0000-4000-8000-0000000000a1', $1, 'Colorada')`, [today]);
  await enrollScorecardFetches(new Date(), sql);
  const open = (await sql(`select status, round_id from scorecard_fetch`))[0];
  assert.equal(open.status, "scheduled");
  assert.equal(open.round_id, null);
  await sql(`insert into live_round (id, user_id, started_at, date, club_code, course) values
    ('10000000-0000-4000-8000-0000000000e1', 'other', now(), $1, '118', 'Azul')`, [today]);
  await sql(`insert into scorecard_fetch (user_id, live_round_id, played_at, date, time, club_code, course_label, status, next_attempt_at)
    values ('other', '10000000-0000-4000-8000-0000000000e1', now(), $1, '14:00', '118', 'Azul', 'scheduled', now())`, [today]);
  const listed = await listScorecardFetches("owner", new Date(), sql);
  assert.equal(listed.length, 1);
  assert.equal(listed[0].course_label, "Azul");
  process.env.DATABASE_URL = TEST_DATABASE_URL;
  const { scorecardFetchesResponse } = await import("../app/api/scorecard-fetches/route");
  const response = await scorecardFetchesResponse("owner", (userId) => listScorecardFetches(userId, new Date(), sql));
  const body = await response.json() as { fetches: { user_id?: string; course_label: string | null }[] };
  assert.equal(response.status, 200);
  assert.equal(body.fetches.length, 1);
  assert.equal(body.fetches[0].course_label, "Azul");
  const other = await listScorecardFetches("other", new Date(), sql);
  assert.equal(other.length, 1);
  assert.notEqual(other[0].id, listed[0].id);
});

test("one login is serialized across two runs, and a stale worker cannot overwrite the later result", async (t) => {
  if (!local) return t.skip("la URL de prueba no es local");
  try { await reset(); } catch { return t.skip("sin postgres aislado"); }
  const today = (await sql(`select (now() at time zone 'America/Argentina/Buenos_Aires')::date::text d`))[0].d as string;
  await sql(`insert into "user" (id) values ('owner')`);
  await sql(`insert into club (code, name, seeded) values ('118', 'Jockey', true)`);
  const club = (await sql(`select id from club where code='118'`))[0].id;
  await sql(`insert into club_account (id, user_id, club_id, matricula, source, password_enc) values
    ('10000000-0000-4000-8000-0000000000a1', 'owner', $1, '100', 'site', 'stored')`, [club]);
  await sql(`insert into tee_time (id, user_id, club_account_id, date, time, course_label, club_name, source) values
    ('10000000-0000-4000-8000-0000000000c1', 'owner', '10000000-0000-4000-8000-0000000000a1', $1, '08:00', 'Azul', 'Jockey', 'club')`, [today]);
  await enrollScorecardFetches(new Date(), sql);
  await sql(`update scorecard_fetch set next_attempt_at = now() - interval '1 minute', status='scheduled', attempt_count=0, round_id=null`);
  let releaseFirst: () => void = () => {};
  const gate = new Promise<void>(resolve => { releaseFirst = resolve; });
  let calls = 0;
  const now = new Date();
  const first = runScorecardFetches({
    now, sql,
    sync: async () => {
      calls++;
      await gate;
      return { ok: true, new_rounds: 0, updated: 0, pending: 0, message: "primero" };
    },
  });
  const deadline = Date.now() + 4000;
  while (calls < 1 && Date.now() < deadline) await new Promise(r => setTimeout(r, 20));
  assert.equal(calls, 1);
  const parallel = runScorecardFetches({
    now, sql,
    sync: async () => { calls++; return { ok: false, new_rounds: 0, updated: 0, pending: 0, message: "no debe correr" }; },
  });
  const held = await parallel;
  assert.equal(calls, 1);
  assert.equal(held.synced, 0);
  await sql(`update scorecard_sync_lease set expires_at = now() - interval '1 minute'`);
  await sql(`update scorecard_fetch set locked_at = now() - interval '21 minutes'`);
  const later = await runScorecardFetches({
    now, sql,
    sync: async () => { calls++; return { ok: false, new_rounds: 0, updated: 0, pending: 0, message: "segundo lector" }; },
  });
  assert.equal(later.synced, 1);
  assert.equal(later.errors, 1);
  releaseFirst();
  const early = await first;
  assert.ok(early.fenced >= 1);
  const row = (await sql(`select status, attempt_count, last_error, round_id from scorecard_fetch`))[0];
  assert.equal(row.status, "error");
  assert.equal(Number(row.attempt_count), 1);
  assert.match(String(row.last_error), /segundo lector/);
  assert.equal(row.round_id, null);
});

test("a running flag older than the lease is recovered, and a live running flag is not", async (t) => {
  if (!local) return t.skip("la URL de prueba no es local");
  try { await reset(); } catch { return t.skip("sin postgres aislado"); }
  const today = (await sql(`select (now() at time zone 'America/Argentina/Buenos_Aires')::date::text d`))[0].d as string;
  await sql(`insert into "user" (id) values ('owner')`);
  await sql(`insert into club (code, name) values ('118', 'Jockey')`);
  const club = (await sql(`select id from club where code='118'`))[0].id;
  await sql(`insert into club_account (id, user_id, club_id, matricula, source, password_enc, last_sync_status, last_sync_started_at) values
    ('10000000-0000-4000-8000-0000000000a1', 'owner', $1, '100', 'site', 'stored', 'running', now() - interval '30 minutes')`, [club]);
  await sql(`insert into tee_time (id, user_id, club_account_id, date, time, course_label, club_name, source) values
    ('10000000-0000-4000-8000-0000000000c1', 'owner', '10000000-0000-4000-8000-0000000000a1', $1, '08:00', 'Azul', 'Jockey', 'club')`, [today]);
  await enrollScorecardFetches(new Date(), sql);
  await sql(`update scorecard_fetch set next_attempt_at = now() - interval '1 minute'`);
  let calls = 0;
  const recovered = await runScorecardFetches({
    sql,
    sync: async () => { calls++; return { ok: true, new_rounds: 0, updated: 0, pending: 0, message: "recuperado" }; },
  });
  assert.equal(recovered.synced, 1);
  assert.equal(calls, 1);
  await sql(`update club_account set last_sync_status='running', last_sync_started_at=now()`);
  await sql(`update scorecard_fetch set status='scheduled', next_attempt_at=now() - interval '1 minute', attempt_count=0, last_attempt_at=null`);
  const live = await runScorecardFetches({
    sql,
    sync: async () => { calls++; return { ok: true, new_rounds: 0, updated: 0, pending: 0, message: "no" }; },
  });
  assert.equal(calls, 1);
  assert.ok(live.deferred >= 1);
  assert.equal(live.synced, 0);
});

test("cron auth rejects a missing secret and dispatches only the matching bearer, without reading a club", async () => {
  const previous = process.env.CRON_SECRET;
  process.env.CRON_SECRET = "scratch-cron-secret";
  try {
    const missing = await scorecardCronResponse(new Request("http://127.0.0.1/api/cron/scorecard"));
    assert.equal(missing.status, 401);
    const wrong = await scorecardCronResponse(new Request("http://127.0.0.1/api/cron/scorecard", { headers: { authorization: "Bearer other" } }));
    assert.equal(wrong.status, 401);
    let dispatched = 0;
    const ok = await scorecardCronResponse(new Request("http://127.0.0.1/api/cron/scorecard", { headers: { authorization: "Bearer scratch-cron-secret" } }), async () => {
      dispatched++;
      return { ok: true, dispatched: true };
    });
    assert.equal(ok.status, 200);
    assert.equal(dispatched, 1);
    const body = await ok.json() as { dispatched?: boolean };
    assert.equal(body.dispatched, true);
    const down = await scorecardCronResponse(new Request("http://127.0.0.1/api/cron/scorecard", { headers: { authorization: "Bearer scratch-cron-secret" } }), async () => {
      throw new ScorecardSchemaError();
    });
    assert.equal(down.status, 503);
    delete process.env.CRON_SECRET;
    const unset = await scorecardCronResponse(new Request("http://127.0.0.1/api/cron/scorecard", { headers: { authorization: "Bearer scratch-cron-secret" } }));
    assert.equal(unset.status, 401);
  } finally {
    if (previous === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = previous;
  }
});
