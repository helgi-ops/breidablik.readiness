-- ============================================================================
-- Injury Events & Retrospective Signal Correlation
-- ============================================================================
-- Purpose: log injuries when they happen + automatically correlate them against
-- the previous 14 days of MicroPulse signals (wellness flags, decoupling alerts,
-- ACWR spikes, dominant signals). Enables "we predicted X of Y injuries"
-- evidence-of-ROI claims for sales, pilot conversions, investor pitch.
--
-- Components:
--   1. Enums: injury_type, body_side, injury_mechanism, injury_severity
--   2. Table: injury_events
--   3. RLS policies: coach + medical role read/write, player read own
--   4. Function: compute_injury_retrospective_signals(injury_id)
--   5. Trigger: auto-compute retrospective signals on insert/update
-- ============================================================================

-- ─── 1. Enums ──────────────────────────────────────────────────────────
do $$ begin
  if not exists (select 1 from pg_type where typname = 'injury_type') then
    create type injury_type as enum (
      'hamstring',
      'calf',
      'groin',
      'quad',
      'hip',
      'knee_acl',
      'knee_mcl',
      'knee_meniscus',
      'knee_other',
      'ankle_sprain',
      'ankle_other',
      'foot',
      'achilles',
      'lower_back',
      'upper_body',
      'concussion',
      'illness',
      'other'
    );
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'injury_body_side') then
    create type injury_body_side as enum ('left', 'right', 'bilateral', 'na');
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'injury_mechanism') then
    create type injury_mechanism as enum (
      'non_contact_match',
      'non_contact_training',
      'contact_match',
      'contact_training',
      'overuse',
      'recurrence',
      'unknown'
    );
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'injury_severity') then
    -- Following Hägglund et al. UEFA injury study consensus
    create type injury_severity as enum (
      'minimal',     -- 1-3 days
      'mild',        -- 4-7 days
      'moderate',    -- 8-28 days
      'severe'       -- > 28 days
    );
  end if;
end $$;

-- ─── 2. Table ──────────────────────────────────────────────────────────
create table if not exists public.injury_events (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,

  injury_date date not null,
  injury_type injury_type not null,
  body_side injury_body_side not null default 'na',
  mechanism injury_mechanism not null default 'unknown',
  severity injury_severity,

  days_lost integer,
  return_date date,
  is_active boolean not null default true,

  notes text,

  -- Snapshot of MicroPulse signals from the 14 days BEFORE injury_date.
  -- Computed by compute_injury_retrospective_signals() trigger.
  retro_signals jsonb,

  recorded_by uuid references public.profiles(id) on delete set null,
  recorded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists injury_events_player_date_idx
  on public.injury_events (player_id, injury_date desc);

create index if not exists injury_events_team_date_idx
  on public.injury_events (team_id, injury_date desc);

create index if not exists injury_events_active_idx
  on public.injury_events (team_id) where is_active = true;

-- ─── 3. RLS ────────────────────────────────────────────────────────────
alter table public.injury_events enable row level security;

drop policy if exists injury_events_team_read on public.injury_events;
create policy injury_events_team_read on public.injury_events
  for select using (
    -- Coach / staff on the team
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (p.team_id = injury_events.team_id
             or exists (select 1 from public.coach_teams ct
                        where ct.coach_id = auth.uid()
                          and ct.team_id = injury_events.team_id))
    )
    OR
    -- Player can read their own
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.player_id = injury_events.player_id
    )
    OR
    -- Admin
    exists (select 1 from public.profiles p
            where p.id = auth.uid() and coalesce(p.is_admin, false))
  );

drop policy if exists injury_events_team_write on public.injury_events;
create policy injury_events_team_write on public.injury_events
  for insert with check (
    -- Coach / medical staff on the team can log injuries
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and lower(coalesce(p.role, '')) in ('coach', 'medical', 'admin')
        and (p.team_id = injury_events.team_id
             or exists (select 1 from public.coach_teams ct
                        where ct.coach_id = auth.uid()
                          and ct.team_id = injury_events.team_id))
    )
    OR
    exists (select 1 from public.profiles p
            where p.id = auth.uid() and coalesce(p.is_admin, false))
  );

drop policy if exists injury_events_team_update on public.injury_events;
create policy injury_events_team_update on public.injury_events
  for update using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and lower(coalesce(p.role, '')) in ('coach', 'medical', 'admin')
        and (p.team_id = injury_events.team_id
             or exists (select 1 from public.coach_teams ct
                        where ct.coach_id = auth.uid()
                          and ct.team_id = injury_events.team_id))
    )
    OR
    exists (select 1 from public.profiles p
            where p.id = auth.uid() and coalesce(p.is_admin, false))
  );

