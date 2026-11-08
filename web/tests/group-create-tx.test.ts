import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createGroupAtomic } from "../lib/group-create-tx";
import { HttpError } from "../lib/http-error";

/** In-process client with the same transaction, lock and conflict behavior the SQL relies on. */
class Mem {
  groups: any[] = [];
  keys: any[] = [];
  members: any[] = [];
  events: any[] = [];
  held = new Map<string, number>();
  waiters: (() => void)[] = [];
  next = 1;
  ledger = true;
  failKeyInserts = 0;
  connect() {
    const id = this.next++;
    const db = this;
    let tx: { groups: any[]; keys: any[]; members: any[]; events: any[] } | null = null;
    const visible = (kind: "groups" | "keys" | "members" | "events") => [...db[kind], ...(tx ? tx[kind] : [])];
    const client = {
      async query(sql: string, params: unknown[] = []) {
        const s = sql.replace(/\s+/g, " ").trim().toLowerCase();
        if (s === "begin") { tx = { groups: [], keys: [], members: [], events: [] }; return { rows: [] }; }
        if (s === "commit") {
          db.groups.push(...tx!.groups); db.keys.push(...tx!.keys); db.members.push(...tx!.members); db.events.push(...tx!.events);
          tx = null; db.unlock(id); return { rows: [] };
        }
        if (s === "rollback") { tx = null; db.unlock(id); return { rows: [] }; }
        if (!db.ledger && s.includes("cmp_create_key")) {
          const err = new Error("relation cmp_create_key does not exist") as Error & { code: string };
          err.code = "42P01";
          throw err;
        }
        if (s.startsWith("select pg_advisory_xact_lock")) {
          const k = `${params[0]}\0${params[1]}`;
          while (db.held.has(k) && db.held.get(k) !== id) await new Promise<void>(r => db.waiters.push(r));
          db.held.set(k, id);
          return { rows: [{}] };
        }
        if (s.includes("from cmp_create_key")) {
          const row = visible("keys").find(k => k.user_id === params[0] && k.idem_key === params[1]);
          if (!row) return { rows: [] };
          const g = visible("groups").find(x => x.id === row.group_id);
          return { rows: [{ ...g, payload_hash: row.payload_hash, has_photo: false, photo_updated_at: null }] };
        }
        if (s.includes("from cmp_member")) return { rows: visible("members").filter(m => m.group_id === params[0] && m.status === "invited") };
        if (s.includes("from cmp_event")) return { rows: [{ n: visible("events").filter(e => e.actor_id === params[0] && e.action === params[1]).length }] };
        if (s.includes("from club_account")) return { rows: [] };
        if (s.startsWith("insert into cmp_group")) {
          const g = { id: randomUUID(), name: params[0], owner_id: params[1], share_token: params[2], share_enabled: true, share_expires_at: null };
          tx!.groups.push(g);
          return { rows: [g] };
        }
        if (s.startsWith("insert into cmp_member")) { tx!.members.push({ group_id: params[0], status: "accepted" }); return { rows: [] }; }
        if (s.startsWith("insert into cmp_event")) { tx!.events.push({ actor_id: params[0], action: params[1], group_id: params[2] }); return { rows: [] }; }
        if (s.startsWith("insert into cmp_create_key")) {
          if (db.failKeyInserts > 0) { db.failKeyInserts--; throw new Error("ledger insert failed"); }
          const clash = visible("keys").some(k => k.user_id === params[0] && k.idem_key === params[1]);
          if (clash) return { rows: [] };
          tx!.keys.push({ user_id: params[0], idem_key: params[1], group_id: params[2], payload_hash: params[3] });
          return { rows: [{ group_id: params[2] }] };
        }
        throw new Error("unexpected sql: " + s);
      },
      release() { db.unlock(id); },
    };
    return Promise.resolve(client);
  }
  unlock(id: number) {
    for (const [k, v] of this.held) if (v === id) this.held.delete(k);
    const w = this.waiters.splice(0);
    for (const fn of w) fn();
  }
}

test("the same idempotency key commits one group even when two creates overlap", async () => {
  const db = new Mem();
  const [a, b] = await Promise.all([
    createGroupAtomic("u1", "Scratch", [], "same-key", () => db.connect()),
    createGroupAtomic("u1", "Scratch", [], "same-key", () => db.connect()),
  ]);
  assert.equal(a.result.id, b.result.id);
  assert.equal(db.groups.length, 1);
  assert.equal(db.keys.length, 1);
  assert.equal(a.result.name, "Scratch");
});

test("a new key with the same display name is another group, and another user does not share the key", async () => {
  const db = new Mem();
  const connect = () => db.connect();
  const a = await createGroupAtomic("u1", "Scratch", [], "k1", connect);
  const b = await createGroupAtomic("u1", "Scratch", [], "k2", connect);
  const c = await createGroupAtomic("u2", "Scratch", [], "k1", connect);
  assert.equal(new Set([a.result.id, b.result.id, c.result.id]).size, 3);
  assert.equal(db.groups.length, 3);
});

test("the same key with a different payload is rejected and does not create a second group", async () => {
  const db = new Mem();
  const connect = () => db.connect();
  const a = await createGroupAtomic("u1", "Scratch", [], "k1", connect);
  await assert.rejects(() => createGroupAtomic("u1", "Otro", [], "k1", connect), (e: unknown) => e instanceof HttpError && e.status === 409);
  assert.equal(db.groups.length, 1);
  assert.equal(db.groups[0].id, a.result.id);
});

test("a failed ledger insert rolls the group back, and the retry then stores one", async () => {
  const db = new Mem();
  db.failKeyInserts = 1;
  const connect = () => db.connect();
  await assert.rejects(() => createGroupAtomic("u1", "Scratch", [], "k1", connect));
  assert.equal(db.groups.length, 0);
  assert.equal(db.keys.length, 0);
  const again = await createGroupAtomic("u1", "Scratch", [], "k1", connect);
  const replay = await createGroupAtomic("u1", "Scratch", [], "k1", connect);
  assert.equal(db.groups.length, 1);
  assert.equal(again.result.id, replay.result.id);
});

test("a missing ledger table does not leave a group behind", async () => {
  const db = new Mem();
  db.ledger = false;
  await assert.rejects(() => createGroupAtomic("u1", "Scratch", [], "k1", () => db.connect()), (e: unknown) => e instanceof HttpError && e.status === 503);
  assert.equal(db.groups.length, 0);
  assert.equal(db.members.length, 0);
  assert.equal(db.events.length, 0);
});
