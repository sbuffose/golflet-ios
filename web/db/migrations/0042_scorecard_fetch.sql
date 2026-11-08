-- v42. Idempotent. Safe to run more than once.
-- One durable row per club booking (and per finished GPS round that has no booking)
-- so the scorecard can be read 5 hours after the tee even if the app and the site are closed.
-- Does not update, delete, or rewrite rounds, handicap rows, groups, or photos.
--
-- Apply with the connection string the project already has. Do not commit that string
-- and do not expose it through an HTTP route:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f web/db/migrations/0042_scorecard_fetch.sql
-- Neon: paste this file into the project's SQL editor, or run the same psql command
-- from a shell where DATABASE_URL is already set (for example after `vercel env pull`).
-- The cron /api/cron/scorecard does nothing useful until this table exists.
-- Do not apply this from the app, and do not run it against production from a deploy script in this change.

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
  status text not null,
  next_attempt_at timestamptz not null,
  last_attempt_at timestamptz,
  attempt_count int not null default 0,
  last_error text,
  round_id uuid references round(id) on delete set null,
  locked_at timestamptz,
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
alter table scorecard_fetch add column if not exists created_at timestamptz not null default now();
alter table scorecard_fetch add column if not exists updated_at timestamptz not null default now();

do $$ begin
  alter table scorecard_fetch add constraint scorecard_fetch_status
    check (status in ('scheduled','awaiting_card','complete','cancelled','needs_credentials','error','stopped'));
exception when duplicate_object then null;
end $$;

create unique index if not exists scorecard_fetch_tee on scorecard_fetch (tee_time_id) where tee_time_id is not null;
create unique index if not exists scorecard_fetch_live on scorecard_fetch (live_round_id) where live_round_id is not null;
create index if not exists scorecard_fetch_due on scorecard_fetch (next_attempt_at)
  where status in ('scheduled','awaiting_card','needs_credentials','error');
