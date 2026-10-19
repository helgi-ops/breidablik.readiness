-- Keep the delivered session in lockstep with the canonical readiness verdict.
--
-- Problem: `stage4_decisions.system_decision` (FULL / REDUCED / RECOVERY — the action that drives the
-- player's "lighter session") is a STORED snapshot written from `readiness_entries.training_action` at
-- check-in time. Nothing re-derived it when the colour later changed (engine fix, backfill, or a late
-- recompute), so a player whose colour turned GREEN could keep getting REDUCED from a stale stage4 row.
-- This is the operational form of the canonical-verdict contract (CLAUDE.md): one verdict, delivered
-- everywhere. The colour is canonical; the Stage-4 action must follow it, not drift from it.
--
-- Fix (two parts):
--   1. Harden `stage4_ensure_decision` — it tried to INSERT a sentinel 'UNCONFIRMED' for a player/day
--      with no readiness entry, which violates `stage4_decisions_system_decision_check`
--      (system_decision ∈ FULL/REDUCED/RECOVERY) and aborted any team-wide regeneration that touched a
--      no-check-in player. A player with no check-in simply has no Stage-4 decision until they check in;
--      the function now returns the existing final row (if any) and inserts nothing. All other behaviour
--      (reads training_action as the system decision, respects genuine coach locks via the ON CONFLICT
--      WHERE guard, only updates on a real change) is unchanged.
--   2. AFTER INSERT/UPDATE trigger on `readiness_entries` → `stage4_ensure_decision(player, date)` so the
--      Stage-4 action is re-derived automatically whenever the verdict is (re)computed. It is:
--        * guarded — only runs when training_action is present and (on UPDATE) actually changed;
--        * exception-safe — a Stage-4 sync problem is downgraded to a warning and can NEVER block a
--          player's check-in (the readiness write always succeeds);
--        * lock-respecting — ensure_decision skips genuinely coach-locked / coach-decided rows, so a
--          coach override is never overwritten;
--        * recursion-free — ensure_decision writes only stage4_decisions, whose triggers never write
--          back to readiness_entries.
--
-- Canonical colour unchanged; no load path touched. This only makes the already-canonical colour reach
-- the delivered session reliably.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) Harden stage4_ensure_decision: never insert the invalid 'UNCONFIRMED' sentinel.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.stage4_ensure_decision(p_player_id uuid, p_entry_date date)
 RETURNS SETOF stage4_decisions_final
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_team_id uuid;
  v_system_decision text;
  v_basis text;
  v_md_context text;
  v_genuine_lock boolean;
  v_exists boolean;
begin
  select true,
    (coalesce(s.locked, false) = true
      and (s.locked_at is not null or s.locked_by is not null or s.coach_decision is not null))
  into v_exists, v_genuine_lock
  from public.stage4_decisions s
  where s.player_id = p_player_id and s.entry_date = p_entry_date
  limit 1;

  if coalesce(v_genuine_lock, false) = true then
    return query
    select * from public.stage4_decisions_final f
    where f.player_id = p_player_id and f.entry_date = p_entry_date;
    return;
  end if;

  select r.team_id, r.training_action, r.computed_auto_reason, r.md_day
  into v_team_id, v_system_decision, v_basis, v_md_context
  from public.readiness_entries r
  where r.player_id = p_player_id and r.entry_date = p_entry_date
  order by r.created_at desc
  limit 1;

  if v_system_decision is null then
    -- No readiness entry for this player/day. Do NOT fabricate a row — writing an 'UNCONFIRMED'
    -- sentinel violates the system_decision check constraint and would abort team-wide regeneration.
    -- Return the existing final row if one is present; otherwise nothing.
    return query
    select * from public.stage4_decisions_final f
    where f.player_id = p_player_id and f.entry_date = p_entry_date;
    return;
  end if;

  insert into public.stage4_decisions (
    player_id, team_id, entry_date,
    system_decision, system_md_context, system_variant, system_basis
  )
  values (
    p_player_id, v_team_id, p_entry_date,
    v_system_decision, v_md_context, 'A', v_basis
  )
  on conflict (player_id, entry_date)
  do update
    set system_decision   = excluded.system_decision,
        system_basis      = excluded.system_basis,
        system_md_context = excluded.system_md_context,
        team_id           = excluded.team_id,
        updated_at        = now()
  where not (coalesce(public.stage4_decisions.locked, false) = true
             and (public.stage4_decisions.locked_at is not null
                  or public.stage4_decisions.locked_by is not null
                  or public.stage4_decisions.coach_decision is not null))
    and (public.stage4_decisions.system_decision   is distinct from excluded.system_decision
      or public.stage4_decisions.system_basis      is distinct from excluded.system_basis
      or public.stage4_decisions.system_md_context is distinct from excluded.system_md_context);

  return query
  select * from public.stage4_decisions_final f
  where f.player_id = p_player_id and f.entry_date = p_entry_date;
end;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) Auto-sync the Stage-4 system decision whenever the readiness verdict is (re)computed.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mp_sync_stage4_from_readiness()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  -- Nothing to mirror until the engine has produced an action.
  if NEW.training_action is null then
    return NEW;
  end if;

  -- On UPDATE, only resync when the action actually changed (avoid needless churn / override-log noise).
  if TG_OP = 'UPDATE' and NEW.training_action is not distinct from OLD.training_action then
    return NEW;
  end if;

  -- A Stage-4 sync problem must NEVER break a player's check-in: swallow and warn.
  begin
    perform public.stage4_ensure_decision(NEW.player_id, NEW.entry_date);
  exception when others then
    raise warning 'mp_sync_stage4_from_readiness skipped (player=%, date=%): %',
      NEW.player_id, NEW.entry_date, sqlerrm;
  end;

  return NEW;
end;
$function$;

-- Runs last (zzzz_) so it sees the fully-computed training_action from the BEFORE triggers.
DROP TRIGGER IF EXISTS zzzz_mp_sync_stage4_from_readiness ON public.readiness_entries;
CREATE TRIGGER zzzz_mp_sync_stage4_from_readiness
  AFTER INSERT OR UPDATE ON public.readiness_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.mp_sync_stage4_from_readiness();
