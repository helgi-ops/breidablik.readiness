-- Nightly automation that closes the loops opened by removing the
-- "Re-sync / Endur-reikna baselines" buttons from /coach/decel-intelligence
-- and the missing notifications detection cron flagged in this session.
--
-- Two new pg_cron jobs:
--   1. 04:30 — refresh_mcburnie_decel_baselines (no-arg, recomputes
--      personal-baseline percentiles for the ASP burst engine).
--      Runs 30min AFTER refresh_athlete_metric_baselines_daily so the
--      atomic baseline tables it depends on are fresh first.
--   2. 23:00 — detect_all_team_notifications (NEW wrapper) loops over
--      every team that has at least one active player and calls
--      detect_coach_notifications(team_id). Backstop for the
--      Catapult-sync trigger so coaches see today's transitions even
--      when no GPS sync ran (e.g. pure indoor / no-Catapult clubs).
--
-- Both jobs are idempotent — if no new data exists they no-op.

-- ── Wrapper: detect notifications for every team in one call ──────────
CREATE OR REPLACE FUNCTION public.detect_all_team_notifications()
RETURNS TABLE(team_id uuid, new_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    t.id AS team_id,
    public.detect_coach_notifications(t.id) AS new_count
  FROM public.teams t
  WHERE EXISTS (
    SELECT 1 FROM public.players p
    WHERE p.team_id = t.id
      AND coalesce(p.is_active, true) = true
  );
END;
$function$;

COMMENT ON FUNCTION public.detect_all_team_notifications() IS
  'Loops every team with active players and runs detect_coach_notifications. '
  'Used by the nightly cron (23:00 daily) as a backstop for the Catapult-sync trigger.';

-- ── Cron 1: nightly Decel baselines refresh ──────────────────────────
SELECT cron.schedule(
  'refresh_mcburnie_decel_baselines_daily',
  '30 4 * * *',  -- 04:30 UTC daily
  $$SELECT public.refresh_mcburnie_decel_baselines()$$
);

-- ── Cron 2: nightly notifications detection backstop ─────────────────
SELECT cron.schedule(
  'detect_all_team_notifications_daily',
  '0 23 * * *',  -- 23:00 UTC daily (after most clubs done with day)
  $$SELECT public.detect_all_team_notifications()$$
);
