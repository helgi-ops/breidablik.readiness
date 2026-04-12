-- Recreate the coach match minutes input view to include opponent and is_home
-- from match_schedule, so the coach can see and edit the opponent inline.

CREATE OR REPLACE VIEW public.v_coach_match_minutes_input AS
WITH last_or_next_match_by_team AS (
  SELECT
    ms.team_id,
    COALESCE(
      max(ms.match_date) FILTER (WHERE ms.match_date <= CURRENT_DATE),
      min(ms.match_date) FILTER (WHERE ms.match_date >= CURRENT_DATE)
    ) AS match_date
  FROM match_schedule ms
  GROUP BY ms.team_id
)
SELECT
  p.id          AS player_id,
  p.full_name,
  p.team_id,
  ln.match_date AS last_match_date,
  COALESCE(mpm.minutes_played, 0) AS minutes_played,
  COALESCE(mpm.is_dnp, false)     AS is_dnp,
  ms.opponent,
  ms.is_home,
  ms.competition
FROM players p
LEFT JOIN last_or_next_match_by_team ln ON ln.team_id = p.team_id
LEFT JOIN match_player_minutes mpm     ON mpm.player_id = p.id
                                      AND mpm.match_date = ln.match_date
LEFT JOIN match_schedule ms            ON ms.team_id = ln.team_id
                                      AND ms.match_date = ln.match_date
WHERE p.team_id IS NOT NULL
ORDER BY p.full_name;
