-- Clean impossible max-velocity GPS spikes from stored external load.
--
-- The fastest human ever recorded peaks around 37 km/h over a segment, and
-- football GPS top-speeds credibly top out in the mid-30s. Values above 38 km/h
-- are a lost satellite lock or a unit glitch, not a sprint — observed on this
-- team from 38.1 up to an absurd 6,650,235 km/h, in 23 daily rows (incl. a
-- session-wide cluster of 54–60 km/h on 2026-07-08 and ~110 km/h on 2026-04-18).
--
-- Ingestion now clamps these at source via clampMaxVelocityKmh
-- (src/lib/integrations/catapult/normalize.ts, ceiling MAX_PLAUSIBLE_VELOCITY_KMH
-- = 38), so no new spike enters a top-speed PB or a per-90 profile. This nulls
-- the spikes already stored. Idempotent: re-running changes nothing once clean.

update public.player_external_load_daily
set max_velocity = case when max_velocity > 38 then null else max_velocity end,
    max_vel      = case when max_vel      > 38 then null else max_vel      end
where max_velocity > 38 or max_vel > 38;
