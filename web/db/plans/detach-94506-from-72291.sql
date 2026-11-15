-- DO NOT RUN without explicit approval.
-- Prepared 2026-11-15 from a read-only inspection. Nothing in this file has been executed.
--
-- What happened: user GUgWXlG9OT9MPHGUyhSLwEgMGXRCB6Of signed in as matrícula 72291
-- (Rodrigo Villanueva, San Isidro). A later POST /api/accounts on that same session
-- linked matrícula 94506 and copied Sebastián Buffo's Jockey and Mar del Plata cards
-- onto Rodrigo's user. The original rows stay on user 7LVPaaDXuT2wz79g9rNY3jayrSHpM51i.
-- Sessions were separate. Rodrigo's own San Isidro account 04b6383a-c46b-4ae9-b58b-dcf2e3c49834
-- must be kept.
--
-- A second user, LYjhw1gHvNBuPkHHHQ5fCmLPJB8VILuM (matrícula 78942), has the same kind of
-- 94506 copy. That block is included below and is also not to be run until approved.
--
-- Dry-run selects are safe. The backup and delete statements are commented out.
-- Do not SELECT password_enc. The backup, if approved, copies whole rows on the server
-- and must not be printed back to a client.

-- ---------------------------------------------------------------------------
-- 1. Dry run. Rows that are 94506 data sitting on the 72291 user.
-- ---------------------------------------------------------------------------
select a.id as club_account_id, a.user_id, a.matricula, a.club_id, a.source, a.player_name, a.created_at
from club_account a
where a.id in (
  'b92800ff-8770-400e-8659-79c3adc37a02', -- Jockey, matrícula 94506, on the 72291 user
  '061f4b82-068d-4de7-9b08-c9880dd7df9b'  -- Mar del Plata, matrícula 94506, on the 72291 user
);

select 'round' as kind, club_account_id, count(*) as n from round
where club_account_id in ('b92800ff-8770-400e-8659-79c3adc37a02', '061f4b82-068d-4de7-9b08-c9880dd7df9b')
group by 2
union all
select 'hi_history', club_account_id, count(*) from hi_history
where club_account_id in ('b92800ff-8770-400e-8659-79c3adc37a02', '061f4b82-068d-4de7-9b08-c9880dd7df9b')
group by 2
union all
select 'playing_hcp', club_account_id, count(*) from playing_hcp
where club_account_id in ('b92800ff-8770-400e-8659-79c3adc37a02', '061f4b82-068d-4de7-9b08-c9880dd7df9b')
group by 2
union all
select 'tee_time', club_account_id, count(*) from tee_time
where club_account_id in ('b92800ff-8770-400e-8659-79c3adc37a02', '061f4b82-068d-4de7-9b08-c9880dd7df9b')
group by 2
union all
select 'scorecard_fetch', club_account_id, count(*) from scorecard_fetch
where club_account_id in ('b92800ff-8770-400e-8659-79c3adc37a02', '061f4b82-068d-4de7-9b08-c9880dd7df9b')
group by 2
union all
select 'club_page_status', club_account_id, count(*) from club_page_status
where club_account_id in ('b92800ff-8770-400e-8659-79c3adc37a02', '061f4b82-068d-4de7-9b08-c9880dd7df9b')
group by 2;

-- Confirm every copied round still exists on Sebastián's own accounts before any delete.
-- Expect only_on_copy = 0 for both clubs.
select 'jockey_only_on_copy' as check, count(*) as n
from round copy
where copy.club_account_id = 'b92800ff-8770-400e-8659-79c3adc37a02'
  and not exists (
    select 1 from round own
    where own.club_account_id = '305c2c18-68b7-4329-8bee-e6df188592bb'
      and own.external_id = copy.external_id
  )
union all
select 'mdp_only_on_copy', count(*)
from round copy
where copy.club_account_id = '061f4b82-068d-4de7-9b08-c9880dd7df9b'
  and not exists (
    select 1 from round own
    where own.club_account_id = '5eec8aea-1f1e-4bd7-b85b-baaac208357d'
      and own.external_id = copy.external_id
  );

-- Rows that must stay: Rodrigo's San Isidro account and Sebastián's original accounts.
select id, user_id, matricula, club_id, player_name
from club_account
where id in (
  '04b6383a-c46b-4ae9-b58b-dcf2e3c49834', -- 72291 San Isidro, keep
  '305c2c18-68b7-4329-8bee-e6df188592bb', -- 94506 Jockey on Sebastián, keep
  '5eec8aea-1f1e-4bd7-b85b-baaac208357d'  -- 94506 Mar del Plata on Sebastián, keep
);

