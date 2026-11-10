-- Snapshot of Breiðablik's 24 Oct 2026 match rows before Catapult reprocesses the session with the new Free Running
-- band edges (test session agreed with Catapult support, Nov 2026). After the reprocess and a one-day re-sync we
-- compare every column (GPS, accel/decel, IMA, Free Running) against this copy, because a reprocess applies ALL the
-- org's current bands (velocity and acceleration too), not only Free Running.
--
-- Lives in schema `archive`, which PostgREST does not expose; no grants to anon/authenticated. Drop the table once
-- the comparison is done.

create schema if not exists archive;
revoke all on schema archive from public, anon, authenticated;

create table if not exists archive.pled_20261024_before_reprocess as
select d.*
from public.player_external_load_daily d
join public.players p on p.id = d.player_id
where d.date = date '2026-10-24'
  and d.source = 'catapult'
  and p.team_id = '94b52a06-0b83-48da-8664-639ec3486a0c';

revoke all on archive.pled_20261024_before_reprocess from public, anon, authenticated;
comment on table archive.pled_20261024_before_reprocess is
  'Breiðablik 24 Oct 2026 Catapult rows before the Free Running reprocess test. Compare after re-sync, then drop.';
