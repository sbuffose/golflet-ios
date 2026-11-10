import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Pool } from "pg";
import { createManualRound, deleteManualShot, listManualShots, saveManualShot, updateManualShot } from "../lib/reconstruct";
import { gpsPuttSql, manualPuttSql } from "../lib/gps-shot";
import { HttpError } from "../lib/http-error";

const TEST_DATABASE_URL = process.env.GOLFLET_RECON_DATABASE_URL || "postgres://golflet_test:golflet_test@127.0.0.1:5432/golflet_reconstruct_test";
const local = /@(127\.0\.0\.1|localhost)(:|\/)/.test(TEST_DATABASE_URL);
const migration = readFileSync(new URL("../db/migrations/0043_manual_shots.sql", import.meta.url), "utf8");

const STUBS = `
create table if not exists "user" (id text primary key);
create table if not exists club (id serial primary key, code text, name text);
create table if not exists club_account (id uuid primary key default gen_random_uuid(), user_id text, club_id int);
create table if not exists round (id uuid primary key default gen_random_uuid(), club_account_id uuid, date date, course text, data jsonb, holes jsonb);
create table if not exists live_round (
  id uuid primary key default gen_random_uuid(), user_id text not null, club_code text, vm_course text, club_id int,
  course text, date date not null, started_at timestamptz not null default now(), ended_at timestamptz, current_hole int,
  round_id uuid, updated_at timestamptz not null default now()
);
create table if not exists shot (
  id uuid primary key default gen_random_uuid(), live_round_id uuid not null, user_id text not null, client_id text,
  hole int not null, shot_number int not null, lat double precision not null, lng double precision not null,
  accuracy_m real, taken_at timestamptz not null default now(), club text, lie text, result text, source text not null default 'gps',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table shot add column if not exists intent text;`;

function statements(file: string): string[] {
  return file.split("\n").filter(line => !line.trim().startsWith("--")).join("\n").split(";").map(s => s.trim()).filter(Boolean);
}

let pool: Pool | null = null;
let writes: string[] = [];

async function setup() {
  if (!local) throw new Error("not local");
  if (!pool) pool = new Pool({ connectionString: TEST_DATABASE_URL, max: 2, connectionTimeoutMillis: 2000 });
  const run = (text: string, params?: unknown[]) => pool!.query(text, params).then(r => r.rows);
  await run("select 1");
  for (const statement of statements(STUBS)) await run(statement);
  for (const statement of statements(migration)) await run(statement);
  for (const statement of statements(migration)) await run(statement);
  await run(`truncate shot, live_round, round, club_account, club, "user" restart identity cascade`);
  await run(`insert into "user" (id) values ('owner'), ('other')`);
  await run(`insert into club (id, code, name) values (7, '118', 'Jockey')`);
  await run(`insert into club_account (id, user_id, club_id) values ('20000000-0000-4000-8000-0000000000a1', 'owner', 7), ('20000000-0000-4000-8000-0000000000a2', 'other', 7)`);
  await run(`insert into round (id, club_account_id, date, course, data, holes) values
    ('20000000-0000-4000-8000-0000000000d1', '20000000-0000-4000-8000-0000000000a1', '2026-11-07', 'Azul', '{}', '[]'),
    ('20000000-0000-4000-8000-0000000000d2', '20000000-0000-4000-8000-0000000000a2', '2026-11-07', 'Azul', '{}', '[]')`);
  writes = [];
  const sql = async (text: string, params: unknown[] = []) => {
    writes.push(text.replace(/\s+/g, " ").trim());
    return run(text, params);
  };
  return sql;
}

test.after(async () => { await pool?.end(); });