-- ─── 4. Retrospective signal computation ───────────────────────────────
create or replace function public.compute_injury_retrospective_signals(
  p_injury_id uuid,
  p_window_days integer default 14
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_injury record;
  v_window_start date;
  v_signals jsonb;

  v_yellow_days int := 0;
  v_red_days int := 0;
  v_green_plus_days int := 0;
  v_total_checkin_days int := 0;
  v_dominant_signals text[] := array[]::text[];

  v_decoupling_alerts int := 0;
  v_decoupling_max_z numeric := 0;

  v_acute_load numeric := 0;
  v_chronic_load numeric := 0;
  v_acwr numeric;

  v_extreme_load_days int := 0;

  v_first_warning_days_before int;
  v_pattern_match_score numeric;
begin
  -- Load the injury row
  select * into v_injury from public.injury_events where id = p_injury_id;
  if v_injury is null then return null; end if;

  v_window_start := v_injury.injury_date - p_window_days;

  -- Wellness flag counts in the window
  select
    count(*) filter (where upper(computed_auto_flag) = 'YELLOW'),
    count(*) filter (where upper(computed_auto_flag) = 'RED'),
    count(*) filter (where upper(computed_auto_flag) = 'GREEN_PLUS'),
    count(*),
    array_agg(distinct (training_modifier->'pi'->'dominant_signal'->>'metric'))
      filter (where (training_modifier->'pi'->'dominant_signal'->>'metric') is not null)
  into v_yellow_days, v_red_days, v_green_plus_days, v_total_checkin_days, v_dominant_signals
  from public.readiness_entries
  where player_id = v_injury.player_id
    and entry_date >= v_window_start
    and entry_date < v_injury.injury_date
    and coalesce(is_imputed, false) = false;

  -- First warning day (days before injury)
  select coalesce(extract(day from (v_injury.injury_date - max(entry_date)))::int, p_window_days)
  into v_first_warning_days_before
  from public.readiness_entries
  where player_id = v_injury.player_id
    and entry_date >= v_window_start
    and entry_date < v_injury.injury_date
    and upper(computed_auto_flag) in ('YELLOW', 'RED')
    and coalesce(is_imputed, false) = false;

  -- Decoupling: any days where rpe×duration / km > 1 SD over personal baseline?
  with paired as (
    select rpe.session_date,
           rpe.rpe::numeric as rpe_v,
           coalesce(rpe.duration_minutes, 60)::numeric as dur_min,
           ext.total_distance::numeric as dist_m,
           ((rpe.rpe::numeric * coalesce(rpe.duration_minutes, 60)::numeric)
              / nullif(ext.total_distance::numeric / 1000.0, 0)) as rpe_per_km
    from public.session_rpe_entries rpe
    join public.player_external_load_daily ext
      on ext.player_id = rpe.player_id and ext.date = rpe.session_date
    where rpe.player_id = v_injury.player_id
      and rpe.session_date >= v_window_start
      and rpe.session_date < v_injury.injury_date
      and ext.total_distance is not null and ext.total_distance > 0
  ),
  baseline as (
    select mean, sd
    from public.athlete_metric_baselines
    where player_id = v_injury.player_id
      and metric_key = 'decoupling.rpe_per_km'
      and status in ('active', 'calibrating')
    limit 1
  )
  select
    coalesce(count(*) filter (where (paired.rpe_per_km - b.mean) / nullif(b.sd, 0) >= 1.0), 0),
    coalesce(max((paired.rpe_per_km - b.mean) / nullif(b.sd, 0)), 0)
  into v_decoupling_alerts, v_decoupling_max_z
  from paired
  cross join baseline b;

  -- ACWR (acute 7d / chronic 28d on session_load)
  with session_load_sum as (
    select session_date,
           sum(coalesce(session_load, rpe * coalesce(duration_minutes, 60))) as daily_load
    from public.session_rpe_entries
    where player_id = v_injury.player_id
      and session_date >= v_injury.injury_date - 28
      and session_date < v_injury.injury_date
    group by session_date
  )
  select
    coalesce(avg(daily_load) filter (where session_date >= v_injury.injury_date - 7), 0),
    coalesce(avg(daily_load), 0)
  into v_acute_load, v_chronic_load
  from session_load_sum;

  v_acwr := case
    when v_chronic_load > 0 then round(v_acute_load / v_chronic_load, 2)
    else null
  end;

  -- Extreme load days (any single day with session_load > 1.5 SD over chronic mean)
  select count(*)
  into v_extreme_load_days
  from public.session_rpe_entries
  where player_id = v_injury.player_id
    and session_date >= v_window_start
    and session_date < v_injury.injury_date
    and coalesce(session_load, rpe * coalesce(duration_minutes, 60)) >
        v_chronic_load + (v_chronic_load * 0.5);

  -- Pattern match score: 0..1
  -- Higher = more warning signs preceded the injury
  v_pattern_match_score := least(1.0,
    (least(v_yellow_days, 5) * 0.10) +     -- up to 0.50 from yellow days
    (least(v_red_days, 3) * 0.20) +         -- up to 0.60 from red days
    (least(v_decoupling_alerts, 3) * 0.10) + -- up to 0.30
    (case when v_acwr is not null and v_acwr >= 1.5 then 0.20 else 0 end) +
    (least(v_extreme_load_days, 2) * 0.10)
  );

  v_signals := jsonb_build_object(
    'scan_window_days', p_window_days,
    'computed_at', now(),
    'wellness', jsonb_build_object(
      'check_in_days', v_total_checkin_days,
      'yellow_days', v_yellow_days,
      'red_days', v_red_days,
      'green_plus_days', v_green_plus_days,
      'dominant_signals_seen', to_jsonb(v_dominant_signals)
    ),
    'decoupling', jsonb_build_object(
      'alert_days', v_decoupling_alerts,
      'max_z_score', round(v_decoupling_max_z, 2)
    ),
    'load', jsonb_build_object(
      'acute_avg', round(v_acute_load, 0),
      'chronic_avg', round(v_chronic_load, 0),
      'acwr', v_acwr,
      'extreme_load_days', v_extreme_load_days
    ),
    'pattern_match_score', round(v_pattern_match_score, 2),
    'preceded_by_warning', (v_yellow_days + v_red_days + v_decoupling_alerts) > 0,
    'first_warning_days_before_injury', v_first_warning_days_before
  );

  return v_signals;
end;
$$;

-- ─── 5. Trigger to auto-compute on insert/update ───────────────────────
create or replace function public.trg_compute_injury_retro_signals()
returns trigger
language plpgsql
as $$
begin
  -- Only recompute if injury_date or player_id changed (or on first insert)
  if tg_op = 'INSERT' or
     new.injury_date is distinct from old.injury_date or
     new.player_id is distinct from old.player_id then
    new.retro_signals := public.compute_injury_retrospective_signals(new.id, 14);
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists injury_events_compute_retro on public.injury_events;
-- AFTER trigger because compute function reads from injury_events itself
create trigger injury_events_compute_retro
  after insert on public.injury_events
  for each row
  execute function public.trg_compute_injury_retro_signals_after();

-- We need a slightly different version for AFTER triggers (UPDATE the row)
create or replace function public.trg_compute_injury_retro_signals_after()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_signals jsonb;
begin
  v_signals := public.compute_injury_retrospective_signals(new.id, 14);
  update public.injury_events
    set retro_signals = v_signals,
        updated_at = now()
  where id = new.id;
  return new;
end;
$$;

-- ─── 6. Team-level aggregate view ──────────────────────────────────────
create or replace view public.team_injury_correlation_summary as
select
  team_id,
  count(*) as total_injuries,
  count(*) filter (
    where (retro_signals->>'preceded_by_warning')::boolean = true
  ) as predicted_injuries,
  count(*) filter (
    where (retro_signals->'pattern_match_score')::numeric >= 0.5
  ) as strong_pattern_match,
  round(avg((retro_signals->'pattern_match_score')::numeric)::numeric, 2)
    as avg_pattern_match_score,
  count(*) filter (where injury_type = 'hamstring')   as hamstring_count,
  count(*) filter (where injury_type = 'calf')        as calf_count,
  count(*) filter (where injury_type = 'groin')       as groin_count,
  count(*) filter (where injury_type like 'knee%')    as knee_count,
  count(*) filter (where injury_type like 'ankle%')   as ankle_count,
  -- Window: last 365 days
  min(injury_date) as earliest_injury,
  max(injury_date) as latest_injury
from public.injury_events
where injury_date >= current_date - interval '365 days'
group by team_id;

grant select on public.team_injury_correlation_summary to authenticated;

-- ─── 7. Auto-update updated_at on row update ──────────────────────────
create or replace function public.trg_injury_events_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists injury_events_set_updated_at on public.injury_events;
create trigger injury_events_set_updated_at
  before update on public.injury_events
  for each row
  execute function public.trg_injury_events_set_updated_at();
