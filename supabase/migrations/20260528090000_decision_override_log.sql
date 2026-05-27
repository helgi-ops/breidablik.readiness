-- ─────────────────────────────────────────────────────────────────────────
-- decision_override_log — per-event audit trail of coach overrides
--
-- Why this exists, when stage4_decisions already records the override:
--
-- stage4_decisions is UPSERT-on-(player, date). It only ever stores the
-- LATEST decision for a player on a given day — if a coach changes their
-- mind twice (FULL → MODIFIED → FULL), the middle state is lost. That
-- means we can't answer:
--   * How many times has this coach overridden the engine this week?
--   * Did the coach later REVERT an override (engine was right after all)?
--   * Are there players the coach consistently disagrees on?
--   * Has the override pattern shifted over time?
--
-- The answer is a separate append-only log of each override event. Coach
-- writes to stage4_decisions as normal; the trigger below copies the
-- override event into this log table whenever a real disagreement (system
-- vs coach decision) is saved.
--
-- This is principle #6 of the Explainability-First manifesto in concrete
-- form — overrides become an audited dialogue, not a black hole, and the
-- system has the data to learn from coach disagreements over time.
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists public.decision_override_log (
  id                uuid primary key default gen_random_uuid(),
  player_id         uuid not null references public.players(id) on delete cascade,
  team_id           uuid references public.teams(id) on delete set null,
  decision_date     date not null,
  -- Engine's verdict for the day at the moment of override
  system_decision   text not null,
  -- Coach's verdict (what they saved)
  coach_decision    text not null,
  -- Direction of the override — convenience flag for analytics. The trigger
  -- computes this so callers don't have to.
  override_direction text not null check (override_direction in (
    'tougher',     -- coach went HARDER than the engine (e.g. engine RECOVERY, coach FULL)
    'lighter',     -- coach went EASIER than the engine (e.g. engine FULL, coach MODIFIED)
    'lateral'      -- e.g. MODIFIED → RECOVERY (both are non-full but different)
  )),
  -- Free-text reason from the coach. Mirrors stage4_decisions.coach_note at
  -- the moment of the override. May be null when the coach didn't supply
  -- one (we should encourage but not require reasons — empty reason is
  -- still useful data).
  coach_note        text,
  -- Who clicked save. Joined to profiles for display.
  overridden_by     uuid references auth.users(id) on delete set null,
  -- Whether the override was eventually reverted to match the engine. This
  -- is set by a separate sweep job (not in this migration); null until then.
  was_reverted      boolean,
  reverted_at       timestamptz,

  created_at        timestamptz not null default now()
);

create index if not exists decision_override_log_team_date_idx
  on public.decision_override_log (team_id, decision_date desc);

create index if not exists decision_override_log_player_date_idx
  on public.decision_override_log (player_id, decision_date desc);

create index if not exists decision_override_log_user_idx
  on public.decision_override_log (overridden_by, created_at desc);

-- ── Trigger: copy override events from stage4_decisions ───────────────────
--
-- Fires on INSERT or UPDATE of stage4_decisions. Logs ONLY when:
--   * final_source = 'COACH_OVERRIDE' (i.e. the coach actually changed it)
--   * system_decision is not null and != coach_decision (real disagreement)
--   * the (player, date, coach_decision) combo hasn't already been logged
--     for the most recent override — prevents duplicate log entries from
--     re-saves of the same decision (e.g. coach saves twice in a row).
--
-- Lateral / tougher / lighter direction is computed inline using the
-- TrainingAction ordering: FULL > MODIFIED > RECOVERY > HOLD.

create or replace function public.log_decision_override()
returns trigger language plpgsql security definer set search_path = public as $func$
declare
  v_direction text;
  v_last_logged text;
begin
  -- Only log real coach overrides
  if new.final_source is null or upper(new.final_source) != 'COACH_OVERRIDE' then
    return new;
  end if;
  if new.system_decision is null or new.coach_decision is null then
    return new;
  end if;
  if new.system_decision = new.coach_decision then
    return new;
  end if;

  -- De-dupe: if the most recent log entry for this (player, date) already
  -- captures the same coach_decision, don't log again. This handles the
  -- "coach saves twice in a row with no change" case.
  select coach_decision into v_last_logged
    from public.decision_override_log
   where player_id = new.player_id
     and decision_date = new.entry_date
   order by created_at desc
   limit 1;
  if v_last_logged is not null and v_last_logged = new.coach_decision then
    return new;
  end if;

  -- Direction: rank FULL=3, MODIFIED=2, RECOVERY=1, HOLD=0
  v_direction := case
    when (case new.coach_decision when 'FULL' then 3 when 'MODIFIED' then 2 when 'RECOVERY' then 1 when 'HOLD' then 0 else 2 end)
       > (case new.system_decision when 'FULL' then 3 when 'MODIFIED' then 2 when 'RECOVERY' then 1 when 'HOLD' then 0 else 2 end)
      then 'tougher'
    when (case new.coach_decision when 'FULL' then 3 when 'MODIFIED' then 2 when 'RECOVERY' then 1 when 'HOLD' then 0 else 2 end)
       < (case new.system_decision when 'FULL' then 3 when 'MODIFIED' then 2 when 'RECOVERY' then 1 when 'HOLD' then 0 else 2 end)
      then 'lighter'
    else 'lateral'
  end;

  insert into public.decision_override_log (
    player_id, team_id, decision_date,
    system_decision, coach_decision, override_direction, coach_note,
    overridden_by
  ) values (
    new.player_id, new.team_id, new.entry_date,
    new.system_decision, new.coach_decision, v_direction, new.coach_note,
    auth.uid()
  );

  return new;
end;
$func$;

drop trigger if exists trg_log_decision_override on public.stage4_decisions;
create trigger trg_log_decision_override
  after insert or update on public.stage4_decisions
  for each row execute function public.log_decision_override();

-- ── RLS: same audience as stage4_decisions ───────────────────────────────
alter table public.decision_override_log enable row level security;

drop policy if exists "service_role_all" on public.decision_override_log;
create policy "service_role_all" on public.decision_override_log
  for all to service_role using (true) with check (true);

drop policy if exists "coach_read_own_team" on public.decision_override_log;
create policy "coach_read_own_team" on public.decision_override_log
  for select to authenticated
  using (
    team_id in (
      select team_id from public.profiles where id = auth.uid()
      union
      select team_id from public.coach_teams where coach_id = auth.uid()
    )
  );

comment on table public.decision_override_log is
  'Append-only audit log of coach overrides on stage4_decisions. Foundation for principle #6 of Explainability-First manifesto.';
