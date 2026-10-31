-- Demo – Kinexon (de300004) was stuck at plan_tier=FREE while its three sibling
-- demo teams (Full, GPS Pro, GPS Core) are ELITE, so the External/IMA tab showed
-- the "requires Pro" wall instead of its data. Bring it in line, and declare its
-- GPS provider as 'kinexon' so the coach External tab renders the indoor-LPS
-- (Kinexon) variant — full captured variable set, accel/decel from counts, no
-- Catapult IMA — rather than the generic Catapult basketball shape.
--
-- Demo seed only; no readiness colour is touched.

-- 'kinexon' is a real, supported provider (full ingestion pipeline exists) but
-- predates this check constraint, so widen it before setting the value.
alter table teams drop constraint if exists teams_gps_provider_check;
alter table teams add constraint teams_gps_provider_check
  check (gps_provider = any (array['catapult','statsport','wimu','titan','kinexon','none']));

update teams
set plan_tier    = 'ELITE',
    gps_provider = 'kinexon'
where id = 'de300004-0000-4000-8000-000000000004';
