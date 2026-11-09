-- v45. Prepared, NOT applied. Player photo for the account avatar.
-- user_pref today stores call_name, pace and text settings. It has no photo.
-- Group photos already live on cmp_group.photo. This does not touch them.
-- Additive. Does not rewrite rounds, groups, or TRACK shots.
-- Do not run this from the app, a deploy, or this agent.
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f web/db/migrations/0045_user_photo.sql
-- Until it is applied, /api/data keeps working and photo_url stays null.
-- PUT /api/me/photo answers 503 and stores nothing.

alter table user_pref add column if not exists photo bytea;
alter table user_pref add column if not exists photo_updated_at timestamptz;
