-- v44. Additive. Per-hole quick stats live on the account, apart from round totals.
-- Does not rewrite round_note, rounds, handicap rows, groups, or photos.
-- Does not delete or drop anything.
--
-- Helper compatible: one statement, no procedural block and no dollar quoting.
-- CREATE TABLE IF NOT EXISTS is a no-op when the table is already there.
--
-- Partial schema: if this file has not been applied, the hole-mark route answers 503.
-- The client keeps the mark on screen and does not replace putts, greens, or fairways.
--
-- Do not apply this from the app and do not run it against production from a deploy script.
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f web/db/migrations/0044_round_hole_mark.sql

create table if not exists round_hole_mark (
  round_id uuid not null references round(id) on delete cascade,
  user_id text not null references "user"(id) on delete cascade,
  hole int not null check (hole between 1 and 18),
  putts int check (putts is null or (putts >= 0 and putts <= 6)),
  gir boolean,
  drive text check (drive is null or drive in ('left', 'fairway', 'right', 'other')),
  rev int not null check (rev >= 1),
  updated_at timestamptz not null default now(),
  primary key (round_id, hole)
);
