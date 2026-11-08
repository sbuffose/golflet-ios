/** Local scratch database only. Refuses any URL that is not this machine, so production cannot be written. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { Pool, type PoolClient } from "pg";
import { HOLE_MARK_UPSERT, NOTE_UPSERT } from "../lib/quick-stats";

const TEST_DATABASE_URL = process.env.GOLFLET_TEST_DATABASE_URL || "postgres://golflet_test:golflet_test@127.0.0.1:5432/golflet_scorecard_test";
const local = /@(127\.0\.0\.1|localhost)(:|\/)/.test(TEST_DATABASE_URL);

const DDL = `
create schema if not exists quick_integrity;
create table if not exists quick_integrity.round_hole_mark (
  round_id uuid not null,
  user_id text not null,
  hole int not null check (hole between 1 and 18),
  putts int check (putts is null or (putts >= 0 and putts <= 6)),
  gir boolean,
  drive text check (drive is null or drive in ('left', 'fairway', 'right', 'other')),
  rev int not null check (rev >= 1),
  updated_at timestamptz not null default now(),
  primary key (round_id, hole)
);
create table if not exists quick_integrity.round_note (
  round_id uuid primary key,
  user_id text not null,
  putts int,
  gir int,
  fir int,
  notes text,
  updated_at timestamptz not null default now()
);`;

let pool: Pool | null = null;

async function db() {
  if (!local) throw new Error("La base de prueba no es local");
  if (!pool) {
    pool = new Pool({ connectionString: TEST_DATABASE_URL, max: 4, connectionTimeoutMillis: 2000 });
    pool.on("error", () => {});
  }
  return pool;
}

async function open(): Promise<PoolClient> {
  const client = await (await db()).connect();
  await client.query("set search_path to quick_integrity");
  return client;
}

test.after(async () => { await pool?.end(); });

test("scratch postgres keeps a clear, rejects an equal rev, and does not restore a raced note column", async (t) => {
  if (!local) return t.skip("la URL de prueba no es local");
  let setup: PoolClient | null = null;
  try {
    setup = await open();
    for (const statement of DDL.split(";").map(part => part.trim()).filter(Boolean)) {
      await setup.query(statement);
    }
  } catch (e) {
    return t.skip(`sin postgres aislado: ${e instanceof Error ? e.message : "error"}`);
  } finally {
    setup?.release();
  }

  const user = "integrity-test";
  const holeRound = randomUUID();
  const noteRound = randomUUID();
  const a = await open();
  const b = await open();
  try {
    await a.query(HOLE_MARK_UPSERT, [holeRound, user, 1, null, true, null, 5]);
    const [left, right] = await Promise.all([
      a.query(HOLE_MARK_UPSERT, [holeRound, user, 1, null, false, null, 6]),
      b.query(HOLE_MARK_UPSERT, [holeRound, user, 1, 2, true, null, 6]),
    ]);
    const winners = [left, right].filter(result => result.rows.length === 1);
    assert.equal(winners.length, 1);
    const winner = winners[0].rows[0];
    const kept = await a.query(`select putts, gir, drive, rev from round_hole_mark where round_id=$1 and hole=1`, [holeRound]);
    assert.equal(Number(kept.rows[0].rev), 6);
    assert.equal(kept.rows[0].gir, winner.gir);
    assert.equal(kept.rows[0].putts, winner.putts);
    const retry = await a.query(HOLE_MARK_UPSERT, [holeRound, user, 1, winner.putts, winner.gir, winner.drive, 6]);
    assert.equal(retry.rows.length, 1);
    assert.equal(retry.rows[0].gir, winner.gir);
    assert.equal(Number(retry.rows[0].rev), 6);

    await a.query(HOLE_MARK_UPSERT, [holeRound, user, 1, null, null, null, 7]);
    const delayed = await b.query(HOLE_MARK_UPSERT, [holeRound, user, 1, winner.putts, winner.gir, winner.drive, 6]);
    assert.equal(delayed.rows.length, 0);
    const tomb = await a.query(`select putts, gir, drive, rev from round_hole_mark where round_id=$1 and hole=1`, [holeRound]);
    assert.equal(tomb.rows.length, 1);
    assert.equal(tomb.rows[0].putts, null);
    assert.equal(tomb.rows[0].gir, null);
    assert.equal(tomb.rows[0].drive, null);
    assert.equal(Number(tomb.rows[0].rev), 7);

    for (let i = 0; i < 20; i++) {
      await a.query(`insert into round_note (round_id, user_id, putts, gir, fir, notes)
        values ($1,$2,32,10,8,'existente')
        on conflict (round_id) do update set putts=32, gir=10, fir=8, notes='existente'`, [noteRound, user]);
      await Promise.all([
        a.query(NOTE_UPSERT, [noteRound, user, null, 11, null, null, false, true, false, false]),
        b.query(NOTE_UPSERT, [noteRound, user, 33, null, null, null, true, false, false, false]),
      ]);
      const note = await a.query(`select putts, gir, fir, notes from round_note where round_id=$1`, [noteRound]);
      assert.equal(Number(note.rows[0].putts), 33);
      assert.equal(Number(note.rows[0].gir), 11);
      assert.equal(Number(note.rows[0].fir), 8);
      assert.equal(note.rows[0].notes, "existente");
    }
  } finally {
    await a.query(`delete from round_hole_mark where round_id=$1`, [holeRound]).catch(() => {});
    await a.query(`delete from round_note where round_id=$1`, [noteRound]).catch(() => {});
    a.release();
    b.release();
  }
});
