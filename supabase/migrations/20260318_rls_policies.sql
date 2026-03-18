-- ============================================================
-- RLS MIGRATION - MicroPulse / Checkin Mircodose
-- Dagsetning: 2026-03-18
-- Lýsing: Kveikir á RLS á öllum opinberum töflum og bætir við
--         öryggisreglum án þess að brjóta virkni forritsins.
--
-- Þrjár tegundir notenda:
--   staff   → full admin aðgangur (via staff_users)
--   coach   → sér gögn liða sinna (via coach_teams)
--   player  → sér eigin gögn (via players.user_id)
-- ============================================================

-- Helper function: er notandinn coach?
CREATE OR REPLACE FUNCTION public.is_coach()
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM public.coaches WHERE user_id = auth.uid())
$$;

-- Helper function: er notandinn staff?
CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM public.staff_users WHERE user_id = auth.uid())
$$;

-- Helper function: hvaða lið tilheyrir þessi coach?
CREATE OR REPLACE FUNCTION public.coach_team_ids()
RETURNS SETOF uuid LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT team_id FROM public.coach_teams WHERE coach_id = auth.uid()
$$;

-- Helper function: hvaða player_id tilheyrir þessum notanda?
CREATE OR REPLACE FUNCTION public.my_player_id()
RETURNS uuid LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT id FROM public.players WHERE user_id = auth.uid() LIMIT 1
$$;

-- ============================================================
-- 1. UPPFLETTITÖFLUR (read-only fyrir alla auðkennda notendur)
--    Engar persónulegar upplýsingar, bara kerfisgögn
-- ============================================================

-- app_settings
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "app_settings_read" ON public.app_settings;
CREATE POLICY "app_settings_read" ON public.app_settings
  FOR SELECT TO authenticated USING (true);

-- exercises
ALTER TABLE public.exercises ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "exercises_read" ON public.exercises;
CREATE POLICY "exercises_read" ON public.exercises
  FOR SELECT TO authenticated USING (true);

-- readiness_levels
ALTER TABLE public.readiness_levels ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "readiness_levels_read" ON public.readiness_levels;
CREATE POLICY "readiness_levels_read" ON public.readiness_levels
  FOR SELECT TO authenticated USING (true);

-- md_days
ALTER TABLE public.md_days ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "md_days_read" ON public.md_days;
CREATE POLICY "md_days_read" ON public.md_days
  FOR SELECT TO authenticated USING (true);

-- md_protocols
ALTER TABLE public.md_protocols ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "md_protocols_read" ON public.md_protocols;
CREATE POLICY "md_protocols_read" ON public.md_protocols
  FOR SELECT TO authenticated USING (true);

-- microdose_templates
ALTER TABLE public.microdose_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "microdose_templates_read" ON public.microdose_templates;
CREATE POLICY "microdose_templates_read" ON public.microdose_templates
  FOR SELECT TO authenticated USING (true);

-- microdosing_rules
ALTER TABLE public.microdosing_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "microdosing_rules_read" ON public.microdosing_rules;
CREATE POLICY "microdosing_rules_read" ON public.microdosing_rules
  FOR SELECT TO authenticated USING (true);

-- dose_presets
ALTER TABLE public.dose_presets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "dose_presets_read" ON public.dose_presets;
CREATE POLICY "dose_presets_read" ON public.dose_presets
  FOR SELECT TO authenticated USING (true);

-- post_training_templates
ALTER TABLE public.post_training_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "post_training_templates_read" ON public.post_training_templates;
CREATE POLICY "post_training_templates_read" ON public.post_training_templates
  FOR SELECT TO authenticated USING (true);

-- post_training_rules
ALTER TABLE public.post_training_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "post_training_rules_read" ON public.post_training_rules;
CREATE POLICY "post_training_rules_read" ON public.post_training_rules
  FOR SELECT TO authenticated USING (true);

-- issue_modules
ALTER TABLE public.issue_modules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "issue_modules_read" ON public.issue_modules;
CREATE POLICY "issue_modules_read" ON public.issue_modules
  FOR SELECT TO authenticated USING (true);

-- issue_rules
ALTER TABLE public.issue_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "issue_rules_read" ON public.issue_rules;
CREATE POLICY "issue_rules_read" ON public.issue_rules
  FOR SELECT TO authenticated USING (true);

-- sport_position_map
ALTER TABLE public.sport_position_map ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sport_position_map_read" ON public.sport_position_map;
CREATE POLICY "sport_position_map_read" ON public.sport_position_map
  FOR SELECT TO authenticated USING (true);

