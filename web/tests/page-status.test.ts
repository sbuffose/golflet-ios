import assert from "node:assert/strict";
import test from "node:test";
import { Pool } from "pg";
import { playersForLine, recordPageStatus, writeBookingLine } from "../lib/club-extras";

const TEST_DATABASE_URL = process.env.GOLFLET_TEST_DATABASE_URL || "postgres://golflet_test:golflet_test@127.0.0.1:5432/golflet_scorecard_test";
const local = /@(127\.0\.0\.1|localhost)(:|\/)/.test(TEST_DATABASE_URL);

test("a failed or unrecognized line keeps players, and a recognized empty line can clear them", () => {
  const stored = [{ name: "Gomez Ana", hcp: 8.9 }];
  assert.equal(playersForLine(false, stored, null).keepPlayers, true);
  assert.deepEqual(playersForLine(false, stored, { recognized: false, players: [] }).companions, stored);
  assert.equal(playersForLine(false, stored, { recognized: false, players: [] }).read, false);
  const empty = playersForLine(false, stored, { recognized: true, players: [] });
  assert.equal(empty.keepPlayers, false);
  assert.deepEqual(empty.companions, []);
  assert.equal(empty.read, true);
  const ok = playersForLine(false, stored, { recognized: true, players: [{ name: "Lopez", hcp: 4 }] });
  assert.deepEqual(ok.companions, [{ name: "Lopez", hcp: 4 }]);
  assert.equal(playersForLine(true, stored, null).read, false);
});

test("checked_at stays NOT NULL and a failure does not invent a successful stamp", async (t) => {
  if (!local) return t.skip("la URL de prueba no es local");
  const pool = new Pool({ connectionString: TEST_DATABASE_URL, max: 1, connectionTimeoutMillis: 2000 });
  const client = await pool.connect().catch(e => { t.skip(`sin postgres aislado: ${e instanceof Error ? e.message : "error"}`); return null; });
  if (!client) { await pool.end(); return; }
  const run = async (text: string, params?: unknown[]) => (await client.query(text, params)).rows;
  try {
    await client.query("begin");
    await client.query(`create temp table club_page_status (
      club_account_id uuid not null, page text not null, status text not null, message text, items int,
      checked_at timestamptz not null default now(), primary key (club_account_id, page))`);
    const id = "11111111-1111-4111-8111-111111111111";
    await client.query("savepoint null_stamp");
    await assert.rejects(
      client.query(`insert into club_page_status (club_account_id, page, status, message, items, checked_at) values ($1,'bookings','error','x',null,null)
                    on conflict (club_account_id, page) do update set status=excluded.status`, [id]),
      (e: { code?: string }) => e.code === "23502");
    await client.query("rollback to savepoint null_stamp");
    await recordPageStatus(run, id, "bookings", "error", "sin lectura", null);
    assert.equal((await run(`select count(*)::int n from club_page_status`))[0].n, 0);
    await recordPageStatus(run, id, "bookings", "ok", null, 1);
    const first = (await run(`select status, checked_at from club_page_status`))[0];
    assert.equal(first.status, "ok");
    await new Promise(r => setTimeout(r, 20));
    await recordPageStatus(run, id, "bookings", "error", "la página falló", null);
    const kept = (await run(`select status, message, checked_at from club_page_status`))[0];
    assert.equal(kept.status, "error");
    assert.equal(kept.message, "la página falló");
    assert.equal(new Date(kept.checked_at).toISOString(), new Date(first.checked_at).toISOString());
  } finally {
    await client.query("rollback").catch(() => {});
    client.release();
    await pool.end();
  }
});

test("a failed player refresh does not replace the stored companions", async (t) => {
  if (!local) return t.skip("la URL de prueba no es local");
  const pool = new Pool({ connectionString: TEST_DATABASE_URL, max: 1, connectionTimeoutMillis: 2000 });
  const client = await pool.connect().catch(e => { t.skip(`sin postgres aislado: ${e instanceof Error ? e.message : "error"}`); return null; });
  if (!client) { await pool.end(); return; }
  const run = async (text: string, params?: unknown[]) => (await client.query(text, params)).rows;
  const acc = "22222222-2222-4222-8222-222222222222";
  const line = (companions: unknown, course: string | null, keepPlayers: boolean, keepCourse: boolean) => ["user-probe", "2026-11-09", "09:00", null, null, "Club Fixture", course, JSON.stringify(companions), acc, "15379@09:00", 1, null, "Copa", course ? "fuente" : null, [], keepPlayers, keepCourse];
  try {
    await client.query("begin");
    await client.query(`create temp table tee_time (
      id uuid primary key default gen_random_uuid(), user_id text not null, date date not null, time text not null,
      club_key text, course_id int, club_name text not null, course_label text, companions jsonb not null default '[]',
      source text not null default 'club', club_account_id uuid, external_id text, start_hole int, modality text, event_name text,
      course_how text, partner_keys text[] not null default '{}', seen_at timestamptz, updated_at timestamptz, gone_at timestamptz,
      unique (user_id, club_account_id, external_id))`);
    await writeBookingLine(run, line([{ name: "Gomez Ana", hcp: 8.9 }], "Colorada", false, false));
    const seen = (await run(`select seen_at from tee_time`))[0].seen_at;
    await writeBookingLine(run, line([], null, true, true));
    const kept = (await run(`select companions, course_label, seen_at from tee_time`))[0];
    assert.equal(kept.companions[0].name, "Gomez Ana");
    assert.equal(kept.course_label, "Colorada");
    assert.equal(new Date(kept.seen_at).toISOString(), new Date(seen).toISOString());
    await writeBookingLine(run, line([], null, false, false));
    const cleared = (await run(`select companions, course_label from tee_time`))[0];
    assert.equal(cleared.companions.length, 0);
    assert.equal(cleared.course_label, null);
  } finally {
    await client.query("rollback").catch(() => {});
    client.release();
    await pool.end();
  }
});
