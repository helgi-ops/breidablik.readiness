-- player_drill_load — per-PLAYER, per-DRILL actual load from Catapult periods.
--
-- Sibling of player_external_load_daily (which is one whole-day total per
-- player). This is the per-drill granularity that aggregatePeriodsPerPlayer()
-- otherwise collapses to a squad MEAN and writes onto saved_sessions.items[].
-- Written forward-only, alongside that squad-mean write, so a player can see
-- their OWN load broken down by drill on /player/sessions/[id].
--
-- Natural key: (player_id, session_date, period_norm, source). period_norm =
-- normPeriodName(period_name); the matcher already treats a normalized period
-- name as unique within a session. Upsert on that key → idempotent re-sync.

create table if not exists public.player_drill_load (
  player_id          uuid not null references public.players(id) on delete cascade,
  session_date       date not null,
  period_norm        text not null,
  source             text not null default 'catapult',

  team_id            uuid null references public.teams(id) on delete set null,
  saved_session_id   uuid null references public.saved_sessions(id) on delete set null,
  drill_id           uuid null references public.drill_library(id) on delete set null,
  period_name        text not null,
  period_order       integer null,
  matched_by         text null,                 -- 'name' | 'order' | null (unmatched)
  external_athlete_id text null,

  -- GPS / load (every tier). numeric to match drill_library's metric columns.
  player_load          numeric null,
  player_load_per_min  numeric null,
  distance_m           numeric null,
  hir_total            numeric null,
  vel_b5               numeric null,
  vel_b6               numeric null,
  max_velocity         numeric null,
  accel_b23            numeric null,
  decel_b23            numeric null,
  accel_total          numeric null,
  decel_total          numeric null,
  hmld_m               numeric null,
  metabolic_power_avg  numeric null,
  metabolic_power_peak numeric null,
  duration_min         numeric null,
  -- IMA — Pro / Vector Pro only (null on Core).
  ima_accel            numeric null,
  ima_decel            numeric null,
  ima_cod_total        numeric null,
  high_ima             numeric null,
  jumps                numeric null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (player_id, session_date, period_norm, source)
);

create index if not exists player_drill_load_session_idx    on public.player_drill_load (saved_session_id);
create index if not exists player_drill_load_player_date_idx on public.player_drill_load (player_id, session_date desc);
create index if not exists player_drill_load_team_date_idx   on public.player_drill_load (team_id, session_date);

drop trigger if exists trg_player_drill_load_set_updated_at on public.player_drill_load;
create trigger trg_player_drill_load_set_updated_at
  before update on public.player_drill_load
  for each row execute procedure public.set_updated_at_timestamp();

alter table public.player_drill_load enable row level security;

-- Player reads their own rows (mirror player_external_load_daily_player_select_own).
drop policy if exists player_drill_load_player_select_own on public.player_drill_load;
create policy player_drill_load_player_select_own on public.player_drill_load
  for select using (
    (exists (select 1 from public.players p  where p.id = player_drill_load.player_id and p.user_id = auth.uid()))
    or (exists (select 1 from public.profiles pr where pr.id = auth.uid() and pr.player_id = player_drill_load.player_id))
  );

-- Coach / admin / staff read their team (mirror player_external_load_daily_coach_read_team;
-- covers multi-team via coach_teams).
drop policy if exists player_drill_load_coach_read_team on public.player_drill_load;
create policy player_drill_load_coach_read_team on public.player_drill_load
  for select using (
    exists (
      select 1 from public.profiles pr
      where pr.id = auth.uid()
        and lower(coalesce(pr.role, '')) = any (array['coach','admin','staff'])
        and (
          lower(coalesce(pr.role, '')) = 'admin'
          or pr.team_id = player_drill_load.team_id
          or player_drill_load.team_id in (select ct.team_id from public.coach_teams ct where ct.coach_id = auth.uid())
        )
    )
  );

-- Writes are service-role only (getSupabaseAdmin bypasses RLS) — no INSERT/UPDATE policy.
