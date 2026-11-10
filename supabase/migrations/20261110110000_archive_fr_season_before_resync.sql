-- Snapshot of Breiðablik's Catapult rows 1 Jun - 24 Oct 2026 before re-syncing the season that Catapult
-- reprocessed with the new IMA Free Running edges (10 Nov 2026). Used to check that only Free Running changes
-- and that long runs (>=18 s / >=24 s) stay the same for the squad. Drop once the comparison is done,
-- together with archive.pled_20261024_before_reprocess.

create schema if not exists archive;
revoke all on schema archive from public, anon, authenticated;

create table archive.pled_jun_oct_before_resync as
select d.*
  from public.player_external_load_daily d
  join public.players p on p.id = d.player_id
 where d.date between date '2026-06-01' and date '2026-10-24'
   and d.source = 'catapult'
   and p.team_id = '94b52a06-0b83-48da-8664-639ec3486a0c';

revoke all on archive.pled_jun_oct_before_resync from public, anon, authenticated;

comment on table archive.pled_jun_oct_before_resync is
  'Breiðablik Catapult rows 2026-06-01..2026-10-24 before the Free Running reprocess re-sync (10 Nov 2026). Compare, then drop.';

-- Also rows of players who have since left (row team_id is Breiðablik, player's current team is not).
insert into archive.pled_jun_oct_before_resync
select d.*
  from public.player_external_load_daily d
 where d.date between date '2026-06-01' and date '2026-10-24'
   and d.source = 'catapult'
   and d.team_id = '94b52a06-0b83-48da-8664-639ec3486a0c'
   and not exists (select 1 from archive.pled_jun_oct_before_resync a
                    where a.player_id = d.player_id and a.date = d.date and a.source = d.source);
