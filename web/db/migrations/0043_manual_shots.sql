-- v43. Additive. A reconstructed shot may be saved with no map point.
-- Does not rewrite rounds, handicap rows, groups, or photos.
-- Does not delete or drop anything.
--
-- Helper compatible: each statement ends at its own semicolon. No procedural block
-- and no dollar quoting.
--
-- Fresh and re-run: ADD COLUMN IF NOT EXISTS is a no-op when the column is already there.
-- DROP NOT NULL on lat and lng is safe to run again. Existing GPS rows keep their coordinates.
-- origin defaults to 'live', so rows that already exist stay live rounds.
--
-- There is no CHECK on origin or distance_kind. ADD CONSTRAINT is not idempotent without
-- a procedural block, and a second run would abort the helper. The application writes
-- only 'live' or 'manual' for origin, and only 'estimated' or 'unknown' for a
-- reconstructed distance. It never writes 'gps' from this flow.
--
-- Partial schema: if this file has not been applied, a reconstructed save fails closed
-- and tells the caller to apply it. It does not invent coordinates.
-- The scorecard query ignores origin when the column is absent and skips origin 'manual'
-- once the column exists, so a reconstruction does not start a club read by itself.
--
-- Do not apply this from the app and do not run it against production from a deploy script.
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f web/db/migrations/0043_manual_shots.sql

alter table live_round add column if not exists origin text not null default 'live';

alter table shot alter column lat drop not null;
alter table shot alter column lng drop not null;
alter table shot add column if not exists end_lat double precision;
alter table shot add column if not exists end_lng double precision;
alter table shot add column if not exists end_source text;
alter table shot add column if not exists penalty_strokes int;
alter table shot add column if not exists distance_m real;
alter table shot add column if not exists distance_kind text;
