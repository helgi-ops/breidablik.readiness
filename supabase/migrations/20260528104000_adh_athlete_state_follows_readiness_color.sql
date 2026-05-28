-- ─────────────────────────────────────────────────────────────────────────
-- athlete_decision_history.athlete_state — now mirrors readiness_entries.color
--
-- BACKGROUND: The 30-day audit (28 May 2026) showed adh.athlete_state was
-- 0% GREEN, 55% YELLOW, 45% RED — completely disconnected from the
-- dashboard's readiness colors (70% GREEN). The trajectory-aware engine
-- inside playerDecision was emitting its own verdict that disagreed with
-- the personal-norm readiness verdict the coach sees. Multiple downstream
-- consumers (AI Q&A, summary, team-analysis) used to read adh.athlete_state
-- as "the verdict" and surface RED to coaches who saw YELLOW on screen.
--
-- After the 2026-05-28 cleanup, all UI readers now use v_coach_readiness_today_v8
-- (= readiness_entries.color, the canonical source per CLAUDE.md). To close
-- the inconsistency at the data layer too, this trigger forces every adh
-- write to set athlete_state to match the same-date readiness color.
--
-- Engine's other outputs (input_signals, engine_contributions, streak_context,
-- session_mode, load_action) are preserved untouched — they remain useful
-- for sequence detection, counterfactuals, and forecast logic. Only the
-- TOP-LEVEL verdict color is constrained to follow the canonical source.
--
-- See CLAUDE.md > "Canonical verdict source".
-- ─────────────────────────────────────────────────────────────────────────

create or replace function public.adh_align_state_to_readiness()
returns trigger language plpgsql security definer set search_path = public as $func$
declare
  v_color text;
begin
  -- Look up canonical color for the same (player, date). If a readiness
  -- entry exists, force athlete_state to it. If not, leave whatever the
  -- engine wrote (rare — adh is usually written AFTER readiness).
  select lower(re.color) into v_color
    from public.readiness_entries re
   where re.player_id = new.player_id
     and re.entry_date = new.decision_date
   limit 1;

  if v_color is not null then
    new.athlete_state := case v_color
      when 'green'  then 'GREEN'
      when 'yellow' then 'YELLOW'
      when 'red'    then 'RED'
      else new.athlete_state
    end;
  end if;

  return new;
end;
$func$;

drop trigger if exists trg_adh_align_state on public.athlete_decision_history;
create trigger trg_adh_align_state
  before insert or update on public.athlete_decision_history
  for each row execute function public.adh_align_state_to_readiness();

comment on function public.adh_align_state_to_readiness() is
  'Forces athlete_decision_history.athlete_state to match readiness_entries.color on the same date. Closes the verdict-color inconsistency between engines. See CLAUDE.md > Canonical verdict source.';
