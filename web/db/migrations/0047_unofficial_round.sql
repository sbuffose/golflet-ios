-- v47. A round loaded without a club scorecard is unofficial.
-- Does not delete rows. Does not rewrite scores, handicap, groups or photos.
-- Existing live rounds stay official. A manual row with no club card is then marked unofficial.
-- Existing club cards stay official.
-- tee already exists on production live_round. ADD COLUMN IF NOT EXISTS is a no-op there
-- and adds it on a database created from the reconstruction test stub.
--
-- Helper compatible: each statement ends at its own semicolon. No procedural block
-- and no dollar quoting. Safe to run again.
--
-- Do not apply this from the app and do not run it against production from a deploy script.
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f web/db/migrations/0047_unofficial_round.sql

alter table live_round add column if not exists tee text;

alter table live_round add column if not exists official boolean;

update live_round set official = not (coalesce(origin, 'live') = 'manual' and round_id is null) where official is null;

alter table live_round alter column official set default true;

alter table live_round alter column official set not null;

alter table round add column if not exists official boolean;

update round set official = true where official is null;

alter table round alter column official set default true;

alter table round alter column official set not null;