-- training_decision_rules
ALTER TABLE public.training_decision_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "training_decision_rules_read" ON public.training_decision_rules;
CREATE POLICY "training_decision_rules_read" ON public.training_decision_rules
  FOR SELECT TO authenticated USING (true);

-- training_action_presets
ALTER TABLE public.training_action_presets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "training_action_presets_read" ON public.training_action_presets;
CREATE POLICY "training_action_presets_read" ON public.training_action_presets
  FOR SELECT TO authenticated USING (true);

-- ============================================================
-- 2. LIÐATÖFLUR (coach sér lið sín, player sér sitt lið)
-- ============================================================

-- coach_teams: coach sér eigin tengsl
ALTER TABLE public.coach_teams ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "coach_teams_own" ON public.coach_teams;
CREATE POLICY "coach_teams_own" ON public.coach_teams
  FOR SELECT TO authenticated USING (
    coach_id = auth.uid() OR public.is_staff()
  );

-- team_coaches: sama og coach_teams
ALTER TABLE public.team_coaches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "team_coaches_own" ON public.team_coaches;
CREATE POLICY "team_coaches_own" ON public.team_coaches
  FOR SELECT TO authenticated USING (
    coach_id = auth.uid() OR public.is_staff()
  );

-- match_schedule: sér lið sín
ALTER TABLE public.match_schedule ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "match_schedule_team" ON public.match_schedule;
CREATE POLICY "match_schedule_team" ON public.match_schedule
  FOR SELECT TO authenticated USING (
    team_id IN (SELECT public.coach_team_ids())
    OR team_id IN (SELECT team_id FROM public.players WHERE user_id = auth.uid())
    OR public.is_staff()
  );

-- team_matches: sama
ALTER TABLE public.team_matches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "team_matches_read" ON public.team_matches;
CREATE POLICY "team_matches_read" ON public.team_matches
  FOR SELECT TO authenticated USING (
    team_id IN (SELECT public.coach_team_ids())
    OR team_id IN (SELECT team_id FROM public.players WHERE user_id = auth.uid())
    OR public.is_staff()
  );

-- week_setups: coach sér lið sín
ALTER TABLE public.week_setups ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "week_setups_team" ON public.week_setups;
CREATE POLICY "week_setups_team" ON public.week_setups
  FOR ALL TO authenticated USING (
    team_id IN (SELECT public.coach_team_ids())
    OR team_id IN (SELECT team_id FROM public.players WHERE user_id = auth.uid())
    OR public.is_staff()
  ) WITH CHECK (
    team_id IN (SELECT public.coach_team_ids()) OR public.is_staff()
  );

-- coach_plan_rules
ALTER TABLE public.coach_plan_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "coach_plan_rules_team" ON public.coach_plan_rules;
CREATE POLICY "coach_plan_rules_team" ON public.coach_plan_rules
  FOR ALL TO authenticated USING (
    team_id IN (SELECT public.coach_team_ids()) OR public.is_staff()
  ) WITH CHECK (
    team_id IN (SELECT public.coach_team_ids()) OR public.is_staff()
  );

-- day_overrides
ALTER TABLE public.day_overrides ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "day_overrides_team" ON public.day_overrides;
CREATE POLICY "day_overrides_team" ON public.day_overrides
  FOR ALL TO authenticated USING (
    team_id IN (SELECT public.coach_team_ids())
    OR team_id IN (SELECT team_id FROM public.players WHERE user_id = auth.uid())
    OR public.is_staff()
  ) WITH CHECK (
    team_id IN (SELECT public.coach_team_ids()) OR public.is_staff()
  );

-- week_day_overrides: engin team_id, tengist week_setups via week_setup_id
ALTER TABLE public.week_day_overrides ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "week_day_overrides_team" ON public.week_day_overrides;
CREATE POLICY "week_day_overrides_team" ON public.week_day_overrides
  FOR ALL TO authenticated USING (
    week_setup_id IN (
      SELECT id FROM public.week_setups
      WHERE team_id IN (SELECT public.coach_team_ids())
         OR team_id IN (SELECT team_id FROM public.players WHERE user_id = auth.uid())
    )
    OR public.is_staff()
  ) WITH CHECK (
    week_setup_id IN (
      SELECT id FROM public.week_setups
      WHERE team_id IN (SELECT public.coach_team_ids())
    )
    OR public.is_staff()
  );

