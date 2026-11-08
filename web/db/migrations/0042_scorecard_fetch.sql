-- v42. Additive and safe to run more than once.
-- One durable row per club booking, and per finished GPS round that has no booking,
-- so the scorecard can be read from five hours after the tee even if the app and the site are closed.
-- The server reviews due rows every fifteen minutes, so the first read lands in that quarter hour, not on the exact minute.
-- Does not update, delete, or rewrite rounds, handicap rows, groups, or photos.
--
-- Helper compatible: every statement ends at its own semicolon. There is no procedural
-- block and no dollar quoting. A splitter that cuts on semicolons can run this file.
--
-- Fresh database: both checks are declared on the table. lock_token and version are the
-- compare-and-swap for a worker. scorecard_sync_lease is one expiring lock per Golfistics login.
-- club_account.last_sync_started_at is the clock for a sync left in 'running'.
--
-- Re-run: IF NOT EXISTS makes the tables, the added columns, and the indexes a no-op.
-- Constraints that were created with the table are not added a second time.
--
-- Partial schema: production has no scorecard_fetch. If an older attempt created the table
-- without lock_token, version, or the lease table, the ADD COLUMN and CREATE TABLE statements
-- below repair that. They do not add the status check onto a table that already exists,
-- because ADD CONSTRAINT is not idempotent without a procedural block and a second run would
-- abort the helper. The application writes only the seven statuses named in the fresh-table
-- check. A table created by this file has that check from the start.
--
-- Apply with the connection the project already has. Do not commit that string and do not
-- send it through an HTTP route:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f web/db/migrations/0042_scorecard_fetch.sql
-- Do not apply this from the app, and do not run it against production from a deploy script.

create table if not exists scorecard_fetch (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references "user"(id) on delete cascade,
  tee_time_id uuid references tee_time(id) on delete cascade,
  live_round_id uuid references live_round(id) on delete cascade,
  club_account_id uuid references club_account(id) on delete set null,
  played_at timestamptz not null,
  date date not null,
  time text,
  club_code text,
  course_label text,
  status text not null check (status in ('scheduled','awaiting_card','complete','cancelled','needs_credentials','error','stopped')),
  next_attempt_at timestamptz not null,
  last_attempt_at timestamptz,
  attempt_count int not null default 0,
  last_error text,
  round_id uuid references round(id) on delete set null,
  locked_at timestamptz,
  lock_token text,
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint scorecard_fetch_target check (tee_time_id is not null or live_round_id is not null)
);

alter table scorecard_fetch add column if not exists tee_time_id uuid references tee_time(id) on delete cascade;
alter table scorecard_fetch add column if not exists live_round_id uuid references live_round(id) on delete cascade;
alter table scorecard_fetch add column if not exists club_account_id uuid references club_account(id) on delete set null;
alter table scorecard_fetch add column if not exists played_at timestamptz;
alter table scorecard_fetch add column if not exists date date;
alter table scorecard_fetch add column if not exists time text;
alter table scorecard_fetch add column if not exists club_code text;
alter table scorecard_fetch add column if not exists course_label text;
alter table scorecard_fetch add column if not exists status text;
alter table scorecard_fetch add column if not exists next_attempt_at timestamptz;
alter table scorecard_fetch add column if not exists last_attempt_at timestamptz;
alter table scorecard_fetch add column if not exists attempt_count int not null default 0;
alter table scorecard_fetch add column if not exists last_error text;
alter table scorecard_fetch add column if not exists round_id uuid references round(id) on delete set null;
alter table scorecard_fetch add column if not exists locked_at timestamptz;
alter table scorecard_fetch add column if not exists lock_token text;
alter table scorecard_fetch add column if not exists version int not null default 1;
alter table scorecard_fetch add column if not exists created_at timestamptz not null default now();
alter table scorecard_fetch add column if not exists updated_at timestamptz not null default now();

create table if not exists scorecard_sync_lease (
  sync_key text primary key,
  token text not null,
  user_id text not null,
  job_id uuid,
  acquired_at timestamptz not null default now(),
  expires_at timestamptz not null
);

alter table club_account add column if not exists last_sync_started_at timestamptz;

create unique index if not exists scorecard_fetch_tee on scorecard_fetch (tee_time_id) where tee_time_id is not null;
create unique index if not exists scorecard_fetch_live on scorecard_fetch (live_round_id) where live_round_id is not null;
create index if not exists scorecard_fetch_due on scorecard_fetch (next_attempt_at)
  where status in ('scheduled','awaiting_card','needs_credentials','error');
create index if not exists scorecard_sync_lease_expires on scorecard_sync_lease (expires_at);
