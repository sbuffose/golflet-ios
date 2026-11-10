/** Local Postgres only. user_pref.user_id is text; a uuid[] cast is the production 500. */
import test, { describe } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";

const TEST_DATABASE_URL = process.env.GOLFLET_GROUP_DATABASE_URL || "postgres://golflet_test:golflet_test@127.0.0.1:5432/golflet_group_photo_test";
const local = /@(127\.0\.0\.1|localhost)(:|\/)/.test(TEST_DATABASE_URL);
const ANA = "11111111-1111-4111-8111-111111111111";
const LUIS = "22222222-2222-4222-8222-222222222222";
const PRIV = "33333333-3333-4333-8333-333333333333";
const GROUP = "44444444-4444-4444-8444-444444444444";
const ANA_MEMBER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const LUIS_MEMBER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const PRIV_MEMBER = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const PHOTO = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);

const SCHEMA = `
drop table if exists cmp_member_pref, share_pref, cmp_member, cmp_group, user_pref, bag, round_note, round, club_account, club, "user" cascade;
create table "user" (id text primary key, name text, email text);
create table club (id serial primary key, code text, name text, base_url text);
create table club_account (
  id uuid primary key default gen_random_uuid(),
  user_id text references "user"(id),
  club_id int references club(id),
  matricula text, player_name text, source text, password_enc text,
  last_sync_at timestamptz, last_sync_status text, last_sync_message text,
  handicap_index numeric, created_at timestamptz not null default now(), local_club text
);
create table round (
  id uuid primary key default gen_random_uuid(),
  club_account_id uuid, date date, course text,
  data jsonb not null default '{}'::jsonb, holes jsonb not null default '[]'::jsonb
);
create table round_note (round_id uuid primary key);
create table bag (user_id text primary key, clubs jsonb);
create table user_pref (
  user_id text primary key references "user"(id) on delete cascade,
  call_name text, updated_at timestamptz not null default now(),
  photo bytea, photo_updated_at timestamptz
);
create table cmp_group (
  id uuid primary key, name text not null, owner_id text not null references "user"(id),
  created_at timestamptz not null default now(), photo bytea, photo_updated_at timestamptz,
  share_token text, share_enabled boolean not null default true, share_expires_at timestamptz
);
create table cmp_member (
  id uuid primary key, group_id uuid not null references cmp_group(id) on delete cascade,
  matricula text not null, user_id text references "user"(id), status text not null,
  invited_by text, invited_at timestamptz not null default now(), responded_at timestamptz,
  role text not null default 'member'
);
create table share_pref (user_id text primary key references "user"(id), prefs jsonb not null default '{}'::jsonb);
create table cmp_member_pref (
  group_id uuid not null, user_id text not null, view jsonb not null default '{}'::jsonb,
  share jsonb, updated_at timestamptz not null default now(), primary key (group_id, user_id)
);`;

let pool: pg.Pool | null = null;
const db = () => {
  if (!local) throw new Error("La base de prueba no es local");
  if (!pool) pool = new pg.Pool({ connectionString: TEST_DATABASE_URL, max: 4, connectionTimeoutMillis: 2000 });
  return pool;
};
const sql = async (text: string, params: unknown[] = []) => (await db().query(text, params)).rows;

async function ready() {
  process.env.DATABASE_URL = TEST_DATABASE_URL;
  process.env.BETTER_AUTH_SECRET ||= "test-secret-test-secret-test-secret";
  await sql("select 1");
  for (const statement of SCHEMA.split(";").map(s => s.trim()).filter(Boolean)) await sql(statement);
  const { useQueryRunner } = await import("../lib/db");
  useQueryRunner((text, params = []) => sql(text, params));
}

