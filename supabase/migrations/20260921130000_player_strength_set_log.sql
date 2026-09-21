-- Per-set strength log (non-VBT objective loop): weight × reps × RPE per working set.
-- Feeds e1RM / working-1RM (reusing the client formulas) → %1RM becomes kg, and RPE feedback
-- drives coach-approved autoregulation. Descriptive — session load still flows via
-- session_rpe_entries; e1RM/autoregulation never set the readiness colour or the daily decision.

create table if not exists public.player_strength_set_log (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  team_id uuid,
  session_date date not null,
  exercise_id text not null,
  exercise_name text not null,
  canonical_lift text null,
  set_index int not null,
  weight_kg numeric null,
  reps int null,
  rpe numeric(3,1) null check (rpe is null or (rpe >= 0 and rpe <= 10)),
  rir numeric null,
  is_warmup boolean not null default false,
  source text not null default 'player',
  created_at timestamptz not null default now(),
  unique (player_id, session_date, exercise_id, set_index)
);

create index if not exists idx_strength_set_log_player_date on public.player_strength_set_log (player_id, session_date desc);

alter table public.player_strength_set_log enable row level security;

-- Coach/admin/staff of the team: read + write (mirrors player_fitness_test / player_body_metrics).
create policy strength_set_log_coach_read on public.player_strength_set_log for select using (
  exists (select 1 from profiles pr where pr.id = auth.uid()
    and lower(coalesce(pr.role, '')) = any (array['coach','admin','staff'])
    and (lower(coalesce(pr.role, '')) = 'admin' or pr.team_id = player_strength_set_log.team_id
         or player_strength_set_log.team_id in (select ct.team_id from coach_teams ct where ct.coach_id = auth.uid()))));
create policy strength_set_log_coach_write on public.player_strength_set_log for insert with check (
  exists (select 1 from profiles pr where pr.id = auth.uid()
    and lower(coalesce(pr.role, '')) = any (array['coach','admin','staff'])
    and (lower(coalesce(pr.role, '')) = 'admin' or pr.team_id = player_strength_set_log.team_id
         or player_strength_set_log.team_id in (select ct.team_id from coach_teams ct where ct.coach_id = auth.uid()))));

-- Player: read + write OWN rows (the athlete logs his own sets).
create policy strength_set_log_player_read on public.player_strength_set_log for select using (
  exists (select 1 from players p where p.id = player_strength_set_log.player_id and p.user_id = auth.uid())
  or exists (select 1 from profiles pr where pr.id = auth.uid() and pr.player_id = player_strength_set_log.player_id));
create policy strength_set_log_player_insert on public.player_strength_set_log for insert with check (
  exists (select 1 from players p where p.id = player_strength_set_log.player_id and p.user_id = auth.uid()));
create policy strength_set_log_player_update on public.player_strength_set_log for update using (
  exists (select 1 from players p where p.id = player_strength_set_log.player_id and p.user_id = auth.uid()));
