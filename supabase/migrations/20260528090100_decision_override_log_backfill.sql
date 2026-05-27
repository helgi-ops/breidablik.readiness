-- ─────────────────────────────────────────────────────────────────────────
-- Backfill: copy historical coach overrides from stage4_decisions into the
-- new decision_override_log table.
--
-- One-time operation. Idempotent (the log table has no unique constraint
-- on the source row, so we use the on conflict do nothing safeguard plus
-- the WHERE clause to avoid re-inserting on re-runs).
--
-- Caveat: stage4_decisions is UPSERT-on-(player, date) — it only ever
-- contained the LATEST coach decision for a given day. We can therefore
-- recover ONE override row per (player, date) at most. Intermediate edits
-- before the trigger went live are unrecoverable.
--
-- After this runs the trigger from 20260528090000 takes over and captures
-- every save event going forward (real audit trail).
-- ─────────────────────────────────────────────────────────────────────────

insert into public.decision_override_log (
  player_id, team_id, decision_date,
  system_decision, coach_decision, override_direction, coach_note,
  overridden_by, created_at
)
select
  s.player_id,
  s.team_id,
  s.entry_date,
  s.system_decision,
  s.coach_decision,
  case
    when (case s.coach_decision when 'FULL' then 3 when 'MODIFIED' then 2 when 'RECOVERY' then 1 when 'HOLD' then 0 else 2 end)
       > (case s.system_decision when 'FULL' then 3 when 'MODIFIED' then 2 when 'RECOVERY' then 1 when 'HOLD' then 0 else 2 end)
      then 'tougher'
    when (case s.coach_decision when 'FULL' then 3 when 'MODIFIED' then 2 when 'RECOVERY' then 1 when 'HOLD' then 0 else 2 end)
       < (case s.system_decision when 'FULL' then 3 when 'MODIFIED' then 2 when 'RECOVERY' then 1 when 'HOLD' then 0 else 2 end)
      then 'lighter'
    else 'lateral'
  end as override_direction,
  s.coach_note,
  null,
  coalesce(s.updated_at, now())
from public.stage4_decisions s
where upper(coalesce(s.final_source, '')) = 'COACH_OVERRIDE'
  and s.system_decision is not null
  and s.coach_decision is not null
  and s.system_decision != s.coach_decision
  -- Re-run safety: skip rows that already have a log entry for the same
  -- (player, date, coach_decision) — protects against accidental double
  -- backfill in dev / staging environments.
  and not exists (
    select 1 from public.decision_override_log l
    where l.player_id = s.player_id
      and l.decision_date = s.entry_date
      and l.coach_decision = s.coach_decision
  );