async function seed() {
  await sql(`insert into "user" (id, name, email) values
    ($1, 'Ana Pérez', 'ana@test.local'), ($2, 'Luis Gómez', 'luis@test.local'), ($3, 'Clara Díaz', 'clara@test.local')`, [ANA, LUIS, PRIV]);
  await sql(`insert into user_pref (user_id, photo, photo_updated_at) values ($1, $2, now()), ($3, $2, now())`, [ANA, PHOTO, PRIV]);
  await sql(`insert into share_pref (user_id, prefs) values ($1, '{"profile":false}'::jsonb)`, [PRIV]);
  await sql(`insert into cmp_group (id, name, owner_id) values ($1, 'Grupo foto', $2)`, [GROUP, ANA]);
  await sql(`insert into cmp_member (id, group_id, matricula, user_id, status, role) values
    ($1, $4, '100', $5, 'accepted', 'admin'),
    ($2, $4, '200', $6, 'accepted', 'member'),
    ($3, $4, '300', $7, 'accepted', 'member')`, [ANA_MEMBER, LUIS_MEMBER, PRIV_MEMBER, GROUP, ANA, LUIS, PRIV]);
}

function open() {
  return new Request(`http://127.0.0.1/api/groups/${GROUP}?range=all`);
}

describe("fotos del grupo contra Postgres", { concurrency: 1 }, () => {
test("groupCompare reads a text user id photo and leaves the rest as initials", async (t) => {
  if (!local) return t.skip("la URL de prueba no es local");
  try { await ready(); } catch (e) { return t.skip(`sin postgres aislado: ${e instanceof Error ? e.message : "error"}`); }
  const type = await sql(`select data_type from information_schema.columns where table_name='user_pref' and column_name='user_id'`);
  assert.equal(type[0].data_type, "text");
  await assert.rejects(
    () => sql(`select user_id from user_pref where user_id = any($1::uuid[]) and photo is not null`, [[ANA]]),
    (e: unknown) => /operator does not exist: text = uuid/.test(String((e as Error).message)),
  );
  await seed();
  const found = await sql(`select user_id from user_pref where user_id = any($1::text[]) and photo is not null`, [[ANA, LUIS, PRIV]]);
  assert.deepEqual(found.map(r => r.user_id).sort(), [ANA, PRIV].sort());

  const { auth } = await import("../lib/auth");
  const { GET } = await import("../app/api/groups/[id]/route");
  auth.api.getSession = (async () => ({ user: { id: ANA, email: "ana@test.local", name: "Ana Pérez" }, session: { id: "s" } })) as typeof auth.api.getSession;
  const res = await GET(open(), { params: Promise.resolve({ id: GROUP }) });
  assert.equal(res.status, 200);
  const body = await res.json() as { group: { name: string }; members: { member_id: string; photo_url?: string }[] };
  assert.equal(body.group.name, "Grupo foto");
  const byId = new Map(body.members.map(m => [m.member_id, m]));
  assert.equal(byId.get(ANA_MEMBER)?.photo_url, `/api/groups/${GROUP}/members/${ANA_MEMBER}/photo`);
  assert.equal(byId.get(LUIS_MEMBER)?.photo_url, undefined);
  assert.equal(byId.get(PRIV_MEMBER)?.photo_url, undefined);
});

test("a profilePhotos failure still returns the group with status 200", async (t) => {
  if (!local) return t.skip("la URL de prueba no es local");
  try { await ready(); await seed(); } catch (e) { return t.skip(`sin postgres aislado: ${e instanceof Error ? e.message : "error"}`); }
  const { useQueryRunner } = await import("../lib/db");
  useQueryRunner(async (text, params = []) => {
    if (/from user_pref/i.test(text) && /photo is not null/i.test(text)) {
      const err = new Error("operator does not exist: text = uuid");
      (err as { code?: string }).code = "42883";
      throw err;
    }
    return sql(text, params);
  });
  const { auth } = await import("../lib/auth");
  const { GET } = await import("../app/api/groups/[id]/route");
  auth.api.getSession = (async () => ({ user: { id: ANA, email: "ana@test.local", name: "Ana Pérez" }, session: { id: "s" } })) as typeof auth.api.getSession;
  const res = await GET(open(), { params: Promise.resolve({ id: GROUP }) });
  assert.equal(res.status, 200);
  const body = await res.json() as { group: { name: string }; members: { photo_url?: string }[] };
  assert.equal(body.group.name, "Grupo foto");
  assert.equal(body.members.length, 3);
  assert.equal(body.members.some(m => m.photo_url), false);
});
});

test.after(async () => {
  const { useQueryRunner } = await import("../lib/db").catch(() => ({ useQueryRunner: null }));
  useQueryRunner?.(null);
  await pool?.end();
});
