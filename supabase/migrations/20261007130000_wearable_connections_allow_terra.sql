-- Allow 'terra' as a wearable_connections.provider.
--
-- The wearable_connections / wearable_sleep_data / wearable_daily_data tables
-- (and their RLS + unique constraints) were provisioned out-of-band (no repo
-- migration). Per the Terra brief we ALIGN rather than duplicate: the only gap is
-- that `wearable_connections_provider_check` predates Terra and rejects
-- provider='terra', which would block the Terra `auth` webhook from creating a
-- connection row. Widen the check to include 'terra'.

alter table public.wearable_connections
  drop constraint if exists wearable_connections_provider_check;

alter table public.wearable_connections
  add constraint wearable_connections_provider_check
  check (provider = any (array['polar','vital','apple_health','garmin','whoop','oura','terra']));
