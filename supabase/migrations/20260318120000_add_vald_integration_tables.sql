create extension if not exists pgcrypto;

do $$
begin
  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where p.proname = 'set_updated_at_timestamp' and n.nspname = 'public'
  ) then
    execute $fn$
      create function public.set_updated_at_timestamp()
      returns trigger
      language plpgsql
      as $inner$
      begin
        new.updated_at = now();
        return new;
      end;
      $inner$;
    $fn$;
  end if;
end
$$;

create table if not exists public.integrations_vald_accounts (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  org_id text null,
  provider text not null default 'vald',
  connection_name text not null default 'VALD',
  base_url text null,
  auth_mode text not null,
  encrypted_client_id text null,
  encrypted_client_secret text null,
  encrypted_api_key text null,
  encrypted_access_token text null,
  encrypted_refresh_token text null,
  token_expires_at timestamptz null,
  last_successful_test_at timestamptz null,
  last_successful_sync_at timestamptz null,
  is_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.integrations_vald_athlete_map (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  microplayer_id uuid not null references public.players(id) on delete cascade,
  vald_athlete_id text not null,
  vald_athlete_name text null,
  vald_external_ref text null,
  vald_email text null,
  match_source text not null,
  confidence numeric(5,2) null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(team_id, microplayer_id, vald_athlete_id)
);

create table if not exists public.vald_sync_runs (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  account_id uuid not null references public.integrations_vald_accounts(id) on delete cascade,
  sync_type text not null,
  status text not null,
  started_at timestamptz not null default now(),
  completed_at timestamptz null,
  requested_by text null,
  date_from date null,
  date_to date null,
  summary jsonb not null default '{}'::jsonb,
  error_message text null,
  created_at timestamptz not null default now()
);

create table if not exists public.vald_raw_tests (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  account_id uuid not null references public.integrations_vald_accounts(id) on delete cascade,
  sync_run_id uuid null references public.vald_sync_runs(id) on delete set null,
  vald_test_id text not null,
  vald_athlete_id text not null,
  product text not null,
  test_type text null,
  test_timestamp timestamptz not null,
  source_updated_at timestamptz null,
  payload jsonb not null,
  payload_hash text not null,
  ingestion_key text not null,
  created_at timestamptz not null default now(),
  unique(team_id, ingestion_key)
);

create table if not exists public.vald_forcedecks_results (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  microplayer_id uuid null references public.players(id) on delete set null,
  vald_athlete_id text not null,
  raw_test_id uuid not null references public.vald_raw_tests(id) on delete cascade,
  test_timestamp timestamptz not null,
  test_type text null,
  jump_height_cm numeric null,
  rsi_mod numeric null,
  eccentric_duration_ms numeric null,
  concentric_duration_ms numeric null,
  peak_power_w numeric null,
  relative_peak_power_w_kg numeric null,
  peak_force_n numeric null,
  concentric_impulse_n_s numeric null,
  time_to_takeoff_ms numeric null,
  left_value numeric null,
  right_value numeric null,
  asymmetry_percent numeric null,
  asymmetry_side text null,
  is_valid boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.vald_nordbord_results (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  microplayer_id uuid null references public.players(id) on delete set null,
  vald_athlete_id text not null,
  raw_test_id uuid not null references public.vald_raw_tests(id) on delete cascade,
  test_timestamp timestamptz not null,
  test_type text null,
  left_peak_force_n numeric null,
  right_peak_force_n numeric null,
  left_avg_force_n numeric null,
  right_avg_force_n numeric null,
  asymmetry_percent numeric null,
  asymmetry_side text null,
  is_valid boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.vald_forceframe_results (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  microplayer_id uuid null references public.players(id) on delete set null,
  vald_athlete_id text not null,
  raw_test_id uuid not null references public.vald_raw_tests(id) on delete cascade,
  test_timestamp timestamptz not null,
  test_type text null,
  body_region text null,
  movement_pattern text null,
  left_peak_force_n numeric null,
  right_peak_force_n numeric null,
  left_relative_force numeric null,
  right_relative_force numeric null,
  asymmetry_percent numeric null,
  asymmetry_side text null,
  is_valid boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.vald_daily_player_snapshot (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  microplayer_id uuid not null references public.players(id) on delete cascade,
  snapshot_date date not null,
  latest_cmj_at timestamptz null,
  latest_nordbord_at timestamptz null,
  latest_forceframe_at timestamptz null,
  cmj_freshness_status text null,
  nordbord_freshness_status text null,
  forceframe_freshness_status text null,
  cmj_score numeric null,
  nordbord_score numeric null,
  forceframe_score numeric null,
  neuromuscular_flag text null,
  hamstring_flag text null,
  groin_flag text null,
  overall_vald_status text null,
  explanation jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(team_id, microplayer_id, snapshot_date)
);

create index if not exists vald_raw_tests_team_athlete_time_idx
  on public.vald_raw_tests(team_id, vald_athlete_id, test_timestamp desc);

create index if not exists vald_forcedecks_results_team_player_time_idx
  on public.vald_forcedecks_results(team_id, microplayer_id, test_timestamp desc);

create index if not exists vald_nordbord_results_team_player_time_idx
  on public.vald_nordbord_results(team_id, microplayer_id, test_timestamp desc);

create index if not exists vald_forceframe_results_team_player_time_idx
  on public.vald_forceframe_results(team_id, microplayer_id, test_timestamp desc);

create index if not exists vald_daily_player_snapshot_team_date_idx
  on public.vald_daily_player_snapshot(team_id, snapshot_date);

create index if not exists integrations_vald_athlete_map_team_player_idx
  on public.integrations_vald_athlete_map(team_id, microplayer_id);

create index if not exists integrations_vald_athlete_map_team_vald_idx
  on public.integrations_vald_athlete_map(team_id, vald_athlete_id);

drop trigger if exists trg_integrations_vald_accounts_set_updated_at on public.integrations_vald_accounts;
create trigger trg_integrations_vald_accounts_set_updated_at
before update on public.integrations_vald_accounts
for each row
execute procedure public.set_updated_at_timestamp();

drop trigger if exists trg_integrations_vald_athlete_map_set_updated_at on public.integrations_vald_athlete_map;
create trigger trg_integrations_vald_athlete_map_set_updated_at
before update on public.integrations_vald_athlete_map
for each row
execute procedure public.set_updated_at_timestamp();

drop trigger if exists trg_vald_daily_player_snapshot_set_updated_at on public.vald_daily_player_snapshot;
create trigger trg_vald_daily_player_snapshot_set_updated_at
before update on public.vald_daily_player_snapshot
for each row
execute procedure public.set_updated_at_timestamp();

alter table public.integrations_vald_accounts enable row level security;
alter table public.integrations_vald_athlete_map enable row level security;
alter table public.vald_sync_runs enable row level security;
alter table public.vald_raw_tests enable row level security;
alter table public.vald_forcedecks_results enable row level security;
alter table public.vald_nordbord_results enable row level security;
alter table public.vald_forceframe_results enable row level security;
alter table public.vald_daily_player_snapshot enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'vald_daily_player_snapshot' and policyname = 'vald_daily_player_snapshot_player_select_own'
  ) then
    create policy vald_daily_player_snapshot_player_select_own
      on public.vald_daily_player_snapshot
      for select
      using (
        exists (
          select 1 from public.players p
          where p.id = vald_daily_player_snapshot.microplayer_id
            and p.user_id = auth.uid()
        )
        or exists (
          select 1 from public.profiles pr
          where pr.id = auth.uid()
            and pr.player_id = vald_daily_player_snapshot.microplayer_id
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'vald_daily_player_snapshot' and policyname = 'vald_daily_player_snapshot_coach_read_team'
  ) then
    create policy vald_daily_player_snapshot_coach_read_team
      on public.vald_daily_player_snapshot
      for select
      using (
        exists (
          select 1 from public.profiles pr
          where pr.id = auth.uid()
            and lower(coalesce(pr.role, '')) in ('coach', 'admin', 'staff')
            and (
              lower(coalesce(pr.role, '')) = 'admin'
              or pr.team_id = vald_daily_player_snapshot.team_id
            )
        )
      );
  end if;
end
$$;
