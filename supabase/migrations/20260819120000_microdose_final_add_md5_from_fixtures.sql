-- Add MD-5 (lighter FORCE, early in a longer week) to the microdose md-day derivation.
-- The md-day is derived from the day's focus (FORCE -> MD-4). With longer gaps between
-- games there are two FORCE days; the earlier one (>= 5 days before the next match) should
-- be MD-5, the later (4 days) stays MD-4. We add a fixtures-based days-to-match and split
-- the FORCE case on it. Additive: only a FORCE day 5+ days out changes (MD-4 -> MD-5);
-- already-locked plans keep their locked md-day via COALESCE(lock_md_day, ...).
CREATE OR REPLACE VIEW v_player_today_microdose_final AS
WITH d AS (
  SELECT v.player_id,
    v.day_date AS entry_date,
    v.planned_focus,
    v.final_planned_day_type,
    v.readiness_flag,
    ( SELECT min(ms.match_date - v.day_date)::int
        FROM match_schedule ms
       WHERE ms.team_id = v.team_id AND ms.match_date >= v.day_date ) AS days_to_match
  FROM v_player_daily_decision_v3 v
), resolved AS (
  SELECT d.player_id,
    d.entry_date,
    d.planned_focus,
    d.final_planned_day_type,
    d.readiness_flag,
    CASE
      WHEN upper(COALESCE(d.final_planned_day_type, ''::text)) = 'OFF'::text THEN 'MD-1'::text
      WHEN upper(COALESCE(d.final_planned_day_type, ''::text)) = 'RECOVERY'::text THEN 'MD-2'::text
      WHEN COALESCE(d.planned_focus, ''::text) ~~* '%POLISH / CALM%'::text THEN 'MD-2'::text
      WHEN COALESCE(d.planned_focus, ''::text) ~~* '%NEURAL / VELOCITY%'::text THEN 'MD-3'::text
      WHEN COALESCE(d.planned_focus, ''::text) ~~* '%FORCE%'::text AND COALESCE(d.days_to_match, 0) >= 5 THEN 'MD-5'::text
      WHEN COALESCE(d.planned_focus, ''::text) ~~* '%FORCE%'::text THEN 'MD-4'::text
      ELSE 'GENERIC'::text
    END AS md_day_resolved,
    CASE
      WHEN upper(COALESCE(d.final_planned_day_type, ''::text)) = ANY (ARRAY['OFF'::text, 'RECOVERY'::text]) THEN 'RED'::text
      WHEN upper(COALESCE(d.readiness_flag, ''::text)) = ANY (ARRAY['RED'::text, 'YELLOW'::text, 'GREEN'::text, 'GREEN_PLUS'::text]) THEN upper(d.readiness_flag)
      ELSE 'GREEN'::text
    END AS readiness_resolved
  FROM d
), t AS (
  SELECT microdose_templates.md_day,
    microdose_templates.readiness_level AS template_readiness_level,
    microdose_templates.title AS template_title,
    microdose_templates.description AS template_description,
    microdose_templates.structure AS template_structure
  FROM microdose_templates
), l AS (
  SELECT player_microdose_plan_locks.player_id,
    player_microdose_plan_locks.entry_date,
    player_microdose_plan_locks.readiness_level AS lock_readiness_level,
    player_microdose_plan_locks.md_day AS lock_md_day,
    player_microdose_plan_locks.plan_title AS lock_plan_title,
    player_microdose_plan_locks.plan_description AS lock_plan_description,
    player_microdose_plan_locks.plan_structure AS lock_plan_structure,
    player_microdose_plan_locks.locked_at
  FROM player_microdose_plan_locks
)
SELECT r.player_id,
  r.entry_date,
  r.readiness_resolved AS readiness_level,
  r.readiness_flag,
  r.planned_focus,
  r.final_planned_day_type,
  COALESCE(l.lock_md_day, r.md_day_resolved) AS md_day,
  CASE
    WHEN COALESCE(l.lock_md_day, r.md_day_resolved) = 'MD-5'::text THEN 'FORCE'::text
    WHEN COALESCE(l.lock_md_day, r.md_day_resolved) = 'MD-4'::text THEN 'FORCE'::text
    WHEN COALESCE(l.lock_md_day, r.md_day_resolved) = 'MD-3'::text THEN 'NEURAL_VELOCITY'::text
    WHEN COALESCE(l.lock_md_day, r.md_day_resolved) = 'MD-2'::text THEN 'POLISH_CALM'::text
    WHEN COALESCE(l.lock_md_day, r.md_day_resolved) = 'MD-1'::text THEN 'ACTIVATION_PRIMER'::text
    WHEN COALESCE(l.lock_md_day, r.md_day_resolved) = 'MD+1'::text THEN 'POLISH_CALM'::text
    ELSE 'POLISH_CALM'::text
  END AS training_system,
  COALESCE(l.lock_plan_title, t.template_title) AS plan_title,
  COALESCE(l.lock_plan_description, t.template_description) AS plan_description,
  COALESCE(l.lock_plan_structure, t.template_structure) AS plan_structure,
  l.locked_at,
  l.locked_at IS NOT NULL AS is_locked
FROM resolved r
  LEFT JOIN l ON l.player_id = r.player_id AND l.entry_date = r.entry_date
  LEFT JOIN t ON t.md_day = COALESCE(l.lock_md_day, r.md_day_resolved) AND t.template_readiness_level = r.readiness_resolved;
