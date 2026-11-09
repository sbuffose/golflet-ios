-- v46. Prepared, NOT applied.
-- A visual trace drawn on satellite imagery, and the note that a hole still needs a person.
-- Does not replace course_map (imported geometry), vm_course (Golfistics axis) or green_surface (a measured survey).
-- A row here is not the day's pin and not a slope survey.
-- Do not run this from the app, a deploy, or this agent.
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f web/db/migrations/0046_course_trace.sql
-- Until it is applied, the admin preview still works and Guardar answers 503 without writing.
--
-- Rollback, only after this file has been applied, and only by a person:
--   drop table if exists course_trace;
-- That drops the trace table. It does not touch course_map, vm_course, or green_surface.
-- Do not run the rollback from the app, a deploy, or this agent.

create table if not exists course_trace (
  club_code text not null,
  course text not null,
  hole int not null check (hole between 1 and 18),
  status text not null check (status in ('draft', 'needs_review', 'accepted', 'rejected')),
  confidence text not null default 'satellite_visual' check (confidence = 'satellite_visual'),
  parent text not null check (parent in ('openstreetmap', 'golfistics_axis', 'none')),
  tee jsonb,
  green jsonb,
  note text not null default '',
  edited_by text,
  updated_at timestamptz not null default now(),
  primary key (club_code, course, hole)
);
