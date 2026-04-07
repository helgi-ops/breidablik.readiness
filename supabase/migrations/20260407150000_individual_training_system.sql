-- ============================================================
-- Individual Training System: Strength & Endurance
-- ============================================================
-- Adds exercise library, individual training plans with
-- readiness-driven auto-regulation, and completion logging.
--
-- Integrates with existing:
--   readiness_entries  (wellness → readiness score)
--   player_load_metrics (ACWR → load context)
--   session_rpe_entries (← new entries fed back from log)
-- ============================================================

-- ────────────────────────────────────────────────────────
-- 0. TEAM TYPE — distinguish club teams from personal trainers
-- ────────────────────────────────────────────────────────

alter table public.teams
  add column if not exists team_type text not null default 'club_team'
  check (team_type in ('club_team','personal_trainer'));

create index if not exists idx_teams_type on public.teams(team_type);

comment on column public.teams.team_type is
  'club_team = traditional team (football, basketball), personal_trainer = individual trainer client roster';

-- ────────────────────────────────────────────────────────
-- 1. EXERCISE LIBRARY — catalogue of strength & endurance exercises
-- ────────────────────────────────────────────────────────

create table if not exists public.exercise_library (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  name_is         text,                                      -- Icelandic name
  exercise_type   text not null check (exercise_type in ('strength','endurance')),
  category        text not null check (category in (
                    -- Strength categories
                    'compound','isolation','plyometric','olympic_lift','core',
                    -- Endurance categories
                    'continuous','interval','tempo','threshold','sprint'
                  )),
  muscle_groups   text[] default '{}',                       -- e.g. {'quadriceps','glutes','hamstrings'}
  equipment       text,                                      -- e.g. 'barbell', 'bodyweight', 'bike'
  description     text,
  video_url       text,
  sport           text not null default 'football',          -- sport context
  is_bilateral    boolean default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_exercise_library_type on public.exercise_library(exercise_type);
create index if not exists idx_exercise_library_sport on public.exercise_library(sport);

comment on table public.exercise_library is
  'Catalogue of strength and endurance exercises available for individual training plans.';

-- ────────────────────────────────────────────────────────
-- 2. INDIVIDUAL TRAINING PLANS — assigned to a player
-- ────────────────────────────────────────────────────────

create table if not exists public.individual_training_plans (
  id              uuid primary key default gen_random_uuid(),
  player_id       uuid not null references public.players(id),
  team_id         uuid not null references public.teams(id),
  created_by      uuid not null references auth.users(id),   -- coach who created it
  plan_name       text not null,
  plan_type       text not null check (plan_type in ('strength','endurance','mixed')),
  start_date      date not null,
  end_date        date,
  status          text not null default 'active' check (status in ('draft','active','paused','completed','archived')),
  -- Readiness auto-regulation settings
  readiness_enabled       boolean not null default true,
  readiness_red_action    text not null default 'recovery'
    check (readiness_red_action in ('skip','recovery','deload')),
  readiness_yellow_action text not null default 'deload'
    check (readiness_yellow_action in ('normal','deload')),
  -- Deload = percentage reduction applied to volume or intensity
  deload_volume_pct       integer not null default 70,       -- e.g. 70 = do 70% of prescribed volume
  deload_intensity_pct    integer not null default 85,       -- e.g. 85 = do 85% of prescribed load
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_itp_player on public.individual_training_plans(player_id);
create index if not exists idx_itp_team on public.individual_training_plans(team_id);
create index if not exists idx_itp_status on public.individual_training_plans(status);

comment on table public.individual_training_plans is
  'A training plan (strength/endurance/mixed) assigned to a specific player by a coach.';

-- ────────────────────────────────────────────────────────
-- 3. PLAN SESSIONS — scheduled sessions within a plan
-- ────────────────────────────────────────────────────────

create table if not exists public.individual_training_sessions (
  id              uuid primary key default gen_random_uuid(),
  plan_id         uuid not null references public.individual_training_plans(id) on delete cascade,
  week_number     integer not null default 1,                -- week within the plan
  day_of_week     integer not null check (day_of_week between 1 and 7), -- 1=Mon, 7=Sun
  session_name    text not null,                             -- e.g. 'Upper Body A', 'Interval Run'
  session_type    text not null check (session_type in ('strength','endurance','recovery','mixed')),
  estimated_duration_min integer,
  sort_order      integer not null default 0,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_its_plan on public.individual_training_sessions(plan_id);

comment on table public.individual_training_sessions is
  'A scheduled session within a training plan, e.g. "Monday Upper Body" in week 1.';

-- ────────────────────────────────────────────────────────
-- 4. SESSION PRESCRIPTIONS — exercises prescribed in a session
-- ────────────────────────────────────────────────────────

create table if not exists public.individual_training_prescriptions (
  id              uuid primary key default gen_random_uuid(),
  session_id      uuid not null references public.individual_training_sessions(id) on delete cascade,
  exercise_id     uuid not null references public.exercise_library(id),
  sort_order      integer not null default 0,
  -- Strength parameters
  sets            integer,                                   -- prescribed sets
  reps            text,                                      -- e.g. '8', '8-12', 'AMRAP'
  load_type       text check (load_type in ('absolute_kg','pct_1rm','rpe_target','bodyweight')),
  load_value      numeric(6,1),                              -- kg or % depending on load_type
  rpe_target      numeric(3,1),                              -- target RPE (Borg CR-10)
  tempo           text,                                      -- e.g. '3-1-1-0' (ecc-pause-con-pause)
  rest_seconds    integer,
  -- Endurance parameters
  duration_min    numeric(5,1),                              -- work duration
  hr_zone_target  integer check (hr_zone_target between 1 and 5),
  pace_target     text,                                      -- e.g. '4:30/km'
  work_seconds    integer,                                   -- for intervals
  rest_work_seconds integer,                                 -- rest between intervals in interval work
  interval_count  integer,                                   -- number of intervals
  -- Shared
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_itp_rx_session on public.individual_training_prescriptions(session_id);

comment on table public.individual_training_prescriptions is
  'Prescribed exercises within a training session, with strength or endurance parameters.';

-- ────────────────────────────────────────────────────────
-- 5. PLAYER EXERCISE LOG — what the player actually did
-- ────────────────────────────────────────────────────────

create table if not exists public.individual_training_log (
  id              uuid primary key default gen_random_uuid(),
  prescription_id uuid references public.individual_training_prescriptions(id),
  player_id       uuid not null references public.players(id),
  team_id         uuid not null references public.teams(id),
  plan_id         uuid references public.individual_training_plans(id),
  log_date        date not null default current_date,
  -- What was actually performed
  exercise_id     uuid references public.exercise_library(id),
  actual_sets     integer,
  actual_reps     text,                                      -- e.g. '8,8,7,6'
  actual_load_kg  numeric(6,1),
  actual_rpe      numeric(3,1) check (actual_rpe between 0 and 10),
  -- Endurance actual
  actual_duration_min numeric(5,1),
  actual_avg_hr   integer,
  actual_distance_m numeric(8,0),
  -- Session-level
  session_rpe     numeric(3,1) check (session_rpe between 0 and 10),
  session_duration_min integer,
  -- Readiness context at time of session
  readiness_score numeric(5,1),                              -- snapshot of readiness at log time
  readiness_zone  text check (readiness_zone in ('green','yellow','red')),
  adjustment_applied text check (adjustment_applied in ('none','deload','recovery','skip')),
  -- Status
  completed       boolean not null default false,
  skipped         boolean not null default false,
  skip_reason     text,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_itl_player_date on public.individual_training_log(player_id, log_date);
create index if not exists idx_itl_plan on public.individual_training_log(plan_id);
create index if not exists idx_itl_prescription on public.individual_training_log(prescription_id);

comment on table public.individual_training_log is
  'What the player actually performed. Each row is one exercise in a session. Stores readiness snapshot for audit.';

-- ────────────────────────────────────────────────────────
-- 6. PLAYER 1RM TRACKER — for progressive overload
-- ────────────────────────────────────────────────────────

create table if not exists public.player_exercise_maxes (
  id              uuid primary key default gen_random_uuid(),
  player_id       uuid not null references public.players(id),
  exercise_id     uuid not null references public.exercise_library(id),
  estimated_1rm   numeric(6,1) not null,                     -- kg
  method          text not null default 'epley'
    check (method in ('tested','epley','brzycki','coach_estimate')),
  tested_date     date not null default current_date,
  notes           text,
  created_at      timestamptz not null default now(),
  unique (player_id, exercise_id, tested_date)
);

create index if not exists idx_pem_player_exercise on public.player_exercise_maxes(player_id, exercise_id);

comment on table public.player_exercise_maxes is
  'Tracks estimated or tested 1RM per exercise per player for load prescription (%1RM).';

-- ────────────────────────────────────────────────────────
-- 7. READINESS SCORE FUNCTION
-- ────────────────────────────────────────────────────────
-- Computes a composite 0-100 readiness score from:
--   • readiness_entries (wellness: 5 dimensions × 1-5 = 5-25)
--   • player_load_metrics (ACWR)
--   • training_modifier (Z-score trend)
--
-- Returns: score (0-100), zone ('green'/'yellow'/'red'),
--          recommended_action, deload_volume_pct, deload_intensity_pct
-- ────────────────────────────────────────────────────────

create or replace function public.compute_player_readiness(
  p_player_id uuid,
  p_date date default current_date
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_wellness     record;
  v_load         record;
  v_wellness_pct numeric;
  v_acwr_score   numeric;
  v_z_score      numeric;
  v_composite    numeric;
  v_zone         text;
begin
  -- 1. Wellness score (5 dimensions × 1-5 scale → 5-25, normalise to 0-100)
  select fatigue_energy, sleep_quality, sleep_duration, stress_mood, muscle_soreness,
         total_score,
         (training_modifier->>'z')::numeric as z_today
  into v_wellness
  from public.readiness_entries
  where player_id = p_player_id and entry_date = p_date;

  if v_wellness is null then
    -- No check-in today: return null score, yellow zone
    return jsonb_build_object(
      'score', null,
      'zone', 'yellow',
      'reason', 'no_checkin',
      'recommended_action', 'normal'
    );
  end if;

  -- Normalise wellness: (total_score - 5) / 20 × 100
  v_wellness_pct := ((coalesce(v_wellness.total_score,
    v_wellness.fatigue_energy + v_wellness.sleep_quality + v_wellness.sleep_duration
    + v_wellness.stress_mood + v_wellness.muscle_soreness) - 5.0) / 20.0) * 100.0;

  -- 2. ACWR context (ideal range 0.8-1.3)
  select acwr, load_trend
  into v_load
  from public.player_load_metrics
  where player_id = p_player_id
  order by metric_date desc
  limit 1;

  if v_load.acwr is not null then
    -- Score ACWR: 100 at sweet spot (0.8-1.2), drops outside
    v_acwr_score := case
      when v_load.acwr between 0.8 and 1.2 then 100
      when v_load.acwr between 0.6 and 0.8 then 60 + (v_load.acwr - 0.6) / 0.2 * 40
      when v_load.acwr between 1.2 and 1.5 then 100 - (v_load.acwr - 1.2) / 0.3 * 60
      when v_load.acwr < 0.6 then 40
      when v_load.acwr > 1.5 then 20
      else 50
    end;
  else
    v_acwr_score := 70; -- no data = neutral
  end if;

  -- 3. Z-score bonus/penalty (training_modifier z-score)
  v_z_score := coalesce(v_wellness.z_today, 0);
  -- Z-score: positive = better than baseline, negative = worse
  -- Clamp to ±2 and map to ±10 adjustment
  v_z_score := greatest(-2, least(2, v_z_score)) * 5;

  -- 4. Composite: 60% wellness + 30% ACWR + 10% z-trend
  v_composite := round(
    (v_wellness_pct * 0.60) + (v_acwr_score * 0.30) + (50 + v_z_score) * 0.10
  , 1);
  v_composite := greatest(0, least(100, v_composite));

  -- 5. Zone classification
  v_zone := case
    when v_composite >= 65 then 'green'
    when v_composite >= 40 then 'yellow'
    else 'red'
  end;

  return jsonb_build_object(
    'score', v_composite,
    'zone', v_zone,
    'wellness_pct', round(v_wellness_pct, 1),
    'acwr', v_load.acwr,
    'acwr_score', round(v_acwr_score, 1),
    'load_trend', v_load.load_trend,
    'z_score', v_wellness.z_today,
    'recommended_action', case v_zone
      when 'green' then 'normal'
      when 'yellow' then 'deload'
      when 'red' then 'recovery'
    end
  );
end;
$$;

comment on function public.compute_player_readiness is
  'Returns composite readiness score (0-100), zone, and recommended training action for a player on a given date.';

-- ────────────────────────────────────────────────────────
-- 8. HELPER: Get today''s adjusted prescription for a player
-- ────────────────────────────────────────────────────────
-- Returns the player''s sessions for today with readiness adjustments applied.

create or replace function public.get_player_training_today(
  p_player_id uuid,
  p_date date default current_date
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_readiness    jsonb;
  v_zone         text;
  v_plan         record;
  v_dow          integer;
  v_week         integer;
  v_sessions     jsonb;
begin
  -- 1. Get readiness
  v_readiness := public.compute_player_readiness(p_player_id, p_date);
  v_zone := v_readiness->>'zone';

  -- 2. Find active plan
  select * into v_plan
  from public.individual_training_plans
  where player_id = p_player_id
    and status = 'active'
    and start_date <= p_date
    and (end_date is null or end_date >= p_date)
  order by created_at desc
  limit 1;

  if v_plan is null then
    return jsonb_build_object(
      'readiness', v_readiness,
      'plan', null,
      'sessions', '[]'::jsonb,
      'message', 'No active plan'
    );
  end if;

  -- 3. Determine day of week (ISO: 1=Mon) and week number
  v_dow := extract(isodow from p_date)::integer;
  v_week := greatest(1, (p_date - v_plan.start_date)::integer / 7 + 1);

  -- 4. Get sessions with prescriptions
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'session_id', s.id,
      'session_name', s.session_name,
      'session_type', s.session_type,
      'estimated_duration_min', s.estimated_duration_min,
      'readiness_zone', v_zone,
      'adjustment', case
        when not v_plan.readiness_enabled then 'none'
        when v_zone = 'red' then v_plan.readiness_red_action
        when v_zone = 'yellow' then v_plan.readiness_yellow_action
        else 'none'
      end,
      'deload_volume_pct', case
        when v_zone in ('yellow','red') and v_plan.readiness_enabled then v_plan.deload_volume_pct
        else 100
      end,
      'deload_intensity_pct', case
        when v_zone in ('yellow','red') and v_plan.readiness_enabled then v_plan.deload_intensity_pct
        else 100
      end,
      'prescriptions', (
        select coalesce(jsonb_agg(
          jsonb_build_object(
            'prescription_id', rx.id,
            'exercise_id', rx.exercise_id,
            'exercise_name', e.name,
            'exercise_name_is', e.name_is,
            'exercise_type', e.exercise_type,
            'sort_order', rx.sort_order,
            'sets', rx.sets,
            'reps', rx.reps,
            'load_type', rx.load_type,
            'load_value', rx.load_value,
            'rpe_target', rx.rpe_target,
            'tempo', rx.tempo,
            'rest_seconds', rx.rest_seconds,
            'duration_min', rx.duration_min,
            'hr_zone_target', rx.hr_zone_target,
            'pace_target', rx.pace_target,
            'work_seconds', rx.work_seconds,
            'rest_work_seconds', rx.rest_work_seconds,
            'interval_count', rx.interval_count,
            'notes', rx.notes
          ) order by rx.sort_order
        ), '[]'::jsonb)
        from public.individual_training_prescriptions rx
        join public.exercise_library e on e.id = rx.exercise_id
        where rx.session_id = s.id
      )
    ) order by s.sort_order
  ), '[]'::jsonb)
  into v_sessions
  from public.individual_training_sessions s
  where s.plan_id = v_plan.id
    and s.day_of_week = v_dow
    and s.week_number = v_week;

  return jsonb_build_object(
    'readiness', v_readiness,
    'plan_id', v_plan.id,
    'plan_name', v_plan.plan_name,
    'plan_type', v_plan.plan_type,
    'week_number', v_week,
    'day_of_week', v_dow,
    'sessions', v_sessions
  );
end;
$$;

comment on function public.get_player_training_today is
  'Returns the player''s prescribed sessions for today, adjusted by readiness score.';

-- ────────────────────────────────────────────────────────
-- 9. RLS POLICIES
-- ────────────────────────────────────────────────────────

alter table public.exercise_library enable row level security;
alter table public.individual_training_plans enable row level security;
alter table public.individual_training_sessions enable row level security;
alter table public.individual_training_prescriptions enable row level security;
alter table public.individual_training_log enable row level security;
alter table public.player_exercise_maxes enable row level security;

-- Exercise library: readable by all authenticated users
create policy exercise_library_select on public.exercise_library
  for select using (auth.role() = 'authenticated');

-- Exercise library: writable by staff only
create policy exercise_library_insert on public.exercise_library
  for insert with check (
    exists (select 1 from staff_users su where su.user_id = auth.uid())
  );

-- Plans: coaches see their team's plans, players see their own
create policy itp_select on public.individual_training_plans
  for select using (
    player_id = auth.uid()
    or exists (
      select 1 from coach_teams ct
      where ct.coach_id = auth.uid() and ct.team_id = individual_training_plans.team_id
    )
    or exists (select 1 from staff_users su where su.user_id = auth.uid())
  );

-- Plans: coaches can create for their teams
create policy itp_insert on public.individual_training_plans
  for insert with check (
    exists (
      select 1 from coach_teams ct
      where ct.coach_id = auth.uid() and ct.team_id = individual_training_plans.team_id
    )
    or exists (select 1 from staff_users su where su.user_id = auth.uid())
  );

-- Plans: coaches can update their teams' plans
create policy itp_update on public.individual_training_plans
  for update using (
    exists (
      select 1 from coach_teams ct
      where ct.coach_id = auth.uid() and ct.team_id = individual_training_plans.team_id
    )
    or exists (select 1 from staff_users su where su.user_id = auth.uid())
  );

-- Sessions: inherit plan visibility
create policy its_select on public.individual_training_sessions
  for select using (
    exists (
      select 1 from individual_training_plans p
      where p.id = individual_training_sessions.plan_id
        and (
          p.player_id = auth.uid()
          or exists (select 1 from coach_teams ct where ct.coach_id = auth.uid() and ct.team_id = p.team_id)
          or exists (select 1 from staff_users su where su.user_id = auth.uid())
        )
    )
  );

create policy its_insert on public.individual_training_sessions
  for insert with check (
    exists (
      select 1 from individual_training_plans p
      where p.id = individual_training_sessions.plan_id
        and (
          exists (select 1 from coach_teams ct where ct.coach_id = auth.uid() and ct.team_id = p.team_id)
          or exists (select 1 from staff_users su where su.user_id = auth.uid())
        )
    )
  );

-- Prescriptions: inherit session → plan visibility
create policy itp_rx_select on public.individual_training_prescriptions
  for select using (
    exists (
      select 1 from individual_training_sessions s
      join individual_training_plans p on p.id = s.plan_id
      where s.id = individual_training_prescriptions.session_id
        and (
          p.player_id = auth.uid()
          or exists (select 1 from coach_teams ct where ct.coach_id = auth.uid() and ct.team_id = p.team_id)
          or exists (select 1 from staff_users su where su.user_id = auth.uid())
        )
    )
  );

create policy itp_rx_insert on public.individual_training_prescriptions
  for insert with check (
    exists (
      select 1 from individual_training_sessions s
      join individual_training_plans p on p.id = s.plan_id
      where s.id = individual_training_prescriptions.session_id
        and (
          exists (select 1 from coach_teams ct where ct.coach_id = auth.uid() and ct.team_id = p.team_id)
          or exists (select 1 from staff_users su where su.user_id = auth.uid())
        )
    )
  );

-- Training log: players log their own, coaches see their teams
create policy itl_select on public.individual_training_log
  for select using (
    player_id = auth.uid()
    or exists (
      select 1 from coach_teams ct
      where ct.coach_id = auth.uid() and ct.team_id = individual_training_log.team_id
    )
    or exists (select 1 from staff_users su where su.user_id = auth.uid())
  );

create policy itl_insert on public.individual_training_log
  for insert with check (
    player_id = auth.uid()
    or exists (
      select 1 from coach_teams ct
      where ct.coach_id = auth.uid() and ct.team_id = individual_training_log.team_id
    )
    or exists (select 1 from staff_users su where su.user_id = auth.uid())
  );

-- Player maxes: players see/edit their own, coaches see their teams
create policy pem_select on public.player_exercise_maxes
  for select using (
    player_id = auth.uid()
    or exists (
      select 1 from coach_teams ct
      join players pl on pl.id = player_exercise_maxes.player_id
      where ct.coach_id = auth.uid() and ct.team_id = pl.team_id
    )
    or exists (select 1 from staff_users su where su.user_id = auth.uid())
  );

create policy pem_insert on public.player_exercise_maxes
  for insert with check (
    player_id = auth.uid()
    or exists (
      select 1 from coach_teams ct
      join players pl on pl.id = player_exercise_maxes.player_id
      where ct.coach_id = auth.uid() and ct.team_id = pl.team_id
    )
    or exists (select 1 from staff_users su where su.user_id = auth.uid())
  );

-- ────────────────────────────────────────────────────────
-- 10. UPDATED_AT TRIGGERS
-- ────────────────────────────────────────────────────────

-- reuse existing moddatetime trigger function if available
do $$
begin
  create extension if not exists moddatetime schema extensions;
exception when others then null;
end;
$$;

create or replace trigger trg_exercise_library_updated
  before update on public.exercise_library
  for each row execute function extensions.moddatetime(updated_at);

create or replace trigger trg_itp_updated
  before update on public.individual_training_plans
  for each row execute function extensions.moddatetime(updated_at);

create or replace trigger trg_its_updated
  before update on public.individual_training_sessions
  for each row execute function extensions.moddatetime(updated_at);

create or replace trigger trg_itp_rx_updated
  before update on public.individual_training_prescriptions
  for each row execute function extensions.moddatetime(updated_at);

create or replace trigger trg_itl_updated
  before update on public.individual_training_log
  for each row execute function extensions.moddatetime(updated_at);

-- ────────────────────────────────────────────────────────
-- 11. CLIENT INVITATIONS
-- ────────────────────────────────────────────────────────

create table if not exists public.client_invitations (
  id              uuid primary key default gen_random_uuid(),
  team_id         uuid not null references public.teams(id),
  invited_by      uuid not null references auth.users(id),
  client_email    text not null,
  client_name     text,
  token           text not null unique default encode(gen_random_bytes(32), 'hex'),
  status          text not null default 'pending'
    check (status in ('pending','accepted','expired','revoked')),
  player_id       uuid references public.players(id),
  accepted_at     timestamptz,
  expires_at      timestamptz not null default (now() + interval '30 days'),
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_ci_team on public.client_invitations(team_id);
create index if not exists idx_ci_token on public.client_invitations(token);
create index if not exists idx_ci_email on public.client_invitations(client_email);
create index if not exists idx_ci_status on public.client_invitations(status);

alter table public.client_invitations enable row level security;

create policy ci_select on public.client_invitations
  for select using (
    invited_by = auth.uid()
    or exists (select 1 from coach_teams ct where ct.coach_id = auth.uid() and ct.team_id = client_invitations.team_id)
    or exists (select 1 from staff_users su where su.user_id = auth.uid())
  );

create policy ci_insert on public.client_invitations
  for insert with check (
    exists (select 1 from coach_teams ct where ct.coach_id = auth.uid() and ct.team_id = client_invitations.team_id)
    or exists (select 1 from staff_users su where su.user_id = auth.uid())
  );

create policy ci_update on public.client_invitations
  for update using (
    invited_by = auth.uid()
    or exists (select 1 from staff_users su where su.user_id = auth.uid())
  );

create or replace trigger trg_ci_updated
  before update on public.client_invitations
  for each row execute function extensions.moddatetime(updated_at);

-- ────────────────────────────────────────────────────────
-- 12. ACCEPT INVITATION FUNCTION
-- ────────────────────────────────────────────────────────

create or replace function public.accept_client_invitation(p_token text)
returns jsonb language plpgsql security definer as $$
declare
  v_invite  record;
  v_player  record;
  v_user_id uuid;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    return jsonb_build_object('success', false, 'error', 'not_authenticated');
  end if;

  select * into v_invite from public.client_invitations
  where token = p_token and status = 'pending' and expires_at > now();

  if v_invite is null then
    return jsonb_build_object('success', false, 'error', 'invalid_or_expired_invitation');
  end if;

  select * into v_player from public.players
  where user_id = v_user_id and team_id = v_invite.team_id;

  if v_player is null then
    insert into public.players (full_name, user_id, team_id, sport, status, is_active)
    values (coalesce(v_invite.client_name, ''), v_user_id, v_invite.team_id, 'general', 'ACTIVE', true)
    returning * into v_player;
  end if;

  update public.client_invitations
  set status = 'accepted', player_id = v_player.id, accepted_at = now()
  where id = v_invite.id;

  return jsonb_build_object('success', true, 'player_id', v_player.id, 'team_id', v_invite.team_id);
end;
$$;

-- ────────────────────────────────────────────────────────
-- 13. AUTO-SETUP FOR PERSONAL TRAINER SIGNUP
-- ────────────────────────────────────────────────────────

create or replace function public.setup_personal_trainer()
returns trigger language plpgsql security definer as $$
declare
  v_team_id uuid;
  v_name text;
begin
  if (new.raw_user_meta_data->>'team_type') != 'personal_trainer' then
    return new;
  end if;

  v_name := coalesce(new.raw_user_meta_data->>'full_name', new.email);

  insert into public.teams (name, sport, team_type, gender)
  values (v_name, 'general', 'personal_trainer', 'mixed')
  returning id into v_team_id;

  insert into public.coach_teams (coach_id, team_id, is_primary)
  values (new.id, v_team_id, true);

  return new;
end;
$$;

drop trigger if exists trg_setup_personal_trainer on auth.users;
create trigger trg_setup_personal_trainer
  after insert on auth.users
  for each row execute function public.setup_personal_trainer();