-- training_session_context
ALTER TABLE public.training_session_context ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "training_session_context_team" ON public.training_session_context;
CREATE POLICY "training_session_context_team" ON public.training_session_context
  FOR ALL TO authenticated USING (
    team_id IN (SELECT public.coach_team_ids())
    OR team_id IN (SELECT team_id FROM public.players WHERE user_id = auth.uid())
    OR public.is_staff()
  ) WITH CHECK (
    team_id IN (SELECT public.coach_team_ids()) OR public.is_staff()
  );

-- ============================================================
-- 3. LEIKMANNA GÖGN
-- ============================================================

-- microdose_decisions: coach sér lið, player sér sig
ALTER TABLE public.microdose_decisions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "microdose_decisions_access" ON public.microdose_decisions;
CREATE POLICY "microdose_decisions_access" ON public.microdose_decisions
  FOR SELECT TO authenticated USING (
    team_id IN (SELECT public.coach_team_ids())
    OR player_id = public.my_player_id()
    OR public.is_staff()
  );
DROP POLICY IF EXISTS "microdose_decisions_write" ON public.microdose_decisions;
CREATE POLICY "microdose_decisions_write" ON public.microdose_decisions
  FOR ALL TO authenticated USING (
    team_id IN (SELECT public.coach_team_ids()) OR public.is_staff()
  ) WITH CHECK (
    team_id IN (SELECT public.coach_team_ids()) OR public.is_staff()
  );

-- microdose_overrides
ALTER TABLE public.microdose_overrides ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "microdose_overrides_access" ON public.microdose_overrides;
CREATE POLICY "microdose_overrides_access" ON public.microdose_overrides
  FOR SELECT TO authenticated USING (
    decision_id IN (
      SELECT id FROM public.microdose_decisions
      WHERE team_id IN (SELECT public.coach_team_ids())
         OR player_id = public.my_player_id()
    )
    OR public.is_staff()
  );
DROP POLICY IF EXISTS "microdose_overrides_write" ON public.microdose_overrides;
CREATE POLICY "microdose_overrides_write" ON public.microdose_overrides
  FOR INSERT TO authenticated WITH CHECK (
    public.is_coach() OR public.is_staff()
  );

-- daily_player_sessions
ALTER TABLE public.daily_player_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "daily_player_sessions_access" ON public.daily_player_sessions;
CREATE POLICY "daily_player_sessions_access" ON public.daily_player_sessions
  FOR SELECT TO authenticated USING (
    team_id IN (SELECT public.coach_team_ids())
    OR player_id = public.my_player_id()
    OR public.is_staff()
  );

-- player_daily_workout
ALTER TABLE public.player_daily_workout ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "player_daily_workout_access" ON public.player_daily_workout;
CREATE POLICY "player_daily_workout_access" ON public.player_daily_workout
  FOR SELECT TO authenticated USING (
    team_id IN (SELECT public.coach_team_ids())
    OR player_id = public.my_player_id()
    OR public.is_staff()
  );

-- player_plans
ALTER TABLE public.player_plans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "player_plans_access" ON public.player_plans;
CREATE POLICY "player_plans_access" ON public.player_plans
  FOR SELECT TO authenticated USING (
    team_id IN (SELECT public.coach_team_ids())
    OR player_id = public.my_player_id()
    OR public.is_staff()
  );
DROP POLICY IF EXISTS "player_plans_write" ON public.player_plans;
CREATE POLICY "player_plans_write" ON public.player_plans
  FOR ALL TO authenticated USING (
    team_id IN (SELECT public.coach_team_ids()) OR public.is_staff()
  ) WITH CHECK (
    team_id IN (SELECT public.coach_team_ids()) OR public.is_staff()
  );

-- player_plan_items (tengist player_plans via plan_id)
ALTER TABLE public.player_plan_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "player_plan_items_access" ON public.player_plan_items;
CREATE POLICY "player_plan_items_access" ON public.player_plan_items
  FOR SELECT TO authenticated USING (
    plan_id IN (
      SELECT id FROM public.player_plans
      WHERE team_id IN (SELECT public.coach_team_ids())
         OR player_id = public.my_player_id()
    )
    OR public.is_staff()
  );
DROP POLICY IF EXISTS "player_plan_items_write" ON public.player_plan_items;
CREATE POLICY "player_plan_items_write" ON public.player_plan_items
  FOR ALL TO authenticated USING (
    plan_id IN (
      SELECT id FROM public.player_plans
      WHERE team_id IN (SELECT public.coach_team_ids())
    )
    OR public.is_staff()
  ) WITH CHECK (
    plan_id IN (
      SELECT id FROM public.player_plans
      WHERE team_id IN (SELECT public.coach_team_ids())
    )
    OR public.is_staff()
  );