-- ---------------------------------------------------------------------------
-- 2. Backup, then delete only the two copied 94506 accounts. COMMENTED OUT.
--    Stop if either only_on_copy check above is not 0.
--    Do not print these backup tables: they include password_enc.
-- ---------------------------------------------------------------------------
-- begin;
-- create table backup_20261115_ca_72291 as
--   select * from club_account where id in ('b92800ff-8770-400e-8659-79c3adc37a02','061f4b82-068d-4de7-9b08-c9880dd7df9b');
-- create table backup_20261115_round_72291 as
--   select * from round where club_account_id in ('b92800ff-8770-400e-8659-79c3adc37a02','061f4b82-068d-4de7-9b08-c9880dd7df9b');
-- create table backup_20261115_hi_72291 as
--   select * from hi_history where club_account_id in ('b92800ff-8770-400e-8659-79c3adc37a02','061f4b82-068d-4de7-9b08-c9880dd7df9b');
-- create table backup_20261115_hcp_72291 as
--   select * from playing_hcp where club_account_id in ('b92800ff-8770-400e-8659-79c3adc37a02','061f4b82-068d-4de7-9b08-c9880dd7df9b');
-- create table backup_20261115_tee_72291 as
--   select * from tee_time where club_account_id in ('b92800ff-8770-400e-8659-79c3adc37a02','061f4b82-068d-4de7-9b08-c9880dd7df9b');
-- create table backup_20261115_fetch_72291 as
--   select * from scorecard_fetch where club_account_id in ('b92800ff-8770-400e-8659-79c3adc37a02','061f4b82-068d-4de7-9b08-c9880dd7df9b');
-- create table backup_20261115_page_72291 as
--   select * from club_page_status where club_account_id in ('b92800ff-8770-400e-8659-79c3adc37a02','061f4b82-068d-4de7-9b08-c9880dd7df9b');
-- delete from scorecard_fetch where club_account_id in ('b92800ff-8770-400e-8659-79c3adc37a02','061f4b82-068d-4de7-9b08-c9880dd7df9b');
-- delete from tee_time where club_account_id in ('b92800ff-8770-400e-8659-79c3adc37a02','061f4b82-068d-4de7-9b08-c9880dd7df9b');
-- delete from playing_hcp where club_account_id in ('b92800ff-8770-400e-8659-79c3adc37a02','061f4b82-068d-4de7-9b08-c9880dd7df9b');
-- delete from hi_history where club_account_id in ('b92800ff-8770-400e-8659-79c3adc37a02','061f4b82-068d-4de7-9b08-c9880dd7df9b');
-- delete from hole_compare where club_account_id in ('b92800ff-8770-400e-8659-79c3adc37a02','061f4b82-068d-4de7-9b08-c9880dd7df9b');
-- delete from club_page_status where club_account_id in ('b92800ff-8770-400e-8659-79c3adc37a02','061f4b82-068d-4de7-9b08-c9880dd7df9b');
-- delete from round where club_account_id in ('b92800ff-8770-400e-8659-79c3adc37a02','061f4b82-068d-4de7-9b08-c9880dd7df9b');
-- delete from club_account where id in ('b92800ff-8770-400e-8659-79c3adc37a02','061f4b82-068d-4de7-9b08-c9880dd7df9b');
-- -- commit;  -- only after the dry-run counts match this plan and a human approves

-- ---------------------------------------------------------------------------
-- 3. Optional, same bug on matrícula 78942. Also commented. Do not run with section 2
--    unless that user is approved separately.
--    Accounts: fcbf3fa5-85db-4de5-a5d5-2ae1677e19cf (Jockey) and
--    69c67aba-a139-4455-a469-c6f12adc9fa7 (Mar del Plata), both matrícula 94506.
--    Repeat the same backup-then-delete shape for those two ids only.
-- ---------------------------------------------------------------------------
select a.id as club_account_id, a.user_id, a.matricula, a.club_id, a.player_name, a.created_at
from club_account a
where a.id in ('fcbf3fa5-85db-4de5-a5d5-2ae1677e19cf', '69c67aba-a139-4455-a469-c6f12adc9fa7');
