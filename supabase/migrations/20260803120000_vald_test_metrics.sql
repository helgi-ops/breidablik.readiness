-- Flexible long-format home for the full VALD ForceDecks result set of the RTP
-- battery (IMTP, Drop Jump, Single-Leg Drop Jump, Single-Leg Iso Squat, etc.).
-- One row per (test, trial, metric code, limb). Matches VALD's own
-- results[].definition.result + limb shape, so any code VALD sends is captured
-- without a wide per-test-type migration. CMJ keeps its dedicated typed table.
create table if not exists public.vald_test_metrics (
  id uuid primary key default gen_random_uuid(),
  raw_test_id uuid not null,
  microplayer_id uuid,
  team_id uuid,
  vald_athlete_id text,
  test_type text not null,
  test_timestamp timestamptz,
  trial_number int not null default 0,
  metric_code text not null,      -- e.g. PEAK_VERTICAL_FORCE, ISO_BM_REL_FORCE_PEAK, RSI
  limb text not null default 'Trial', -- Trial | Both | Left | Right | Asym
  value double precision,
  unit text,
  source text not null default 'api',
  created_at timestamptz not null default now(),
  unique (raw_test_id, trial_number, metric_code, limb)
);

create index if not exists idx_vald_test_metrics_player_type
  on public.vald_test_metrics (microplayer_id, test_type, test_timestamp desc);
create index if not exists idx_vald_test_metrics_raw
  on public.vald_test_metrics (raw_test_id);

alter table public.vald_test_metrics enable row level security;

drop policy if exists vald_test_metrics_service_all on public.vald_test_metrics;
create policy vald_test_metrics_service_all on public.vald_test_metrics
  for all to service_role using (true) with check (true);
