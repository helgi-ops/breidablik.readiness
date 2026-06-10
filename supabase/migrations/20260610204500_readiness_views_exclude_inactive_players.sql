-- Deactivated players (is_active = false) were still being counted on coach
-- surfaces because the two canonical readiness views never filtered them out.
-- This made the Today tiles show 27 (all players) while compliance correctly
-- showed 23 (active). Filter is_active IS NOT FALSE in both views so every
-- surface agrees on the active roster.

CREATE OR REPLACE VIEW v_coach_readiness_today_v8 AS
 SELECT re.id AS readiness_entry_id,
    re.player_id,
    p.full_name,
    p.team,
    p.team_id,
    p."position",
    re.entry_date,
    re.created_at,
    re.readiness,
    re.sleep,
    re.soreness,
    re.total_score,
    re.notes,
    re.sore_areas,
    re.computed_auto_flag AS final_flag,
    re.color AS final_color,
    re.computed_auto_reason AS final_reason,
    s.system_decision,
    s.coach_decision,
    s.final_decision,
    s.final_source,
    s.coach_note,
    s.locked,
    s.updated_at AS stage4_updated_at,
    re.fatigue_energy,
    re.sleep_quality,
    re.sleep_duration,
    re.stress_mood,
    re.muscle_soreness
   FROM readiness_entries re
     JOIN players p ON p.id = re.player_id
     LEFT JOIN stage4_decisions_final s ON s.player_id = re.player_id AND s.entry_date = re.entry_date
  WHERE p.is_active IS NOT FALSE;

CREATE OR REPLACE VIEW v_team_readiness_today AS
 SELECT s.team_id,
    s.entry_date,
    count(*) AS n_players,
    sum(CASE WHEN s.final_decision = 'FULL'::text THEN 1 ELSE 0 END) AS n_full,
    sum(CASE WHEN s.final_decision = 'REDUCED'::text THEN 1 ELSE 0 END) AS n_reduced,
    sum(CASE WHEN s.final_decision = 'RECOVERY'::text THEN 1 ELSE 0 END) AS n_recovery,
    round(avg(COALESCE(s.system_confidence, 0::numeric)), 1) AS avg_confidence
   FROM stage4_decisions_final s
     JOIN players p ON p.id = s.player_id
  WHERE p.is_active IS NOT FALSE
  GROUP BY s.team_id, s.entry_date;
