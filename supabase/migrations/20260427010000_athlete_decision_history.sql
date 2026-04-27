-- Per-player verdict log over time. Foundation for:
--   * Sequence-aware escalation (3+ consecutive YELLOW -> RED)
--   * Counterfactual explanations ("if STEN had been 5 not 3, ...")
--   * Coach-feedback learning loop (override-vs-outcome calibration)
--   * Forward-looking risk forecast (trajectory analysis)
--   * Proof-of-ROI (show owner: we caught X RED days, Y resulted in injury averted)
--
-- One row per player per decision_date. UPSERT pattern -- verdict can be
-- recomputed many times during the day (RPE arrives, injury logged, coach
-- override) but we always store the latest state. Streak detection reads
-- yesterday and earlier only; today's verdict is volatile.

create table if not exists public.athlete_decision_history (
  id              uuid primary key default gen_random_uuid(),
  player_id       uuid not null references public.players(id) on delete cascade,
  team_id         uuid references public.teams(id) on delete set null,
  decision_date   date not null,

  -- Verdict outputs (mirror AthleteDecision shape)
  athlete_state       text not null check (athlete_state in ('GREEN','YELLOW','RED','GRAY')),
  session_mode        text check (session_mode in ('full','modified','recovery','pending')),
  load_action         text check (load_action in ('normal','reduce','cap','top_up','monitor')),
  neural_status       text,
  readiness_score     numeric,
  decision_confidence numeric,

  -- Reasoning + flags as JSONB so we can post-hoc analyse without schema migrations
  reasons              jsonb,
  flags                jsonb,
  engine_contributions jsonb,
  -- Snapshot of inputs that drove the verdict -- enables counterfactuals
  -- ("if sten had been 5 not 3, verdict would have been YELLOW") and
  -- audit ("which signals were active when we said RED on Petur").
  input_signals        jsonb,
  -- Streak context computed at decision time (consecutive_yellow_days,
  -- consecutive_red_days, days_since_green). Stored so the dashboard
  -- doesn't have to recompute on every render.
  streak_context       jsonb,

  -- Override audit
  is_coach_override    boolean not null default false,
  coach_action         text,

  computed_at  timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  unique (player_id, decision_date)
);

-- Most-common access pattern is "last N decisions for this player".
create index if not exists athlete_decision_history_player_date_idx
  on public.athlete_decision_history (player_id, decision_date desc);

-- Team-level reports (sequences across team, daily aggregates)
create index if not exists athlete_decision_history_team_date_idx
  on public.athlete_decision_history (team_id, decision_date desc);

-- Auto-update updated_at on UPSERT
create or replace function public.athlete_decision_history_touch()
returns trigger language plpgsql as $func$
begin
  new.updated_at := now();
  return new;
end;
$func$;

drop trigger if exists trg_athlete_decision_history_touch on public.athlete_decision_history;
create trigger trg_athlete_decision_history_touch
  before update on public.athlete_decision_history
  for each row execute function public.athlete_decision_history_touch();

-- RLS: same model as readiness_entries (coach can read own team, players read own)
alter table public.athlete_decision_history enable row level security;

drop policy if exists "service_role_all" on public.athlete_decision_history;
create policy "service_role_all" on public.athlete_decision_history
  for all to service_role using (true) with check (true);

drop policy if exists "coach_read_own_team" on public.athlete_decision_history;
create policy "coach_read_own_team" on public.athlete_decision_history
  for select to authenticated
  using (
    team_id in (
      select team_id from public.profiles where id = auth.uid()
      union
      select team_id from public.coach_teams where coach_id = auth.uid()
    )
  );

drop policy if exists "player_read_own" on public.athlete_decision_history;
create policy "player_read_own" on public.athlete_decision_history
  for select to authenticated
  using (
    player_id in (select player_id from public.profiles where id = auth.uid())
  );

comment on table public.athlete_decision_history is
  'Per-player verdict log. UPSERT on (player_id, decision_date). Foundation for sequence escalation, counterfactuals, calibration, forecast.';
