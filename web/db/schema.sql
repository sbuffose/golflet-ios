-- Golflet app schema (Better Auth tables are created by `npx @better-auth/cli migrate`).
create table if not exists club (
  id serial primary key,
  base_url text not null unique,           -- e.g. https://golf.e-jockeyclub.org.ar/golf
  name text not null,
  code text,                               -- Golfistics CodigoClub (118 = Jockey)
  seeded boolean not null default false,
  direct_login boolean not null default false, -- t166u: players can link on the club site (login.php) when Golfistics App lists no clubs
  created_at timestamptz not null default now()
);

create table if not exists club_account (
  id uuid primary key default gen_random_uuid(),
  user_id text references "user"(id) on delete cascade,   -- null = imported seed waiting to be claimed
  club_id int not null references club(id),
  matricula text not null,
  player_key text,
  player_name text,
  gender text,
  handicap_index numeric,
  password_enc text,                       -- AES-256-GCM, only if the user chose to save it
  last_sync_at timestamptz,
  last_sync_status text,                   -- ok | error | running
  last_sync_message text,
  created_at timestamptz not null default now()
);
create unique index if not exists club_account_user_club_mat on club_account (coalesce(user_id, ''), club_id, matricula);
create index if not exists club_account_user on club_account (user_id);

create table if not exists course (
  club_id int not null references club(id),
  name text not null,
  par int,
  holes jsonb not null default '[]',       -- [{hole,par,par_raw,hcp,hcp_raw,yards:{TEE:yds}}]
  tees jsonb not null default '{}',        -- {Tee:{course_rating,slope,gender}}
  as_of date,
  primary key (club_id, name)
);

create table if not exists round (
  id uuid primary key default gen_random_uuid(),
  club_account_id uuid not null references club_account(id) on delete cascade,
  external_id text not null,               -- Golfistics TorneoID (or date when missing)
  date date not null,
  course text,
  data jsonb not null,                     -- normalized round fields
  holes jsonb not null default '[]',       -- [[hole, par, strokes], ...]
  updated_at timestamptz not null default now(),
  unique (club_account_id, external_id)
);
create index if not exists round_account_date on round (club_account_id, date desc);

-- user-entered, never touched by sync
create table if not exists round_note (
  round_id uuid primary key references round(id) on delete cascade,
  user_id text not null references "user"(id) on delete cascade,
  putts int, gir int, fir int,
  notes text,
  updated_at timestamptz not null default now()
);

create table if not exists bag (
  user_id text primary key references "user"(id) on delete cascade,
  clubs jsonb not null,
  updated_at timestamptz not null default now()
);

-- Golfistics "comparativo por hoyo" (player vs all players), optional/background
create table if not exists hole_compare (
  club_account_id uuid not null references club_account(id) on delete cascade,
  course text not null,
  data jsonb not null,                      -- {hole:{filtro:{player_pct,group_pct,...}}}
  updated_at timestamptz not null default now(),
  primary key (club_account_id, course)
);

create table if not exists hi_history (
  club_account_id uuid not null references club_account(id) on delete cascade,
  date date not null,
  club text,
  hi numeric not null,
  primary key (club_account_id, date)
);

insert into club (base_url, name, code, seeded) values
  ('https://golf.e-jockeyclub.org.ar/golf', 'Jockey Club Argentino', '118', true),
  ('https://www.aagscoring.com/golf', 'AAG Scoring (Asociación Argentina de Golf)', null, true)
on conflict (base_url) do nothing;

-- live sync progress (polled by the app while a sync request is in flight)
create table if not exists sync_progress (
  id uuid primary key,
  user_id text not null references "user"(id) on delete cascade,
  club text,
  stage text not null,
  done int, total int, list_total int,
  finished boolean not null default false,
  error text,
  updated_at timestamptz not null default now()
);

-- v3: Golfistics App source (one login -> every club via SSO). Additive, safe to re-run.
alter table club_account add column if not exists source text not null default 'site';   -- site | app
alter table club_account add column if not exists local_club text;                       -- club name as written on cards played at this club
alter table sync_progress add column if not exists club_index int;
alter table sync_progress add column if not exists club_count int;
create index if not exists club_account_app_link on club_account (user_id, matricula) where source = 'app';

-- v4: richer sync overlay (club crest + live card stats). Additive, safe to re-run.
alter table sync_progress add column if not exists club_code text;
alter table sync_progress add column if not exists stats jsonb;

