create table if not exists public.athlete_integrations (
  id uuid primary key default gen_random_uuid(),
  athlete_id text not null,
  provider text not null check (provider in ('whoop')),
  status text not null default 'pending' check (status in ('pending', 'active', 'error', 'revoked')),
  external_user_id text null,
  access_token text null,
  refresh_token text null,
  token_type text null,
  scopes text[] null,
  access_token_expires_at timestamptz null,
  last_synced_at timestamptz null,
  last_sync_status text null check (last_sync_status in ('success', 'error', 'never')),
  last_sync_error text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (athlete_id, provider)
);

create index if not exists athlete_integrations_athlete_idx on public.athlete_integrations (athlete_id);
create index if not exists athlete_integrations_status_idx on public.athlete_integrations (status);

create table if not exists public.athlete_monitoring_snapshots (
  id uuid primary key default gen_random_uuid(),
  athlete_id text not null,
  source text not null check (source in ('whoop')),
  date date not null,
  recovery_score numeric null,
  hrv numeric null,
  resting_hr numeric null,
  respiratory_rate numeric null,
  sleep_performance numeric null,
  sleep_consistency numeric null,
  sleep_efficiency numeric null,
  total_sleep_millis bigint null,
  workout_strain numeric null,
  average_hr numeric null,
  max_hr numeric null,
  raw_payload_json jsonb null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (athlete_id, source, date)
);

create index if not exists athlete_monitoring_snapshots_athlete_date_idx on public.athlete_monitoring_snapshots (athlete_id, date desc);
create index if not exists athlete_monitoring_snapshots_source_idx on public.athlete_monitoring_snapshots (source);