-- stage4_overrides: engin team_id, hefur decision_id og coach_user_id
ALTER TABLE public.stage4_overrides ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "stage4_overrides_access" ON public.stage4_overrides;
CREATE POLICY "stage4_overrides_access" ON public.stage4_overrides
  FOR SELECT TO authenticated USING (
    coach_user_id = auth.uid()
    OR decision_id IN (
      SELECT id FROM public.stage4_decisions
      WHERE team_id IN (SELECT public.coach_team_ids())
         OR player_id = public.my_player_id()
    )
    OR public.is_staff()
  );
DROP POLICY IF EXISTS "stage4_overrides_write" ON public.stage4_overrides;
CREATE POLICY "stage4_overrides_write" ON public.stage4_overrides
  FOR INSERT TO authenticated WITH CHECK (
    coach_user_id = auth.uid() OR public.is_staff()
  );

-- stage4_manual_overrides
ALTER TABLE public.stage4_manual_overrides ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "stage4_manual_overrides_team" ON public.stage4_manual_overrides;
CREATE POLICY "stage4_manual_overrides_team" ON public.stage4_manual_overrides
  FOR ALL TO authenticated USING (
    team_id IN (SELECT public.coach_team_ids())
    OR team_id IN (SELECT team_id FROM public.players WHERE user_id = auth.uid())
    OR public.is_staff()
  ) WITH CHECK (
    team_id IN (SELECT public.coach_team_ids()) OR public.is_staff()
  );

-- decision_exceptions
ALTER TABLE public.decision_exceptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "decision_exceptions_team" ON public.decision_exceptions;
CREATE POLICY "decision_exceptions_team" ON public.decision_exceptions
  FOR ALL TO authenticated USING (
    team_id IN (SELECT public.coach_team_ids())
    OR team_id IN (SELECT team_id FROM public.players WHERE user_id = auth.uid())
    OR public.is_staff()
  ) WITH CHECK (
    team_id IN (SELECT public.coach_team_ids()) OR public.is_staff()
  );

-- ============================================================
-- 4. PUSH NOTIFICATIONS (player sér eigin, API notar service_role)
-- ============================================================

-- player_push_tokens
ALTER TABLE public.player_push_tokens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "player_push_tokens_own" ON public.player_push_tokens;
CREATE POLICY "player_push_tokens_own" ON public.player_push_tokens
  FOR ALL TO authenticated USING (
    player_id = public.my_player_id() OR public.is_staff()
  ) WITH CHECK (
    player_id = public.my_player_id() OR public.is_staff()
  );

-- player_push_subscriptions
ALTER TABLE public.player_push_subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "player_push_subscriptions_own" ON public.player_push_subscriptions;
CREATE POLICY "player_push_subscriptions_own" ON public.player_push_subscriptions
  FOR ALL TO authenticated USING (
    player_id = public.my_player_id() OR public.is_staff()
  ) WITH CHECK (
    player_id = public.my_player_id() OR public.is_staff()
  );

-- checkin_notification_log (read-only fyrir coaches)
ALTER TABLE public.checkin_notification_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "checkin_notification_log_read" ON public.checkin_notification_log;
CREATE POLICY "checkin_notification_log_read" ON public.checkin_notification_log
  FOR SELECT TO authenticated USING (
    player_id IN (
      SELECT id FROM public.players
      WHERE team_id IN (SELECT public.coach_team_ids())
    )
    OR player_id = public.my_player_id()
    OR public.is_staff()
  );

-- rpe_notification_log
ALTER TABLE public.rpe_notification_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "rpe_notification_log_read" ON public.rpe_notification_log;
CREATE POLICY "rpe_notification_log_read" ON public.rpe_notification_log
  FOR SELECT TO authenticated USING (
    player_id IN (
      SELECT id FROM public.players
      WHERE team_id IN (SELECT public.coach_team_ids())
    )
    OR player_id = public.my_player_id()
    OR public.is_staff()
  );

-- ============================================================
-- 5. SESSION RPE
-- ============================================================

-- session_rpe_entries
ALTER TABLE public.session_rpe_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "session_rpe_entries_access" ON public.session_rpe_entries;
CREATE POLICY "session_rpe_entries_access" ON public.session_rpe_entries
  FOR SELECT TO authenticated USING (
    player_id IN (
      SELECT id FROM public.players
      WHERE team_id IN (SELECT public.coach_team_ids())
    )
    OR player_id = public.my_player_id()
    OR public.is_staff()
  );
