-- Verdict pipeline reconciliation — short-term fix.
--
-- Aron Bjarnason 2026-05-02 incident: athlete_decision_history correctly
-- showed RED/recovery/cap for 3 days running (z=-2.32), but the coach UI
-- showed GREEN ("Ready for full session") and the AI Summary echoed it.
--
-- Root cause: readiness_entries goes through a stack of 17 BEFORE triggers
-- which each layer logic on top of the previous one. mp_apply_hybrid_readiness
-- sets color + training_action + computed_auto_flag from one v_final
-- variable. Then mp_apply_performance_intelligence downgrades training_action
-- FULL→REDUCED when an acute z-drop is detected — but does NOT update color
-- or computed_auto_flag. Subsequent triggers may further downgrade
-- training_action without touching color either. End state: training_action
-- says RECOVERY while color still says green from the original hybrid pass.
--
-- v_coach_display_today (which the coach dashboard renders) derives final_color
-- from v_coach_readiness_today_v5.color, and template_name from final_color.
-- So a player with training_action="RECOVERY" but color="green" gets shown
-- as ready for "Force (Full)" — a hard contradiction the coach has no way
-- to spot until they open the verdict modal.
--
-- This migration changes v_coach_readiness_today_v5 so that color (and
-- readiness_level + color_rank) are derived from training_action when
-- present. training_action is the authoritative downstream output that
-- every trigger in the chain ends up updating, so it's the consistent
-- single source. Legacy total_score-based logic is kept as a fallback
-- only for rows where training_action is NULL (old rows pre-trigger).
--
-- This is a SHORT-TERM fix — the right architectural fix is to consolidate
-- the 17 triggers into a single consistent engine. That's tracked separately;
-- this view change unblocks coach trust today without touching trigger code.

CREATE OR REPLACE VIEW public.v_coach_readiness_today_v5 AS
WITH base AS (
  SELECT
    v4.readiness_entry_id,
    v4.player_id,
    v4.full_name,
    v4.team,
    v4."position",
    v4.entry_date,
    v4.created_at,
    v4.readiness,
    v4.sleep,
    v4.soreness,
    v4.total_score,
    v4.notes,
    v4.coach_message,
    v4.training_action,
    v4.computed_auto_flag,
    v4.computed_auto_reason,
    -- Legacy total-score level retained for downstream consumers that
    -- still want raw absolute-score banding for debugging.
    CASE
      WHEN v4.total_score IS NULL THEN NULL::text
      WHEN v4.total_score >= 17 THEN 'GREEN_PLUS'::text
      WHEN v4.total_score >= 14 THEN 'GREEN'::text
      WHEN v4.total_score >= 11 THEN 'YELLOW'::text
      ELSE 'RED'::text
    END AS base_readiness_level
  FROM public.v_coach_readiness_today_v4 v4
),
-- Map training_action → unified verdict bucket (authoritative).
mapped AS (
  SELECT
    b.*,
    CASE UPPER(COALESCE(b.training_action, ''))
      WHEN 'RECOVERY' THEN 'RED'
      WHEN 'HOLD'     THEN 'RED'
      WHEN 'REDUCED'  THEN 'YELLOW'
      WHEN 'MODIFIED' THEN 'YELLOW'
      WHEN 'FULL'     THEN 'GREEN'
      ELSE NULL  -- training_action missing/unknown — fall back to legacy
    END AS action_level
  FROM base b
)
SELECT
  readiness_entry_id,
  player_id,
  full_name,
  team,
  "position",
  entry_date,
  created_at,
  readiness,
  sleep,
  soreness,
  total_score,
  notes,
  coach_message,
  training_action,
  computed_auto_flag,
  computed_auto_reason,
  base_readiness_level,
  -- readiness_level — prefer the action-derived level. Legacy fallback
  -- only for rows missing training_action.
  CASE
    WHEN action_level IS NOT NULL THEN action_level
    WHEN base_readiness_level IS NULL THEN NULL
    WHEN COALESCE(sleep::integer, -1) = 0 THEN
      CASE base_readiness_level
        WHEN 'GREEN_PLUS' THEN 'GREEN'
        WHEN 'GREEN'      THEN 'YELLOW'
        WHEN 'YELLOW'     THEN 'RED'
        ELSE 'RED'
      END
    ELSE base_readiness_level
  END AS readiness_level,
  -- color (lowercase, used by v_coach_display_today downstream)
  CASE
    WHEN action_level = 'RED'    THEN 'red'
    WHEN action_level = 'YELLOW' THEN 'yellow'
    WHEN action_level = 'GREEN'  THEN 'green'
    -- legacy fallback (only when training_action is missing)
    WHEN base_readiness_level IS NULL THEN NULL
    WHEN COALESCE(sleep::integer, -1) = 0 THEN
      CASE base_readiness_level
        WHEN 'GREEN_PLUS' THEN 'green'
        WHEN 'GREEN'      THEN 'yellow'
        WHEN 'YELLOW'     THEN 'red'
        ELSE 'red'
      END
    ELSE
      CASE base_readiness_level
        WHEN 'GREEN_PLUS' THEN 'green'
        WHEN 'GREEN'      THEN 'green'
        WHEN 'YELLOW'     THEN 'yellow'
        ELSE 'red'
      END
  END AS color,
  -- color_rank (numeric for ordering)
  CASE
    WHEN action_level = 'RED'    THEN 1
    WHEN action_level = 'YELLOW' THEN 2
    WHEN action_level = 'GREEN'  THEN 3
    WHEN base_readiness_level IS NULL THEN NULL
    WHEN COALESCE(sleep::integer, -1) = 0 THEN
      CASE base_readiness_level
        WHEN 'GREEN_PLUS' THEN 3
        WHEN 'GREEN'      THEN 2
        WHEN 'YELLOW'     THEN 1
        ELSE 1
      END
    ELSE
      CASE base_readiness_level
        WHEN 'GREEN_PLUS' THEN 4
        WHEN 'GREEN'      THEN 3
        WHEN 'YELLOW'     THEN 2
        ELSE 1
      END
  END AS color_rank
FROM mapped;

COMMENT ON VIEW public.v_coach_readiness_today_v5 IS
  'Coach-facing readiness view. color/readiness_level/color_rank are derived from training_action (the authoritative output of the trigger chain) when present, falling back to total_score banding only for legacy rows. See migration 20260502160000 for the Aron Bjarnason incident that motivated this.';