-- v5: post-round voice recap + GPS distance / shot logging. Additive, safe to re-run.
-- Golfistics ViewMaster green geometry cache (public anonymous endpoints, read-only) + optional OpenStreetMap extras.
create table if not exists vm_club (
  club_code text primary key,               -- Golfistics CodigoClub (118 Jockey, 209 Mar del Plata)
  courses jsonb not null default '[]',      -- ["JOCKEY AZUL", ...] from viewmaster_get_courses_anonimo
  fetched_at timestamptz,
  attempted_at timestamptz
);
create table if not exists vm_course (
  club_code text not null,
  vm_course text not null,                  -- ViewMaster course_name
  holes jsonb not null default '[]',        -- [{hole, front:{lat,lng}, center:{lat,lng}, back:{lat,lng}}]
  osm jsonb,                                -- {source, fetched_at, holes:{"1":{tee, line, hazards:[{type,lat,lng,polygon}]}}}
  fetched_at timestamptz,
  attempted_at timestamptz,
  primary key (club_code, vm_course)
);
-- a round played with Golflet (GPS shot logging and/or a voice recap); linked to the synced Golfistics round when it appears
create table if not exists live_round (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references "user"(id) on delete cascade,
  club_code text,
  vm_course text,
  club_id int references club(id),
  course text,                              -- our course name (course.name), e.g. "Azul"
  date date not null,
  tee text,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  current_hole int,
  round_id uuid references round(id) on delete set null,
  updated_at timestamptz not null default now()
);
create index if not exists live_round_user on live_round (user_id, date desc);
create table if not exists shot (
  id uuid primary key default gen_random_uuid(),
  live_round_id uuid not null references live_round(id) on delete cascade,
  user_id text not null references "user"(id) on delete cascade,
  client_id text,                           -- idempotency key from the phone (offline queue)
  hole int not null,
  shot_number int not null,
  lat double precision not null,
  lng double precision not null,
  accuracy_m real,
  taken_at timestamptz not null default now(),
  club text,
  lie text,                                 -- tee | fairway | rough | bunker | green | fringe | recovery | other
  result text,                              -- fairway | green | rough | bunker | water | ob | penalty | holed | other
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists shot_client on shot (user_id, client_id) where client_id is not null;
create index if not exists shot_round on shot (live_round_id, hole, shot_number);
create table if not exists player_clubs (
  user_id text primary key references "user"(id) on delete cascade,
  clubs jsonb not null,                     -- [{code, label, enabled}]
  updated_at timestamptz not null default now()
);
create table if not exists round_recap (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references "user"(id) on delete cascade,
  round_id uuid references round(id) on delete cascade,
  live_round_id uuid references live_round(id) on delete cascade,
  status text not null,                     -- processing | ready | pending_ai | error
  error text,
  audio_mime text, audio_bytes int, duration_s real,
  transcript text, summary text,
  mistakes jsonb not null default '[]',     -- [{category, hole, text}]
  positives jsonb not null default '[]',    -- [{hole, text}]
  source text,                              -- ai | rules | manual
  model text,
  edited_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (round_id is not null or live_round_id is not null)
);
create unique index if not exists round_recap_round on round_recap (round_id) where round_id is not null;
create unique index if not exists round_recap_live on round_recap (live_round_id) where live_round_id is not null;
create index if not exists round_recap_user on round_recap (user_id, created_at desc);
create table if not exists recap_audio (
  recap_id uuid primary key references round_recap(id) on delete cascade,
  data bytea not null
);

-- v5.1: per-club error metrics (quick result after each shot) + launch-monitor samples. Additive, safe to re-run.
alter table shot add column if not exists direction text;           -- left | center | right
alter table shot add column if not exists length text;              -- short | on | long
alter table shot add column if not exists mishit boolean not null default false;
alter table shot add column if not exists intent text;              -- green | layup | null (derived when null)
alter table shot add column if not exists source text not null default 'gps';
create table if not exists club_sample (                            -- launch monitor rows (CSV import: FlightScope, Rapsodo, Garmin R10, TrackMan)
  id uuid primary key default gen_random_uuid(),
  user_id text not null references "user"(id) on delete cascade,
  source text not null,                                             -- flightscope | rapsodo | garmin_r10 | trackman | other
  session_id text,
  club text not null,                                               -- same codes as player_clubs (Dr, 7i, …)
  carry_m real, total_m real, side_m real,                          -- side: + right / - left of target
  ball_speed_mps real, launch_deg real, spin_rpm real,
  mishit boolean not null default false,
  taken_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists club_sample_user on club_sample (user_id, club, taken_at desc);

-- v6: roles + course strategy ("cómo jugar la cancha"). Additive, safe to re-run.
create table if not exists user_role (
  user_id text primary key references "user"(id) on delete cascade,
  role text not null check (role in ('admin')),
  granted_at timestamptz not null default now()
);
-- draft = what admins edit; published = what players see (copied from draft on "Publicar"; nothing auto-publishes)
create table if not exists course_strategy (
  course_id text primary key,                 -- GPS course id, e.g. 118-jockey-azul
  course_key text,                            -- our course key "1:Azul" (for the player view), filled on save
  draft jsonb not null default '{}',          -- {overview}
  published jsonb,
  updated_by text references "user"(id) on delete set null,
  updated_at timestamptz not null default now(),
  published_by text references "user"(id) on delete set null,
  published_at timestamptz
);
create index if not exists course_strategy_key on course_strategy (course_key);
create table if not exists hole_strategy (
  course_id text not null,
  hole int not null check (hole between 1 and 18),
  draft jsonb not null default '{}',          -- see lib/strategy-parse.ts normalizeHole
  published jsonb,
  updated_by text references "user"(id) on delete set null,
  updated_at timestamptz not null default now(),
  published_by text references "user"(id) on delete set null,
  published_at timestamptz,
  primary key (course_id, hole)
);

-- v7: full admin (roles admin|editor, audit log, course/green corrections, club crests, sync history). Additive, safe to re-run.
alter table user_role drop constraint if exists user_role_role_check;
alter table user_role add constraint user_role_role_check check (role in ('admin','editor'));
alter table user_role add column if not exists granted_by text references "user"(id) on delete set null;
create table if not exists admin_audit (
  id bigserial primary key,
  actor_id text references "user"(id) on delete set null,
  actor_email text,                           -- kept even if the actor is deleted
  action text not null,                       -- role.grant | role.revoke | course.override | green.override | club.update | club.logo | strategy.* ...
  target_type text, target_id text,
  summary text,                               -- human readable, Spanish
  detail jsonb,                               -- before/after (never secrets)
  created_at timestamptz not null default now()
);
create index if not exists admin_audit_created on admin_audit (created_at desc);
-- admin corrections layered on top of what sync writes (sync never touches these columns)
alter table course add column if not exists holes_override jsonb;          -- {"7":{"par":4,"hcp":13,"yards":{"AZUL":377}}}
alter table course add column if not exists override_note text;
alter table course add column if not exists override_by text references "user"(id) on delete set null;
alter table course add column if not exists override_at timestamptz;
alter table vm_course add column if not exists green_override jsonb;      -- {"7":{"front":{lat,lng},"center":{..},"back":{..}}}
alter table vm_course add column if not exists override_by text references "user"(id) on delete set null;
alter table vm_course add column if not exists override_at timestamptz;
create table if not exists club_logo (                                     -- crest uploaded from the admin (overrides public/clubs/<code>@2x.png)
  club_code text primary key,
  mime text not null,
  data bytea not null,
  updated_by text references "user"(id) on delete set null,
  updated_at timestamptz not null default now()
);
create table if not exists sync_log (                                      -- one row per sync run (history; sync_progress is pruned after a day)
  id bigserial primary key,
  user_id text references "user"(id) on delete cascade,
  trigger text not null,                      -- link | manual | cron
  ok boolean not null,
  new_rounds int, updated int, pending int,
  clubs jsonb,                                -- [{club_name, ok, new_rounds, message}] (user-facing messages only)
  message text,
  duration_ms int,
  created_at timestamptz not null default now()
);
create index if not exists sync_log_created on sync_log (created_at desc);

-- v8: sign-in with Golfistics matrícula + clave (Better Auth plugin endpoint /api/auth/golfistics). Additive, safe to re-run.
create table if not exists login_attempt (                  -- rate limit on failed sign-ins (hashed keys: never the clave, never a raw IP)
  id bigserial primary key,
  key_hash text not null,                                   -- sha256("m:" || matricula) or sha256("ip:" || ip)
  ok boolean not null,
  at timestamptz not null default now()
);
create index if not exists login_attempt_key on login_attempt (key_hash, at desc);
create table if not exists golfistics_pending (             -- first sign-in: clave kept encrypted (AES-256-GCM) only until the first sync runs
  user_id text primary key references "user"(id) on delete cascade,
  matricula text not null,
  password_enc text not null,
  save_password boolean not null default true,
  created_at timestamptz not null default now()
);
-- v9: separate admin sign-in (/admin/login, usuario + contraseña). Additive, safe to re-run.
create table if not exists admin_credential (               -- one per staff user; only an scrypt hash is stored, never the password
  user_id text primary key references "user"(id) on delete cascade,
  username text not null,
  pw_hash text not null,                                    -- scrypt$N$r$p$salt_b64$hash_b64
  must_change boolean not null default false,               -- set when an admin assigns the password to someone else
  failed_count int not null default 0,
  locked_until timestamptz,
  last_login_at timestamptz,
  set_by text references "user"(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists admin_credential_username on admin_credential (lower(username));
create table if not exists admin_session (                  -- 8h sessions; only sha256(token) is stored
  token_hash text primary key,
  user_id text not null references "user"(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index if not exists admin_session_user on admin_session (user_id);
create table if not exists user_pref (                      -- "Cómo te llamamos" (Cuenta), added in v9
  user_id text primary key references "user"(id) on delete cascade,
  call_name text,
  updated_at timestamptz not null default now()
);
-- v10: daily GPS greens read (Vercel Cron 09:00 UTC = 06:00 ART), read-only. Additive, safe to re-run.
alter table vm_course add column if not exists daily_read boolean not null default false;
alter table vm_course add column if not exists daily_read_by text references "user"(id) on delete set null;
alter table vm_course add column if not exists review jsonb;          -- holes where Golfistics moved a point that has a manual override: {hole: {fields, at}}
create table if not exists gps_read_run (
  id bigserial primary key,
  course_id text not null,
  club_code text not null, vm_course text not null,
  trigger text not null,                                  -- cron | manual
  actor_email text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running',                 -- ok | changed | skipped | failed
  changed_holes int not null default 0,
  conflicts int not null default 0,
  detail jsonb,                                           -- {changed:[{hole,points:[...],max_m}], conflicts:[hole...]} (no secrets)
  message text
);
create index if not exists gps_read_run_course on gps_read_run (course_id, started_at desc);
create index if not exists gps_read_run_started on gps_read_run (started_at desc);
create table if not exists app_setting (
  key text primary key,
  value jsonb not null,
  updated_by text references "user"(id) on delete set null,
  updated_at timestamptz not null default now()
);
-- v11: comparison groups ("Amigos"). Data is shared only between ACCEPTED members. Additive, safe to re-run.
create table if not exists cmp_group (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id text not null references "user"(id) on delete cascade,
  created_at timestamptz not null default now()
);
create table if not exists cmp_member (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references cmp_group(id) on delete cascade,
  matricula text not null,                                -- invite key; the invitee may not be a Golflet user yet
  user_id text references "user"(id) on delete cascade,   -- set when the matrícula belongs to a Golflet user (or on their first sign-in)
  status text not null,                                   -- invited | accepted | declined | left | removed | revoked
  invited_by text references "user"(id) on delete set null,
  invited_at timestamptz not null default now(),
  responded_at timestamptz
);
create unique index if not exists cmp_member_group_mat on cmp_member (group_id, matricula);
create index if not exists cmp_member_user on cmp_member (user_id, status);
create index if not exists cmp_member_mat on cmp_member (matricula) where user_id is null;
create table if not exists cmp_event (                    -- audit + rate limit (no emails, no data)
  id bigserial primary key,
  actor_id text,
  action text not null,                                   -- group.create | invite | accept | decline | leave | remove | revoke | group.delete | rename
  group_id uuid,
  member_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists cmp_event_actor on cmp_event (actor_id, action, created_at desc);
-- v12: groups v2 (WhatsApp-style admins, photo, share link, per-member view, sharing settings). Additive, safe to re-run.
alter table cmp_member add column if not exists role text not null default 'member';       -- admin | member
update cmp_member m set role='admin' from cmp_group g where g.id=m.group_id and g.owner_id=m.user_id and m.role<>'admin';
alter table cmp_group add column if not exists photo bytea;                                 -- resized JPEG (max 512px), images only
alter table cmp_group add column if not exists photo_updated_at timestamptz;
alter table cmp_group add column if not exists share_token text;                           -- random 22-char token for /g/<token>
alter table cmp_group add column if not exists share_enabled boolean not null default true;
alter table cmp_group add column if not exists share_expires_at timestamptz;               -- null = no expiry
create unique index if not exists cmp_group_share_token on cmp_group (share_token) where share_token is not null;
alter table cmp_event add column if not exists detail text;                                -- e.g. "link" for joins via share link (never personal data)
create table if not exists cmp_member_pref (                -- each member's own view of a group; admins never set other members' views
  group_id uuid not null references cmp_group(id) on delete cascade,
  user_id text not null references "user"(id) on delete cascade,
  view jsonb not null default '{}'::jsonb,                   -- { metrics:[ordered keys], sections:[ordered keys], range, course }
  share jsonb,                                               -- optional per-group override of share_pref (null = use profile)
  updated_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create table if not exists share_pref (                     -- "Qué comparto": global per player, enforced server-side in every group endpoint
  user_id text primary key references "user"(id) on delete cascade,
  prefs jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
create table if not exists cmp_link_hit (                   -- rate limit for /g/<token> (hashed IP, no token stored)
  id bigserial primary key,
  ip_hash text not null,
  created_at timestamptz not null default now()
);
create index if not exists cmp_link_hit_ip on cmp_link_hit (ip_hash, created_at desc);

-- v13: tee times (manual for now; source column ready for other real sources). Additive, safe to re-run.
create table if not exists tee_time (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references "user"(id) on delete cascade,
  date date not null,                       -- local date in Argentina
  time text not null check (time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),   -- local HH:MM (America/Argentina/Buenos_Aires)
  club_key text not null,                   -- ar_club_directory.key (no FK: the directory is maintained by another job)
  course_id int,                            -- ar_course_directory.id, null for single-course clubs
  club_name text not null,                  -- display names snapshotted at save (the directory can change later)
  course_label text,
  companions jsonb not null default '[]',   -- ["Martín", "Lucía"], max 7
  source text not null default 'manual',    -- manual (only real source today)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists tee_time_user on tee_time (user_id, date, time);
alter table tee_time add column if not exists tee text;           -- bocha/salida chosen (e.g. "Azul"); null = not set

-- v14: tee times come only from the player's club (misreservas.php); official playing handicap; per-club page status
alter table tee_time add column if not exists club_account_id uuid references club_account(id) on delete cascade;
alter table tee_time add column if not exists external_id text;          -- TorneoID of the booking
alter table tee_time add column if not exists start_hole int;
alter table tee_time add column if not exists modality text;             -- as the club shows it ("Medal", "Fourball Clásico")
alter table tee_time add column if not exists event_name text;           -- planilla de reservas
alter table tee_time add column if not exists course_how text;           -- nombre | color | null (how the course was read)
alter table tee_time add column if not exists seen_at timestamptz;
alter table tee_time alter column club_key drop not null;
create unique index if not exists tee_time_ext on tee_time (user_id, club_account_id, external_id);
delete from tee_time where source = 'manual';
create table if not exists playing_hcp (
  club_account_id uuid not null references club_account(id) on delete cascade,
  option_id text not null, course text not null, tee text not null, gender text,
  modality text not null, hi real, playing_hcp int, slope int, course_rating real, par int,
  fetched_at timestamptz not null default now(),
  primary key (club_account_id, option_id, course, modality)
);
create table if not exists club_page_status (
  club_account_id uuid not null references club_account(id) on delete cascade,
  page text not null,                        -- bookings | companions | hi_history | calculator
  status text not null,                      -- ok | empty | missing | error
  message text, items int,
  checked_at timestamptz not null default now(),
  primary key (club_account_id, page)
);

-- v14b: "Tengo otro club y no aparece" requests (web page + iOS sheet → admin "Pedidos de club")
create table if not exists club_requests (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references "user"(id) on delete cascade,
  matricula text, nombre text,
  club text not null, mensaje text,
  status text not null default 'nuevo' check (status in ('nuevo','resuelto')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz, resolved_by text
);
create index if not exists club_requests_new on club_requests (created_at desc);
create index if not exists club_requests_user on club_requests (user_id, created_at desc);

-- v15: profesores (phase A: player links + permissions; profile filled in phase B). Being a profesor = having a profesor_profile row
-- (NOT a user_role: user_role opens the admin panel). Additive, safe to re-run.
create table if not exists profesor_profile (
  user_id text primary key references "user"(id) on delete cascade,
  display_name text not null,
  matricula text,                                  -- optional, for search (players type a name or matrícula)
  bio text, method text,
  locations text[] not null default '{}',          -- where they teach (feeds "Encontrar un profesor" → Dónde)
  availability jsonb not null default '{}'::jsonb,  -- { lun: ["m","t","n"], ... }  m=mañana t=tarde n=noche
  levels jsonb not null default '[]'::jsonb,        -- [[min_hcp, max_hcp], ...]
  price_min int, price_max int,                    -- ARS per class
  formats text[] not null default '{}',            -- individual | grupal | en_cancha | driving | online
  active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists profesor_profile_name on profesor_profile (lower(display_name));
create table if not exists player_profesor (
  player_id text not null references "user"(id) on delete cascade,
  profesor_id text not null references "user"(id) on delete cascade,
  can_view_metrics boolean not null default false,  -- "Puede ver mis métricas" (within the player's share_pref)
  can_hear_audio boolean not null default false,    -- "Puede escuchar mis audios post juego" (the only exception to private voice notes)
  source text not null default 'search',            -- search | link | match
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  primary key (player_id, profesor_id),
  check (player_id <> profesor_id)
);
create index if not exists player_profesor_prof on player_profesor (profesor_id);
create table if not exists profesor_invite (        -- player → share link → the profesor opens /p/<token>
  token text primary key,
  player_id text not null references "user"(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '14 days',
  used_by text references "user"(id) on delete set null, used_at timestamptz
);
create index if not exists profesor_invite_player on profesor_invite (player_id, created_at desc);
create table if not exists profesor_event (         -- audit: link | unlink | grant | revoke | invite | invite.accept (no personal data)
  id bigserial primary key,
  actor_id text, action text not null, player_id text, profesor_id text, detail text,
  created_at timestamptz not null default now()
);
create index if not exists profesor_event_actor on profesor_event (actor_id, action, created_at desc);

-- v16: contact leads from the public links "¿Sos profesor?" and "¿Sponsor o marca?" (admin: Profesores interesados / Contactos de marcas)
create table if not exists contact_lead (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('profesor','marca')),
  nombre text not null, telefono text not null,
  lugar text,                                  -- profesor: where they teach
  matricula_aag text,                          -- profesor: Pro AAG matrícula (optional)
  empresa text, motivo text,                   -- marca
  user_id text references "user"(id) on delete set null,   -- when sent signed in
  ip_hash text,                                -- rate limit only (sha256, never the raw IP)
  status text not null default 'nuevo' check (status in ('nuevo','contactado','descartado','convertido')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), updated_by text
);
create index if not exists contact_lead_kind on contact_lead (kind, created_at desc);
create index if not exists contact_lead_ip on contact_lead (ip_hash, created_at desc);

-- v17: profesor accounts (phase B). account_status: pending (no login yet: created by an admin or from an application) | active.
-- verified is set by admins only. Pending profesores are searchable/linkable by players when active (= visible).
alter table profesor_profile add column if not exists verified boolean not null default false;
alter table profesor_profile add column if not exists account_status text not null default 'active';
alter table profesor_profile drop constraint if exists profesor_profile_account_status_check;
alter table profesor_profile add constraint profesor_profile_account_status_check check (account_status in ('pending','active'));
alter table profesor_profile add column if not exists created_via text not null default 'signup';   -- admin | lead | signup
alter table profesor_profile add column if not exists lead_id uuid references contact_lead(id) on delete set null;
alter table profesor_profile add column if not exists phone text;
alter table profesor_profile add column if not exists aag_matricula text;
alter table profesor_profile add column if not exists claimed_at timestamptz;
alter table profesor_profile add column if not exists verified_by text;
alter table contact_lead add column if not exists profesor_user_id text references "user"(id) on delete set null;

-- v18: "Encontrar un profesor" (t111u). The player's questionnaire answers (editable). Never shared with profesores.
create table if not exists profesor_match_answers (
  user_id text primary key references "user"(id) on delete cascade,
  availability jsonb not null default '{}'::jsonb,      -- { lun:[m,t,n], ... }
  hcp numeric(4,1),                                     -- level (prefilled from the official index, editable)
  play_freq text,                                       -- lt1m | 1_2m | semanal | 2sem
  locations text[] not null default '{}',               -- only places declared by profesores
  budget text,                                          -- b1 | b2 | b3 | b4 (ARS per class bands)
  class_freq text,                                      -- suelta | semanal | quincenal | mensual
  updated_at timestamptz not null default now()
);
-- v19: profesor phase D (t112u/t113u). Sessions the profesor logs; content assigned to a student; plan flag (billing off).
create table if not exists profesor_session (
  id uuid primary key default gen_random_uuid(),
  profesor_id text not null references "user"(id) on delete cascade,
  player_id text not null references "user"(id) on delete cascade,
  date date not null,
  worked_on text not null,                 -- qué se trabajó
  recommendations text,                    -- recomendaciones para practicar
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists profesor_session_pair on profesor_session (player_id, profesor_id, date desc);
create table if not exists profesor_content (
  id uuid primary key default gen_random_uuid(),
  profesor_id text not null references "user"(id) on delete cascade,
  player_id text not null references "user"(id) on delete cascade,
  kind text not null check (kind in ('link','tip','video')),   -- video = own upload (Premium of the student only)
  title text not null, body text, url text,
  blob_path text, blob_mime text, blob_size int,                -- private storage, student + profesor only
  seen_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists profesor_content_pair on profesor_content (player_id, profesor_id, created_at desc);
create table if not exists player_plan (                       -- billing OFF: plan flag + placeholder price (TBD)
  user_id text primary key references "user"(id) on delete cascade,
  plan text not null default 'free' check (plan in ('free','premium')),
  premium_until timestamptz, source text, updated_at timestamptz not null default now()
);
-- v20: shot tracking samples from the iOS Jugar flow (t104u/t105u). distance_m is computed server-side (GPS start→end = total, never carry).
create table if not exists shot_samples (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references "user"(id) on delete cascade,
  client_id text not null,                              -- idempotency key from the phone
  live_round_id uuid references live_round(id) on delete cascade,
  round_id uuid references round(id) on delete cascade,
  course_id text,                                       -- e.g. 118-jockey-azul
  hole int not null,
  club text,
  kind text not null check (kind in ('full','approach','putt_start')),
  start_lat double precision, start_lng double precision,
  end_lat double precision not null, end_lng double precision not null,
  distance_m real,
  accuracy_m real,
  putts int,                                            -- putt_start only: putts from there
  green jsonb,                                          -- putt_start only: offset vs green center {to_center_m,east_m,north_m,long_m,right_m}
  discarded boolean not null default false,
  taken_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index if not exists shot_samples_client on shot_samples (user_id, client_id);
create index if not exists shot_samples_user_club on shot_samples (user_id, club) where not discarded;
-- v21: t127u/t128u putting + distance to the flag (every stroke, putts included, keeps its GPS point)
alter table shot_samples drop constraint if exists shot_samples_kind_check;
alter table shot_samples add constraint shot_samples_kind_check check (kind in ('full','approach','putt_start','putt'));
alter table shot_samples alter column end_lat drop not null;
alter table shot_samples alter column end_lng drop not null;
alter table shot_samples add column if not exists shot_number int;
alter table shot_samples add column if not exists holed boolean not null default false;
alter table shot_samples add column if not exists flag_lat double precision;
alter table shot_samples add column if not exists flag_lng double precision;
alter table shot_samples add column if not exists flag_source text;          -- player_marked | green_center (never an invented pin)
alter table shot_samples add column if not exists to_flag_start_m real;      -- start point → flag
alter table shot_samples add column if not exists to_flag_end_m real;        -- where it stopped → flag (when the end point was marked)
-- v22: t74u pelota (the ball each player uses) + sorteos (admin-run; players opt in after accepting bases y condiciones)
create table if not exists player_ball (
  user_id text primary key references "user"(id) on delete cascade,
  brand text not null, model text, custom boolean not null default false,  -- custom = typed by the player ("Otra")
  updated_at timestamptz not null default now()
);
create table if not exists sorteo (
  id uuid primary key default gen_random_uuid(),
  title text not null, prize text not null, description text, sponsor text,
  bases text not null, bases_version text not null,                       -- sha256 prefix of the bases text; entries store the version they accepted
  starts_at timestamptz, ends_at timestamptz not null,
  status text not null default 'borrador' check (status in ('borrador','abierto','cerrado','sorteado','cancelado')),
  winner_user_id text references "user"(id) on delete set null, drawn_at timestamptz, drawn_by text, draw_info jsonb,
  created_by text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists sorteo_entry (
  sorteo_id uuid not null references sorteo(id) on delete cascade,
  user_id text not null references "user"(id) on delete cascade,
  bases_version text not null, accepted_at timestamptz not null default now(),
  primary key (sorteo_id, user_id)
);
-- v23: t130u/t131u "Ver video" on explainers. Admin-editable URLs per network; an explainer with no URL shows no link.
create table if not exists explainer_video (
  key text primary key,
  instagram text, tiktok text, youtube text, x text,
  updated_by text, updated_at timestamptz not null default now()
);

-- v24: t135u. "Contactar" (signed-in footer) reuses contact_lead with kind 'contacto'.
-- Anonymous feedback: NO user id, email, IP or session is stored with a submission. created_at is truncated to the hour.
-- Rate limiting lives in a separate counter keyed by a daily-salted IP hash (rotates every day, never joined to feedback).
alter table contact_lead drop constraint if exists contact_lead_kind_check;
alter table contact_lead add constraint contact_lead_kind_check check (kind in ('profesor','marca','contacto'));
create table if not exists feedback (
  id uuid primary key default gen_random_uuid(),
  category text check (category in ('no_funciono','idea','me_encanto','otro')),
  texto text not null,
  status text not null default 'nuevo' check (status in ('nuevo','leido','archivado')),
  created_at timestamptz not null default date_trunc('hour', now()),
  updated_at timestamptz, updated_by text
);
create index if not exists feedback_created on feedback (created_at desc);
create table if not exists feedback_rate (
  bucket text primary key,          -- sha256(day + secret salt + ip), unlinkable to submissions
  day date not null default current_date,
  n int not null default 0
);

-- v25: t136u/t137u. Weather per round (Open-Meteo archive, no key) + persistent tee times + private metrics support.
-- Weather is not personal: cached per location (rounded to ~1 km) + local date + hour window, shared by every user.
create table if not exists weather_cache (
  key text primary key,                     -- "lat,lng|YYYY-MM-DD|HH-HH" (lat/lng rounded to 2 decimals)
  lat double precision not null, lng double precision not null,
  date date not null, hour_from int not null, hour_to int not null,
  temp_c real, precip_mm real, rain_hours int, wind_kmh real, gust_kmh real, weather_code int,
  condition text check (condition in ('despejado','nublado','lluvia','tormenta')),
  source text not null default 'open-meteo-archive',
  status text not null default 'ok' check (status in ('ok','unavailable')),   -- unavailable = archive has no data yet (recent days); retried later
  fetched_at timestamptz not null default now()
);
-- Tee times are kept forever once read (t137u): a booking that disappears from the club is marked gone, never deleted.
alter table tee_time add column if not exists gone_at timestamptz;
alter table tee_time add column if not exists round_id uuid references round(id) on delete set null;
alter table tee_time add column if not exists partner_keys text[] not null default '{}';   -- normalized companion names (the club page shows names, not matrículas)
create index if not exists tee_time_round on tee_time (round_id);

-- v26: t142u pace of play. ESTIMATES (not club-official) of minutes per hole by modality family and players (1-4).
-- Resolution: (club_id, course) → (club_id, any course) → global default (club_id null). Editable in Admin › Ritmo de juego.
create table if not exists pace_estimate (
  id serial primary key,
  club_id int references club(id) on delete cascade,     -- null = global default
  course text,                                           -- course.name; null = whole club
  modality text not null check (modality in ('medal','stableford','match','fourball')),
  players int not null check (players between 1 and 4),
  min_per_hole real not null check (min_per_hole between 4 and 30),
  source text not null default 'estimado' check (source in ('estimado','club')),   -- 'club' only if a club ever publishes it
  updated_by text, updated_at timestamptz not null default now()
);
create unique index if not exists pace_estimate_key on pace_estimate (coalesce(club_id, 0), coalesce(course, ''), modality, players);
-- Seed: global defaults (18 holes, stroke play 4-ball ≈ 4h10). Fewer players → faster; stableford/match a bit faster (pick-ups/concessions).
insert into pace_estimate (club_id, course, modality, players, min_per_hole, updated_by)
select null, null, m.modality, p.players, round((p.base * m.f)::numeric, 1)::real, 'seed'
from (values (1, 8.3), (2, 10.8), (3, 12.5), (4, 13.9)) as p(players, base),
     (values ('medal', 1.0), ('stableford', 0.95), ('match', 0.92), ('fourball', 0.97)) as m(modality, f)
on conflict do nothing;
alter table live_round add column if not exists players int check (players between 1 and 4);
alter table live_round add column if not exists modality text check (modality in ('medal','stableford','match','fourball'));
alter table live_round add column if not exists pace_alert_at timestamptz;   -- when the hole-10 alert was shown (once per round)
alter table user_pref add column if not exists pace_alert boolean not null default true;
-- v27: accessibility text settings per user (t150u). Additive, safe to re-run.
alter table user_pref add column if not exists text_size text not null default 'normal';
alter table user_pref add column if not exists text_weight text not null default 'normal';
do $$ begin
  if not exists (select 1 from pg_constraint where conname='user_pref_text_size_chk') then alter table user_pref add constraint user_pref_text_size_chk check (text_size in ('normal','grande','muy_grande')); end if;
  if not exists (select 1 from pg_constraint where conname='user_pref_text_weight_chk') then alter table user_pref add constraint user_pref_text_weight_chk check (text_weight in ('normal','marcado')); end if;
end $$;
-- v28: notifications (t154u). Club messages are written by Golflet admins (the club systems expose no member messages),
-- sent to every member linked to that club. Group invitations come from cmp_member (status='invited'). Read state per user.
create table if not exists club_message (
  id uuid primary key default gen_random_uuid(),
  club_id int not null references club(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  body text not null default '' check (char_length(body) <= 4000),
  created_by text references "user"(id) on delete set null,   -- admin who wrote it
  created_at timestamptz not null default now(),
  withdrawn_at timestamptz                                     -- "Retirar": hidden from players, kept for the audit
);
create index if not exists club_message_club on club_message (club_id, created_at desc) where withdrawn_at is null;
create table if not exists notification_read (
  user_id text not null references "user"(id) on delete cascade,
  item_key text not null,                                      -- 'club_message:<uuid>' | 'group_invite:<cmp_member.id>'
  read_at timestamptz not null default now(),
  primary key (user_id, item_key)
);

-- v29: per-hole data from the live GPS round (t160u): putts counter and the pin the player marked ("Estoy en la bandera").
-- Shots stay in `shot`; this only holds what is not a shot. A pin is only ever the player's own GPS fix (never invented).
create table if not exists live_hole (
  live_round_id uuid not null references live_round(id) on delete cascade,
  hole int not null check (hole between 1 and 18),
  putts int check (putts between 0 and 10),                    -- null = not counted
  pin_lat double precision,
  pin_lng double precision,
  pin_accuracy_m real,
  pin_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (live_round_id, hole)
);

-- v30: collaborative daily pin positions (t162u). One pin per course + hole + day (ART). Club pin > player pin.
-- Privacy: set_by / reporter are never returned to players or clubs; only admins see a report's reporter.
alter table user_role drop constraint if exists user_role_role_check;
alter table user_role add constraint user_role_role_check check (role in ('admin','editor','club'));
create table if not exists club_staff (                       -- role 'club': can only load pins for this club's courses
  user_id text primary key references "user"(id) on delete cascade,
  club_code text not null,
  created_by text references "user"(id) on delete set null,
  created_at timestamptz not null default now()
);
create table if not exists course_pin (
  id uuid primary key default gen_random_uuid(),
  club_code text not null,
  vm_course text not null,
  hole int not null check (hole between 1 and 18),
  date date not null,                                          -- ART day
  lat double precision not null,
  lng double precision not null,
  accuracy_m real,
  zone text not null check (zone in ('front','middle','back')),
  source text not null check (source in ('player','club')),
  set_by text references "user"(id) on delete set null,
  moved_by_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (club_code, vm_course, hole, date)
);
create index if not exists course_pin_day on course_pin (club_code, vm_course, date);
create table if not exists pin_report (
  id uuid primary key default gen_random_uuid(),
  club_code text not null,
  vm_course text not null,
  hole int not null check (hole between 1 and 18),
  date date not null,
  pin_id uuid references course_pin(id) on delete set null,
  user_id text not null references "user"(id) on delete cascade,
  lat double precision, lng double precision, accuracy_m real,  -- reporter's GPS fix (admin only)
  pin_lat double precision, pin_lng double precision, pin_zone text, pin_source text,  -- the pin as it was when reported
  status text not null default 'open' check (status in ('open','cleared','moved','dismissed')),
  resolved_by text references "user"(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, club_code, vm_course, hole, date)           -- one report per player per hole per day
);
create index if not exists pin_report_open on pin_report (status, created_at desc);

-- t171u: detailed course maps from open data (OSM ODbL + Copernicus DEM + WMM). Never Golfistics/ViewMaster coordinates.
create table if not exists course_map (
  id serial primary key,
  club_code text not null,                 -- Golfistics CodigoClub (118 = Jockey)
  course text not null,                    -- our course name (course.name): Azul, Colorada
  extracted_at timestamptz not null,
  sources jsonb not null,                  -- osm (bbox, latest edit, ODbL), dem, declination (WMM)
  boundary jsonb,                          -- [[lng,lat]…] course boundary (OSM leisure=golf_course)
  summary jsonb not null default '{}',     -- coverage counts and open issues
  imported_at timestamptz not null default now(),
  unique (club_code, course)
);
create table if not exists course_map_hole (
  course_map_id int not null references course_map(id) on delete cascade,
  hole int not null,
  data jsonb not null,                     -- line, tees, green (polygon/front/center/back), fairways, bunkers, water, trees, bearing, elevation
  crosscheck jsonb not null default '{}',  -- club scorecard par/hcp/yards vs OSM length, inferred tee colours, flags
  coverage jsonb not null default '{}',
  primary key (course_map_id, hole)
);

-- v34 (t176u/t177u/t179u): "Preparar ronda". A plan is private to its owner (never shared, never shown to groups/profesor/clubs).
create table if not exists round_plan (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references "user"(id) on delete cascade,
  club_code text not null,                  -- course_map.club_code (118 = Jockey)
  course text not null,                     -- course_map.course (Azul, Colorada)
  date date not null,                       -- local date (Argentina)
  tee_time text not null check (tee_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  start_hole int not null default 1 check (start_hole in (1, 10)),
  min_per_hole real not null check (min_per_hole between 6 and 25),
  pace_source text not null default 'estimado',   -- propio (own live rounds) | estimado | manual
  tee_time_id uuid references tee_time(id) on delete set null,   -- prefilled from the player's own booking (private)
  dist_source text not null default 'libreto' check (dist_source in ('libreto', 'gps')),
  holes jsonb not null default '{}',        -- {"7": {"shots": [{club, source, to:[lng,lat], adjusted}]}}
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists round_plan_user on round_plan (user_id, date desc);
-- Hourly wind (speed, direction, gusts) per rounded location + local date. forecast = Open-Meteo forecast (≤16 days ahead);
-- observed = what the wind was on a past day (archive, or the forecast API's recent past) to normalise measured shots.
create table if not exists weather_hourly (
  key text primary key,                     -- "lat,lng|YYYY-MM-DD|forecast|observed" (2 dp)
  lat double precision not null, lng double precision not null, date date not null,
  kind text not null check (kind in ('forecast', 'observed')),
  hourly jsonb,                             -- {time[], wind_speed_10m[], wind_direction_10m[], wind_gusts_10m[]} (km/h, degrees from)
  status text not null default 'ok' check (status in ('ok', 'unavailable')),
  source text not null,                     -- open-meteo-forecast | open-meteo-archive
  fetched_at timestamptz not null default now()
);

-- v35 (t181u): green elevation grids from REAL surveys (drone LiDAR/photogrammetry/GNSS). Format golflet.green-surface/v1 (API_v5 §60). Synthetic QA surfaces are rejected.
create table if not exists green_surface (
  club_code text not null,
  course text not null,
  hole int not null,
  surface jsonb not null,                  -- golflet.green-surface/v1 (crs, origin, cell_m, cols, rows, z, vertical_datum, accuracy, source)
  stats jsonb not null default '{}',       -- slope median/p90/max %
  survey_date date not null,
  provider text not null,
  imported_at timestamptz not null default now(),
  primary key (club_code, course, hole),
  constraint green_surface_real check (coalesce((surface->>'synthetic')::boolean, false) = false)
);

-- v36 (t183u): Modo torneo (Rules of Golf 4.3) on the live GPS round. tournament_mode null = automático (club booking with a torneo / is_competition card).
alter table live_round add column if not exists tournament_mode boolean;
alter table live_round add column if not exists no_distance_rule boolean not null default false;

-- v37 (t202u): pencil shot log (libreta) and confirmed GPS auto-detected shots. Private to the owner; only player-CONFIRMED holes are stored.
-- No score here (the score comes from the club card import). Photos are read on the phone and never uploaded.
create table if not exists shot_log (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references "user"(id) on delete cascade,
  club_code text not null,
  course text not null,
  date date not null,
  plan_id uuid references round_plan(id) on delete set null,
  hole int not null check (hole between 1 and 18),
  source text not null default 'libreta' check (source in ('libreta', 'gps')),
  data jsonb not null,                      -- lib/shotlog-core LogHole: clubs, fairway, gir, bunker, penalty, putts, first_putt, marks[{n,x,y,yd_est}] (estimates), read
  confirmed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, club_code, course, date, hole, source)
);
create index if not exists shot_log_user on shot_log (user_id, date desc);

-- v38 (t204u/t206u): GPS auto-detected shots and wearables feed the same shot_log (only confirmed holes; positions + lie in data.marks).
alter table shot_log drop constraint if exists shot_log_source_check;
alter table shot_log add constraint shot_log_source_check check (source in ('libreta', 'gps', 'watch', 'garmin'));

-- v39 (t244u): «Marcar bandera» in Jugar práctica. The player's own pin positions per course, hole and date (GPS or tapped on the map).
-- Private to the player; never sent to the club or anyone else. Deleting = deleted_at (soft), so a mistake can be undone.
create table if not exists flag_pin (
  user_id text not null references "user"(id) on delete cascade,
  club_code text not null,
  course text not null,
  hole int not null check (hole between 1 and 27),
  date date not null,                       -- local date (Argentina)
  lng double precision not null check (lng between -180 and 180),
  lat double precision not null check (lat between -90 and 90),
  acc_m real,                               -- GPS accuracy when marked (null when tapped on the map)
  source text not null check (source in ('gps', 'mapa')),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, club_code, course, hole, date)
);
create index if not exists flag_pin_user_course on flag_pin (user_id, club_code, course, date desc);

-- v40 (t260u/t261u): golf_match — the player's own friendly matches (fourball, mano a mano, metralleta). Private per account; nothing goes to the club.
create table if not exists golf_match (
  id text primary key,                       -- client-made uuid (offline queue)
  user_id text not null references "user"(id) on delete cascade,
  date date not null,                        -- local date (Argentina)
  course_label text,
  tee_time_id text,
  modality text not null check (modality in ('fourball', 'single', 'metralleta')),
  scoring text not null check (scoring in ('hcp', 'gross')),
  allowance real not null,
  def jsonb not null,                        -- players (id, name, hcp), sides, stroke index, start hole
  scores jsonb not null default '{}'::jsonb, -- gross per player per hole (0 = levantó)
  result jsonb,                              -- server-side evaluation (strokes, status, pairs, table)
  status text not null default 'open' check (status in ('open', 'done', 'abandoned')),
  finished_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists golf_match_user on golf_match (user_id, date desc);

-- v41: replay the same group-create request. Names are not unique: a new key is a new group even when the name matches.
create table if not exists cmp_create_key (
  user_id text not null,
  idem_key text not null,
  group_id uuid not null references cmp_group(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, idem_key)
);