DROP POLICY IF EXISTS "session_rpe_entries_player_write" ON public.session_rpe_entries;
CREATE POLICY "session_rpe_entries_player_write" ON public.session_rpe_entries
  FOR INSERT TO authenticated WITH CHECK (
    player_id = public.my_player_id() OR public.is_staff()
  );

-- player_session_rpe
ALTER TABLE public.player_session_rpe ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "player_session_rpe_access" ON public.player_session_rpe;
CREATE POLICY "player_session_rpe_access" ON public.player_session_rpe
  FOR SELECT TO authenticated USING (
    player_id IN (
      SELECT id FROM public.players
      WHERE team_id IN (SELECT public.coach_team_ids())
    )
    OR player_id = public.my_player_id()
    OR public.is_staff()
  );

-- ============================================================
-- 6. LOAD METRICS
-- ============================================================

-- player_load_metrics
ALTER TABLE public.player_load_metrics ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "player_load_metrics_access" ON public.player_load_metrics;
CREATE POLICY "player_load_metrics_access" ON public.player_load_metrics
  FOR SELECT TO authenticated USING (
    player_id IN (
      SELECT id FROM public.players
      WHERE team_id IN (SELECT public.coach_team_ids())
    )
    OR player_id = public.my_player_id()
    OR public.is_staff()
  );

-- player_daily_load
ALTER TABLE public.player_daily_load ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "player_daily_load_access" ON public.player_daily_load;
CREATE POLICY "player_daily_load_access" ON public.player_daily_load
  FOR SELECT TO authenticated USING (
    player_id IN (
      SELECT id FROM public.players
      WHERE team_id IN (SELECT public.coach_team_ids())
    )
    OR player_id = public.my_player_id()
    OR public.is_staff()
  );

-- ============================================================
-- 7. TEMPLATES OG WORKOUT
-- ============================================================

-- microdose_template_variants
ALTER TABLE public.microdose_template_variants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "microdose_template_variants_read" ON public.microdose_template_variants;
CREATE POLICY "microdose_template_variants_read" ON public.microdose_template_variants
  FOR SELECT TO authenticated USING (true);

-- workout_template_map
ALTER TABLE public.workout_template_map ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "workout_template_map_read" ON public.workout_template_map;
CREATE POLICY "workout_template_map_read" ON public.workout_template_map
  FOR SELECT TO authenticated USING (true);

-- exercise_exceptions: uppflettitafla (exercise_name, rule) — engin player_id
ALTER TABLE public.exercise_exceptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "exercise_exceptions_read" ON public.exercise_exceptions;
CREATE POLICY "exercise_exceptions_read" ON public.exercise_exceptions
  FOR SELECT TO authenticated USING (true);

-- ============================================================
-- 8. CHECKIN TAGS
-- ============================================================

-- checkin_issue_tags
ALTER TABLE public.checkin_issue_tags ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "checkin_issue_tags_read" ON public.checkin_issue_tags;
CREATE POLICY "checkin_issue_tags_read" ON public.checkin_issue_tags
  FOR SELECT TO authenticated USING (true);

-- ============================================================
-- 9. PLAYER MICRODOSE PLAN LOCKS
-- ============================================================

ALTER TABLE public.player_microdose_plan_locks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "player_microdose_plan_locks_access" ON public.player_microdose_plan_locks;
CREATE POLICY "player_microdose_plan_locks_access" ON public.player_microdose_plan_locks
  FOR ALL TO authenticated USING (
    player_id = public.my_player_id()
    OR player_id IN (SELECT id FROM public.players WHERE team_id IN (SELECT public.coach_team_ids()))
    OR public.is_staff()
  ) WITH CHECK (
    player_id IN (SELECT id FROM public.players WHERE team_id IN (SELECT public.coach_team_ids()))
    OR public.is_staff()
  );

-- ============================================================
-- 10. TEAM INVITES
-- ============================================================

ALTER TABLE public.team_invites ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "team_invites_coach" ON public.team_invites;
CREATE POLICY "team_invites_coach" ON public.team_invites
  FOR ALL TO authenticated USING (
    team_id IN (SELECT public.coach_team_ids()) OR public.is_staff()
  ) WITH CHECK (
    team_id IN (SELECT public.coach_team_ids()) OR public.is_staff()
  );

-- ============================================================
-- LOKIÐ
-- ============================================================
