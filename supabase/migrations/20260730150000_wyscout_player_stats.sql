-- Wyscout / football player statistics — source-agnostic ingestion layer.
--
-- Two interchangeable adapters (Excel/CSV import, Wyscout Data API) write to ONE
-- normalized model with a `source` provenance tag, so everything downstream is
-- identical regardless of source. Wyscout column names are NOT baked into the
-- schema: a stable core set is normalized in the adapter, and the long tail of
-- Wyscout's 150+ metrics lands in `metrics jsonb` so nothing is lost.
--
-- This is DESCRIPTIVE football data — never a readiness signal. It must not
-- touch v_coach_readiness_today_v8.final_color or the daily decision.
--
-- Idempotency note: the natural key is (team_id, match_date, source,
-- source_player_ref), NOT (…, player_id, …) as an early draft suggested —
-- player_id is NULL until a name is mapped, and NULLs are distinct in a unique
-- constraint, so a player_id-based key can't dedupe unmapped rows. source_player_ref
-- (Wyscout player id, else the normalized raw name) is the stable per-source
-- identity; player_id is the resolved link, filled/updated once mapped.

-- ── player_match_stats: one row per player per match ─────────────────────────
create table if not exists public.player_match_stats (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  player_id uuid null references public.players(id) on delete set null, -- null until mapped
  match_date date not null,
  opponent text null,
  home_away text null check (home_away in ('home', 'away')),

  -- stable core (nullable — a source may not carry every metric)
  minutes numeric null,
  goals numeric null,
  assists numeric null,
  shots numeric null,
  shots_on_target numeric null,
  passes numeric null,
  pass_accuracy_pct numeric null,
  key_passes numeric null,
  duels_won numeric null,
  xg numeric null,
  rating numeric null,

  -- long tail of Wyscout's 150+ metrics — nothing lost
  metrics jsonb not null default '{}'::jsonb,

  -- provenance (manifesto #1)
  source text not null check (source in ('wyscout_excel', 'wyscout_api', 'manual')),
  source_ref text null,                 -- Wyscout match id or uploaded file name
  source_player_ref text not null,      -- stable per-source player identity (id, else normalized name)
  wyscout_player_name text null,        -- raw display name from the source (audit / mapping)
  synced_at timestamptz not null default now(),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (team_id, match_date, source, source_player_ref)
);

create index if not exists player_match_stats_team_date_idx   on public.player_match_stats (team_id, match_date desc);
create index if not exists player_match_stats_player_date_idx on public.player_match_stats (player_id, match_date desc);
create index if not exists player_match_stats_unmapped_idx    on public.player_match_stats (team_id) where player_id is null;

-- ── player_season_stats: one row per player per season (aggregates) ──────────
create table if not exists public.player_season_stats (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  player_id uuid null references public.players(id) on delete set null,
  season text not null,                 -- e.g. '2026'
  competition text null,

  minutes numeric null,
  goals numeric null,
  assists numeric null,
  shots numeric null,
  shots_on_target numeric null,
  passes numeric null,
  pass_accuracy_pct numeric null,
  key_passes numeric null,
  duels_won numeric null,
  xg numeric null,
  rating numeric null,
  metrics jsonb not null default '{}'::jsonb,

  source text not null check (source in ('wyscout_excel', 'wyscout_api', 'manual')),
  source_ref text null,
  source_player_ref text not null,
  wyscout_player_name text null,
  synced_at timestamptz not null default now(),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (team_id, season, source, source_player_ref)
);

create index if not exists player_season_stats_team_idx   on public.player_season_stats (team_id, season);
create index if not exists player_season_stats_player_idx on public.player_season_stats (player_id, season);

-- ── stat_ingestion_config: per-team source selection (no secrets here) ───────
create table if not exists public.stat_ingestion_config (
  team_id uuid primary key references public.teams(id) on delete cascade,
  source text not null default 'excel' check (source in ('excel', 'wyscout_api')),
  wyscout_team_id text null,            -- for Adapter B; the API key is a Supabase secret
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── stat_player_mapping: remembered wyscout name → player_id resolution ──────
create table if not exists public.stat_player_mapping (
  team_id uuid not null references public.teams(id) on delete cascade,
  source_player_ref text not null,      -- normalized wyscout name or wyscout id
  wyscout_player_name text null,        -- raw display for the review UI
  player_id uuid null references public.players(id) on delete cascade,
  confidence text null check (confidence in ('exact', 'fuzzy', 'manual')),
  confirmed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (team_id, source_player_ref)
);

create index if not exists stat_player_mapping_player_idx on public.stat_player_mapping (player_id);

-- ── team_matches: make it the single results source ─────────────────────────
alter table public.team_matches add column if not exists home_away     text;
alter table public.team_matches add column if not exists goals_for     integer;
alter table public.team_matches add column if not exists goals_against integer;
alter table public.team_matches add column if not exists result        text;  -- 'W' | 'D' | 'L'

-- ── updated_at triggers (set_updated_at_timestamp already exists) ────────────
drop trigger if exists trg_player_match_stats_set_updated_at on public.player_match_stats;
create trigger trg_player_match_stats_set_updated_at
  before update on public.player_match_stats
  for each row execute procedure public.set_updated_at_timestamp();

drop trigger if exists trg_player_season_stats_set_updated_at on public.player_season_stats;
create trigger trg_player_season_stats_set_updated_at
  before update on public.player_season_stats
  for each row execute procedure public.set_updated_at_timestamp();

drop trigger if exists trg_stat_ingestion_config_set_updated_at on public.stat_ingestion_config;
create trigger trg_stat_ingestion_config_set_updated_at
  before update on public.stat_ingestion_config
  for each row execute procedure public.set_updated_at_timestamp();

drop trigger if exists trg_stat_player_mapping_set_updated_at on public.stat_player_mapping;
create trigger trg_stat_player_mapping_set_updated_at
  before update on public.stat_player_mapping
  for each row execute procedure public.set_updated_at_timestamp();

-- ── RLS: coach/admin/staff read their team; writes are service-role only ─────
-- (mirrors player_drill_load — the API routes / edge function use the admin
--  client which bypasses RLS, so no client INSERT/UPDATE policy.)
alter table public.player_match_stats  enable row level security;
alter table public.player_season_stats enable row level security;
alter table public.stat_ingestion_config enable row level security;
alter table public.stat_player_mapping enable row level security;

do $$
declare t text;
begin
  foreach t in array array['player_match_stats','player_season_stats','stat_ingestion_config','stat_player_mapping']
  loop
    execute format('drop policy if exists %I_coach_read_team on public.%I', t, t);
    execute format($f$
      create policy %I_coach_read_team on public.%I
        for select using (
          exists (
            select 1 from public.profiles pr
            where pr.id = auth.uid()
              and lower(coalesce(pr.role, '')) = any (array['coach','admin','staff'])
              and (
                lower(coalesce(pr.role, '')) = 'admin'
                or pr.team_id = %I.team_id
                or %I.team_id in (select ct.team_id from public.coach_teams ct where ct.coach_id = auth.uid())
              )
          )
        )
    $f$, t, t, t, t);
  end loop;
end $$;

-- Player can read their own mapped match/season stats (mirror player_drill_load).
drop policy if exists player_match_stats_player_select_own on public.player_match_stats;
create policy player_match_stats_player_select_own on public.player_match_stats
  for select using (
    player_id is not null and (
      exists (select 1 from public.players p  where p.id = player_match_stats.player_id and p.user_id = auth.uid())
      or exists (select 1 from public.profiles pr where pr.id = auth.uid() and pr.player_id = player_match_stats.player_id)
    )
  );

drop policy if exists player_season_stats_player_select_own on public.player_season_stats;
create policy player_season_stats_player_select_own on public.player_season_stats
  for select using (
    player_id is not null and (
      exists (select 1 from public.players p  where p.id = player_season_stats.player_id and p.user_id = auth.uid())
      or exists (select 1 from public.profiles pr where pr.id = auth.uid() and pr.player_id = player_season_stats.player_id)
    )
  );
