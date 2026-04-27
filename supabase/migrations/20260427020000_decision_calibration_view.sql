-- ───────────────────────────────────────────────────────────────────
-- vw_decision_calibration: per-row outcome view for verdict accuracy.
-- ───────────────────────────────────────────────────────────────────
-- For each daily readiness verdict (using coach override when present,
-- else the auto-computed color), looks forward to compute:
--   1. next_day_state — how the player's verdict moved tomorrow
--   2. trajectory     — persistent / escalated / recovered / unknown
--   3. injured_within_7d — true if an injury was logged within 7 days
--
-- The aggregate accuracy view (vw_decision_calibration_summary) builds
-- on this with per-color counts so we can answer:
--   "Of N RED verdicts, how many were followed by injury or sustained
--    flag? — that's the system's predictive precision."
--
-- Why a view (not a table): readiness_entries is the single source of
-- truth for verdict color; rebuilding this on read keeps the metric
-- live and avoids drift. Cheap because we filter on the (player_id,
-- entry_date) PK index for the self-join.
--
-- Note on data source: athlete_decision_history is the future home
-- (richer signals + counterfactuals stored in JSONB) but it has no
-- historical data yet. readiness_entries goes back to Jan 2026 so we
-- get useful calibration immediately. When history fills out we can
-- swap the source without changing downstream consumers.

CREATE OR REPLACE VIEW vw_decision_calibration AS
WITH dated AS (
  SELECT
    e.player_id,
    e.team_id,
    e.entry_date,
    UPPER(COALESCE(e.coach_color, e.color))::text AS predicted_state
  FROM readiness_entries e
  WHERE COALESCE(e.coach_color, e.color) IS NOT NULL
    AND COALESCE(e.coach_color, e.color)::text <> ''
)
SELECT
  d.player_id,
  d.team_id,
  d.entry_date AS decision_date,
  d.predicted_state,
  next_d.predicted_state AS next_day_state,
  CASE
    WHEN next_d.predicted_state IS NULL THEN 'unknown'
    WHEN d.predicted_state = next_d.predicted_state THEN 'persistent'
    WHEN (CASE next_d.predicted_state WHEN 'RED' THEN 3 WHEN 'YELLOW' THEN 2 WHEN 'GREEN' THEN 1 ELSE 0 END)
       > (CASE d.predicted_state WHEN 'RED' THEN 3 WHEN 'YELLOW' THEN 2 WHEN 'GREEN' THEN 1 ELSE 0 END)
    THEN 'escalated'
    ELSE 'recovered'
  END AS trajectory,
  EXISTS (
    SELECT 1 FROM injury_events ie
    WHERE ie.player_id = d.player_id
      AND ie.injury_date >= d.entry_date
      AND ie.injury_date <= d.entry_date + INTERVAL '7 days'
  ) AS injured_within_7d
FROM dated d
LEFT JOIN dated next_d
  ON next_d.player_id = d.player_id
  AND next_d.entry_date = d.entry_date + INTERVAL '1 day';

COMMENT ON VIEW vw_decision_calibration IS
'Per-day verdict outcomes (next-day state + 7d forward injury). Used by the calibration dashboard widget to prove the system''s predictive value — see /api/coach/calibration.';

-- ───────────────────────────────────────────────────────────────────
-- vw_decision_calibration_summary: aggregated accuracy stats per team.
-- ───────────────────────────────────────────────────────────────────
-- Confusion-matrix-style breakdown that powers the "Verdict accuracy
-- (last 30 days)" dashboard widget. Coach reads this as:
--   "RED verdicts: 47 issued, 38 (81%) were followed by injury or
--    persistent flag — the system caught real concerns 81% of the time."
--
-- Filters: deliberately scoped to last 30 days at the view level. If
-- you need a different window, query vw_decision_calibration directly.

CREATE OR REPLACE VIEW vw_decision_calibration_summary AS
SELECT
  team_id,
  predicted_state,
  COUNT(*) AS total_verdicts,
  SUM(CASE WHEN trajectory = 'persistent' THEN 1 ELSE 0 END) AS persistent_count,
  SUM(CASE WHEN trajectory = 'escalated' THEN 1 ELSE 0 END) AS escalated_count,
  SUM(CASE WHEN trajectory = 'recovered' THEN 1 ELSE 0 END) AS recovered_count,
  SUM(CASE WHEN trajectory = 'unknown' THEN 1 ELSE 0 END) AS unknown_count,
  SUM(CASE WHEN injured_within_7d THEN 1 ELSE 0 END) AS injury_count,
  -- Composite "concern persisted or materialised" — useful for RED
  -- precision: of RED verdicts, what % were followed by escalation,
  -- persistence, or injury? Recovered RED is also a "valid concern"
  -- in many sports-science frameworks because the recovery may have
  -- been driven by the cautious modification the coach applied.
  SUM(CASE
    WHEN trajectory IN ('persistent','escalated') OR injured_within_7d
    THEN 1 ELSE 0
  END) AS concern_validated_count
FROM vw_decision_calibration
WHERE decision_date >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY team_id, predicted_state;

COMMENT ON VIEW vw_decision_calibration_summary IS
'30-day rolling accuracy summary per team. Powers the verdict accuracy widget on the coach dashboard.';
