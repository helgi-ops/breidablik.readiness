alter table if exists public.athlete_integrations
  add column if not exists external_email text null,
  add column if not exists external_first_name text null,
  add column if not exists external_last_name text null;

