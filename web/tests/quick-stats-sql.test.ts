/** Local scratch database only. Refuses any URL that is not this machine, so production cannot be written. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { Pool, type PoolClient } from "pg";
import { withTransaction } from "../lib/db";
import { HOLE_MARK_UPSERT, NOTE_UPSERT, notePatch, writeAuthoritativeNote, writeHoleMark, type HoleRef } from "../lib/quick-stats";

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
    pool = new Pool({ connectionString: TEST_DATABASE_URL, max: 8, connectionTimeoutMillis: 2000 });
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

const card2: HoleRef[] = [{ hole: 1, par: 4 }, { hole: 2, par: 4 }];

async function run(client: PoolClient, text: string, params?: unknown[]) {
  const result = await client.query(text, params);
  return result.rows;
}

async function seedPair(client: PoolClient, round: string, user: string) {
  await client.query(`insert into round_note (round_id, user_id, putts, gir, fir, notes) values ($1,$2,32,10,8,'existente')`, [round, user]);
  await client.query(HOLE_MARK_UPSERT, [round, user, 1, 2, true, "fairway", 5]);
  await client.query(HOLE_MARK_UPSERT, [round, user, 2, 1, false, "left", 4]);
}

test("two devices writing different holes leave the server total, not either snapshot", async (t) => {
  if (!local) return t.skip("la URL de prueba no es local");
  let setup: PoolClient | null = null;
  try {
    setup = await open();
    for (const statement of DDL.split(";").map(part => part.trim()).filter(Boolean)) await setup.query(statement);
  } catch (e) {
    return t.skip(`sin postgres aislado: ${e instanceof Error ? e.message : "error"}`);
  } finally {
    setup?.release();
  }

  const user = "two-devices";
  const round = randomUUID();
  const seed = await open();
  await seedPair(seed, round, user);
  seed.release();

  const a = await open();
  const b = await open();
  let c: PoolClient | null = null;
  try {
    await a.query("BEGIN");
    await run(a, `select pg_advisory_xact_lock(hashtext('golflet-hole'), hashtext($1::text))`, [round]);
    let bLanded = false;
    const other = (async () => {
      await b.query("BEGIN");
      const saved = await writeHoleMark((sql, params) => run(b, sql, params), {
        roundId: round, userId: user, card: card2,
        incoming: { hole: 2, putts: 4, gir: true, drive: "left", rev: 5 },
      });
      await b.query("COMMIT");
      bLanded = true;
      return saved;
    })();
    const look = await open();
    let waiting = false;
    for (let i = 0; i < 40 && !waiting; i++) {
      const locks = await look.query(`select count(*)::int as n from pg_locks where not granted and locktype='advisory'`);
      waiting = Number(locks.rows[0].n) > 0;
      if (!waiting) await new Promise(resolve => setTimeout(resolve, 25));
    }
    look.release();
    assert.equal(waiting, true);
    assert.equal(bLanded, false);
    const first = await writeHoleMark((sql, params) => run(a, sql, params), {
      roundId: round, userId: user, card: card2,
      incoming: { hole: 1, putts: 3, gir: true, drive: "fairway", rev: 6 },
    });
    assert.equal(first.note?.putts, 4);
    await a.query("COMMIT");
    const second = await other;
    assert.equal(second.note?.putts, 7);
    assert.equal(second.note?.gir, 2);
    assert.equal(second.note?.fir, 1);
    assert.equal(second.note?.notes, "existente");

    const late = await open();
    await late.query("BEGIN");
    const ignored = await writeAuthoritativeNote((sql, params) => run(late, sql, params), {
      roundId: round, userId: user, card: card2, client: notePatch({ putts: "6", gir: "1", fir: "1" }),
    });
    await late.query("COMMIT");
    assert.equal(ignored?.putts, 7);
    late.release();

    const kept = await a.query(`select putts, gir, fir, notes from round_note where round_id=$1`, [round]);
    assert.equal(Number(kept.rows[0].putts), 7);
    assert.equal(Number(kept.rows[0].gir), 2);
    assert.equal(Number(kept.rows[0].fir), 1);
    assert.equal(kept.rows[0].notes, "existente");

    const same = randomUUID();
    await a.query(`insert into round_note (round_id, user_id, putts, gir, fir) values ($1,$2,32,10,8)`, [same, user]);
    await a.query(HOLE_MARK_UPSERT, [same, user, 1, 2, true, "fairway", 5]);
    c = await open();
    const peer = c;
    const [one, two] = await Promise.all([
      (async () => {
        await a.query("BEGIN");
        const saved = await writeHoleMark((sql, params) => run(a, sql, params), {
          roundId: same, userId: user, card: [{ hole: 1, par: 4 }],
          incoming: { hole: 1, putts: 2, gir: false, drive: "fairway", rev: 6 },
        });
        await a.query("COMMIT");
        return saved;
      })(),
      (async () => {
        await peer.query("BEGIN");
        const saved = await writeHoleMark((sql, params) => run(peer, sql, params), {
          roundId: same, userId: user, card: [{ hole: 1, par: 4 }],
          incoming: { hole: 1, putts: 2, gir: true, drive: "left", rev: 6 },
        });
        await peer.query("COMMIT");
        return saved;
      })(),
    ]);
    const winners = [one, two].filter(item => item.applied && !item.conflict);
    assert.equal(winners.length, 1);
    const hole = await a.query(`select putts, gir, drive, rev from round_hole_mark where round_id=$1`, [same]);
    assert.equal(Number(hole.rows[0].rev), 6);
    assert.equal(hole.rows[0].gir, winners[0].mark.gir);
    const note = await a.query(`select putts, gir, fir from round_note where round_id=$1`, [same]);
    assert.equal(Number(note.rows[0].putts), 2);
    assert.equal(Number(note.rows[0].gir), winners[0].mark.gir ? 1 : 0);

    const partial = randomUUID();
    await a.query(`insert into round_note (round_id, user_id, putts, gir, fir) values ($1,$2,32,10,8)`, [partial, user]);
    await a.query("BEGIN");
    const unfinished = await writeHoleMark((sql, params) => run(a, sql, params), {
      roundId: partial, userId: user, card: card2,
      incoming: { hole: 1, putts: 3, gir: true, drive: "fairway", rev: 1 },
    });
    await a.query("COMMIT");
    assert.equal(unfinished.note, null);
    const still = await a.query(`select putts, gir, fir from round_note where round_id=$1`, [partial]);
    assert.equal(Number(still.rows[0].putts), 32);
    assert.equal(Number(still.rows[0].gir), 10);
    assert.equal(Number(still.rows[0].fir), 8);
    await a.query("BEGIN");
    const refused = await writeAuthoritativeNote((sql, params) => run(a, sql, params), {
      roundId: partial, userId: user, card: card2, client: notePatch({ putts: "6" }),
    });
    await a.query("COMMIT");
    assert.equal(refused?.putts, 32);

    const zeros = randomUUID();
    await a.query(`insert into round_note (round_id, user_id, putts, gir, fir) values ($1,$2,32,10,8)`, [zeros, user]);
    await a.query("BEGIN");
    await writeHoleMark((sql, params) => run(a, sql, params), {
      roundId: zeros, userId: user, card: card2,
      incoming: { hole: 1, putts: 0, gir: false, drive: "left", rev: 1 },
    });
    const zeroNote = await writeHoleMark((sql, params) => run(a, sql, params), {
      roundId: zeros, userId: user, card: card2,
      incoming: { hole: 2, putts: 0, gir: false, drive: "right", rev: 1 },
    });
    await a.query("COMMIT");
    assert.equal(zeroNote.note?.putts, 0);
    assert.equal(zeroNote.note?.gir, 0);
    assert.equal(zeroNote.note?.fir, 0);

    const clear = randomUUID();
    await a.query(`insert into round_note (round_id, user_id, putts, gir, fir) values ($1,$2,32,10,8)`, [clear, user]);
    await a.query("BEGIN");
    const cleared = await writeAuthoritativeNote((sql, params) => run(a, sql, params), {
      roundId: clear, userId: user, card: card2, client: notePatch({ gir: "" }),
    });
    await a.query("COMMIT");
    assert.equal(cleared?.gir, null);
    assert.equal(Number(cleared?.putts), 32);
    assert.equal(Number(cleared?.fir), 8);

    await a.query(`delete from round_hole_mark where user_id=$1`, [user]);
    await a.query(`delete from round_note where user_id=$1`, [user]);

    const wrapped = randomUUID();
    const wrapUser = "handler-tx";
    await a.query(`insert into round_note (round_id, user_id, putts, gir, fir, notes) values ($1,$2,32,10,8,'existente')`, [wrapped, wrapUser]);
    await a.query(HOLE_MARK_UPSERT, [wrapped, wrapUser, 1, 2, true, "fairway", 5]);
    await a.query(HOLE_MARK_UPSERT, [wrapped, wrapUser, 2, 1, false, "left", 4]);
    const connect = () => open();
    const [left, right] = await Promise.all([
      withTransaction(run => writeHoleMark(run, {
        roundId: wrapped, userId: wrapUser, card: card2,
        incoming: { hole: 1, putts: 3, gir: true, drive: "fairway", rev: 6 },
      }), connect),
      withTransaction(run => writeHoleMark(run, {
        roundId: wrapped, userId: wrapUser, card: card2,
        incoming: { hole: 2, putts: 4, gir: true, drive: "left", rev: 5 },
      }), connect),
    ]);
    const storedWrap = await a.query(`select putts, gir, fir, notes from round_note where round_id=$1`, [wrapped]);
    assert.equal(Number(storedWrap.rows[0].putts), 7);
    assert.equal(Number(storedWrap.rows[0].gir), 2);
    assert.equal(Number(storedWrap.rows[0].fir), 1);
    assert.equal(storedWrap.rows[0].notes, "existente");
    assert.equal([left, right].some(item => item.note?.putts === 7), true);
    const ignoredWrap = await withTransaction(run => writeAuthoritativeNote(run, {
      roundId: wrapped, userId: wrapUser, card: card2, client: notePatch({ putts: "6", gir: "1", fir: "1" }),
    }), connect);
    assert.equal(ignoredWrap?.putts, 7);
    await a.query(`delete from round_hole_mark where round_id=$1`, [wrapped]);
    await a.query(`delete from round_note where round_id=$1`, [wrapped]);
  } finally {
    c?.release();
    a.release();
    b.release();
  }
});
