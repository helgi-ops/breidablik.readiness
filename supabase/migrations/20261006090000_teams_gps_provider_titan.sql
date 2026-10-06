-- Allow 'titan' (Integrated Bionics / Hudl Titan — indoor IMU, CSV upload provider) as a team
-- load provider. Titan is indoor IMU-only (no GPS): Player Load + Impacts + Jumps + durations.
-- Its data lands in player_external_load_daily with source='titan' via /api/integrations/titan/upload,
-- read source-agnostically by the readiness/load engine (ACWR on player_load) exactly like Catapult.
alter table teams drop constraint if exists teams_gps_provider_check;
alter table teams add constraint teams_gps_provider_check
  check (gps_provider = any (array['catapult'::text, 'statsport'::text, 'wimu'::text, 'titan'::text, 'none'::text]));
