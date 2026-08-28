-- Allow 'wimu' (Hudl WIMU PRO — CSV upload provider) as a team GPS provider.
-- WIMU is upload-based (no auto-sync API); its data lands in
-- player_external_load_daily with source='wimu' via /api/integrations/wimu/upload.
alter table teams drop constraint if exists teams_gps_provider_check;
alter table teams add constraint teams_gps_provider_check
  check (gps_provider = any (array['catapult'::text, 'statsport'::text, 'wimu'::text, 'none'::text]));
