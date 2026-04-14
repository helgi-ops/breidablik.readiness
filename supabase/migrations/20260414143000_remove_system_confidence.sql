-- ============================================================================
-- Stop writing `system_confidence` in the stage4 pipeline.
--
-- Background: The column was always written as a hardcoded 0.95 placeholder
-- (with ~95% of historical rows NULL), on a 0-1 scale that never matched the
-- frontend's 0-100 comparison threshold (<60). Result: false "needs review"
-- flags on every player with an entry. Concrete signals (readiness colour,
-- composite load, PL spike, fatigue type) already cover the real decisions,
-- so we are retiring the half-built confidence concept.
--
-- This migration only updates the trigger function to stop writing to the
-- column. The column itself is left in place in `stage4_decisions` (and in
-- the `stage4_decisions_final` view) because dropping it requires CASCADE
-- through a long dependency chain:
--
--   stage4_apply_override(uuid,date,text,text)
--   stage4_apply_override(uuid,date,text,text,text)
--   stage4_generate_team_day(uuid,date)
--   v_coach_stage4_today
--   v_coach_readiness_today_stage4
--   v_coach_readiness_today_v7
--   v_team_readiness_today
--   v_team_units_today
--   v_team_unit_alerts_today (via v_team_units_today)
--   v_player_today_v1
--   v_coach_readiness_today_v8
--
-- The frontend no longer reads the value (all `_needs_review` / `_confidence_num`
-- references removed in the same commit). A follow-up migration can drop the
-- column once the dependent views are refactored.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.stage4_ensure_decision(
  p_player_id uuid,
  p_entry_date date
)
RETURNS SETOF public.stage4_decisions_final
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_team_id uuid;
  v_system_decision text;
  v_basis text;
  v_md_context text;
  v_locked boolean;
  v_exists boolean;
begin
  -- 0) Check if snapshot already exists (and whether it's locked)
  select true, coalesce(s.locked, false)
  into v_exists, v_locked
  from public.stage4_decisions s
  where s.player_id = p_player_id and s.entry_date = p_entry_date
  limit 1;

  -- If locked => never recompute
  if coalesce(v_locked, false) = true then
    return query
    select * from public.stage4_decisions_final f
    where f.player_id = p_player_id and f.entry_date = p_entry_date;
    return;
  end if;

  -- If exists (not locked) => just return
  if coalesce(v_exists, false) = true then
    return query
    select * from public.stage4_decisions_final f
    where f.player_id = p_player_id and f.entry_date = p_entry_date;
    return;
  end if;

  -- 1) Pull from readiness_entries
  select r.team_id, r.training_action, r.computed_auto_reason, r.md_day
  into v_team_id, v_system_decision, v_basis, v_md_context
  from public.readiness_entries r
  where r.player_id = p_player_id and r.entry_date = p_entry_date
  order by r.created_at desc
  limit 1;

  -- 2) Fallback if no readiness entry => UNCONFIRMED (not FULL)
  if v_system_decision is null then
    select p.team_id into v_team_id
    from public.players p
    where p.id = p_player_id
    limit 1;

    v_system_decision := 'UNCONFIRMED';
    v_basis := 'No readiness entry found -> UNCONFIRMED (awaiting check-in or coach override).';
    v_md_context := coalesce(v_md_context, 'GENERIC');
  end if;

  -- 3) Upsert snapshot (NEVER overwrite if locked=true).
  --    `system_confidence` removed from the insert list — see header.
  insert into public.stage4_decisions (
    player_id, team_id, entry_date,
    system_decision, system_md_context, system_variant, system_basis
  )
  values (
    p_player_id, v_team_id, p_entry_date,
    v_system_decision, v_md_context, 'A', v_basis
  )
  on conflict on constraint stage4_decisions_player_date_uniq
  do update
    set system_decision   = excluded.system_decision,
        system_basis      = excluded.system_basis,
        system_md_context = excluded.system_md_context,
        team_id           = excluded.team_id,
        updated_at        = now()
  where coalesce(public.stage4_decisions.locked, false) = false;

  -- 4) Return final
  return query
  select * from public.stage4_decisions_final f
  where f.player_id = p_player_id and f.entry_date = p_entry_date;
end;
$function$;