test("a reconstruction saves without coordinates, stays off the official card, and is not visible to another player", async (t) => {
  if (!local) return t.skip("la URL de prueba no es local");
  let sql: Awaited<ReturnType<typeof setup>>;
  try { sql = await setup(); } catch (e) { return t.skip(`sin postgres aislado: ${e instanceof Error ? e.message : "error"}`); }
  const live = await createManualRound({
    userId: "owner", date: "2026-11-07", clubCode: "118", vmCourse: "Azul", course: "Azul", clubId: 7,
    roundId: "20000000-0000-4000-8000-0000000000d1",
  }, sql);
  assert.equal(live.origin, "manual");
  assert.equal(live.round_id, "20000000-0000-4000-8000-0000000000d1");
  assert.equal(writes.some(q => /^update round\b/i.test(q)), false);
  const card = (await sql(`select data::text, holes::text from round where id='20000000-0000-4000-8000-0000000000d1'`))[0];
  assert.equal(card.data, "{}");
  assert.equal(card.holes, "[]");
  const bare = await saveManualShot("owner", live.id, { hole: 1, club: "7i", result: "rough", penalty_strokes: 0 }, sql);
  assert.equal(bare.lat, null);
  assert.equal(bare.lng, null);
  assert.equal(bare.source, "unknown");
  assert.notEqual(bare.source, "gps");
  const row = (await sql(`select lat, lng, source, accuracy_m from shot where id=$1`, [bare.id]))[0];
  assert.equal(row.lat, null);
  assert.equal(row.accuracy_m, null);
  const moved = await updateManualShot("owner", live.id, bare.id, { hole: 1, club: "7i", result: "rough", lat: -34.55, lng: -58.48, end_lat: -34.551, end_lng: -58.48 }, sql);
  assert.equal(moved.source, "manual");
  assert.equal(moved.distance_kind, "estimated");
  assert.equal(moved.position_label, "Marcado a mano");
  await assert.rejects(() => createManualRound({
    userId: "owner", date: "2026-11-07", clubCode: "118", vmCourse: "Azul", course: "Azul", clubId: 7,
    roundId: "20000000-0000-4000-8000-0000000000d2",
  }, sql), (e: unknown) => e instanceof HttpError && e.status === 404);
  await assert.rejects(() => listManualShots("other", live.id, sql), (e: unknown) => e instanceof HttpError && e.status === 404);
  await assert.rejects(() => deleteManualShot("other", live.id, bare.id, sql), (e: unknown) => e instanceof HttpError && e.status === 404);
  const still = await listManualShots("owner", live.id, sql);
  assert.equal(still.length, 1);
  assert.equal(still[0].distance_label, "Distancia estimada");
});

test("an owned shot cannot be changed through another round, and a manual putt is not a GPS putt", async (t) => {
  if (!local) return t.skip("la URL de prueba no es local");
  let sql: Awaited<ReturnType<typeof setup>>;
  try { sql = await setup(); } catch (e) { return t.skip(`sin postgres aislado: ${e instanceof Error ? e.message : "error"}`); }
  const home = await createManualRound({
    userId: "owner", date: "2026-11-07", clubCode: "118", vmCourse: "Azul", course: "Azul", clubId: 7, roundId: null,
  }, sql);
  const elsewhere = await createManualRound({
    userId: "owner", date: "2026-11-06", clubCode: "118", vmCourse: "Colorada", course: "Colorada", clubId: 7, roundId: null,
  }, sql);
  const shot = await saveManualShot("owner", home.id, { hole: 1, club: "Pt", lie: "green", result: "holed", penalty_strokes: 0 }, sql);
  await assert.rejects(() => updateManualShot("owner", elsewhere.id, shot.id, { hole: 1, club: "Dr", result: "fairway" }, sql), (e: unknown) => e instanceof HttpError && e.status === 404);
  await assert.rejects(() => deleteManualShot("owner", elsewhere.id, shot.id, sql), (e: unknown) => e instanceof HttpError && e.status === 404);
  await assert.rejects(() => saveManualShot("other", home.id, { hole: 2, club: "7i" }, sql), (e: unknown) => e instanceof HttpError && e.status === 404);
  await assert.rejects(() => listManualShots("owner", "20000000-0000-4000-8000-0000000000e9", sql), (e: unknown) => e instanceof HttpError && e.status === 404);
  const kept = (await sql(`select club, live_round_id::text from shot where id=$1`, [shot.id]))[0];
  assert.equal(kept.club, "Pt");
  assert.equal(kept.live_round_id, home.id);
  await sql(`insert into shot (live_round_id, user_id, hole, shot_number, lat, lng, club, lie, result, source)
    values ($1, 'owner', 1, 8, -34.55, -58.48, 'Pt', 'green', 'holed', 'gps')`, [home.id]);
  await sql(`insert into shot (live_round_id, user_id, hole, shot_number, lat, lng, club, lie, result, source)
    values ($1, 'owner', 1, 9, null, null, 'Pt', 'green', 'holed', 'gps')`, [home.id]);
  const gps = (await sql(`select count(*)::int n from shot s where s.live_round_id=$1 and ${gpsPuttSql("s")}`, [home.id]))[0];
  const manual = (await sql(`select count(*)::int n from shot s where s.live_round_id=$1 and ${manualPuttSql("s")}`, [home.id]))[0];
  assert.equal(Number(gps.n), 1);
  assert.equal(Number(manual.n), 1);
  const corrected = await updateManualShot("owner", home.id, shot.id, { hole: 1, club: "Pt", lie: "green", result: "holed" }, sql);
  assert.equal(corrected.club, "Pt");
  assert.deepEqual(await deleteManualShot("owner", home.id, shot.id, sql), { ok: true });
  assert.equal((await sql(`select id from shot where id=$1`, [shot.id])).length, 0);
});
