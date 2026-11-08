-- v41. Idempotent. Safe to run more than once on a database that already has cmp_group.
-- Creates the group-create ledger if it is missing, and adds payload_hash if an earlier
-- version of the table exists without it. Does not update, delete, or rewrite groups,
-- members, rounds, or handicap rows.
--
-- Apply with the connection string the project already has. Do not commit that string
-- and do not expose it through an HTTP route:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f web/db/migrations/0041_cmp_create_key.sql
-- Neon: paste this file into the project's SQL editor, or run the same psql command
-- from a shell where DATABASE_URL is already set (for example after `vercel env pull`).

create table if not exists cmp_create_key (
  user_id text not null,
  idem_key text not null,
  group_id uuid not null references cmp_group(id) on delete cascade,
  payload_hash text,
  created_at timestamptz not null default now(),
  primary key (user_id, idem_key)
);

alter table cmp_create_key add column if not exists payload_hash text;
