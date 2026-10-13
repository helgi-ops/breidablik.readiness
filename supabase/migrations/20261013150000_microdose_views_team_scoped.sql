-- Flag (a): close the team-blind microdose_templates joins in the microdose view chain.
--
-- microdose_templates holds ONLY Breiðablik's rows, and several views LEFT JOIN it with no
-- team predicate, so their plan_title/description/structure resolve to Breiðablik's content
-- for EVERY team. The app is safe today only because its live readers (PlayerClient) ignore
-- these plan_* columns and re-resolve team-scoped; this removes the latent landmine at the DB.
--
-- Two moves:
--  1. DROP three views that have NO readers (src), NO view/matview dependents, and NO function
--     references — dead surfaces that only existed to leak. Dropping removes the leak outright.
--  2. Team-scope the microdose_templates joins in the three live/chain views, keeping each view's
--     OUTPUT COLUMNS identical (name/type/order) so CREATE OR REPLACE succeeds and every dependent
--     (v_player_today_fix_modules, v_coach_display_templates_today_week, v_player_today_microdose_resolved_v2,
--      v_coach_plan_preview_today, v_player_plan_today_locked_v2, v_player_microdose_plan_today_locked)
--     stays valid and inherits the fix.
--
-- A non-Breiðablik player/coach now gets NULL plan_* (empty until their coach authors a programme —
-- the 2026-07 all-teams-isolation decision); Breiðablik is unchanged. md_day/readiness are untouched.
-- all_microdose_templates is intentionally left as-is (it carries team_id + a global UNION, not a
-- silent leak). See memory custom-microdose-templates / programme-library-hub.

-- ── 1. Drop the dead leaking views ──────────────────────────────────────────────
drop view if exists public.v_player_microdose_plan;
drop view if exists public.v_coach_display_templates_today;
drop view if exists public.v_player_today_microdose_locked;

-- ── 2a. Root: v_player_microdose_plan_today — scope the mt + GENERIC-fallback joins ──
create or replace view public.v_player_microdose_plan_today as
 WITH me AS (
         SELECT pr.id AS user_id,
            pr.player_id,
            pl.team_id
           FROM profiles pr
             JOIN players pl ON pl.id = pr.player_id
          WHERE pr.id = auth.uid() AND pr.player_id IS NOT NULL
        ), today AS (
         SELECT CURRENT_DATE AS day_date
        ), re_score AS (
         SELECT re.player_id,
            re.entry_date,
            score_to_readiness_level(re.total_score::numeric) AS readiness_level
           FROM readiness_entries re
             JOIN me ON me.player_id = re.player_id
             JOIN today t ON t.day_date = re.entry_date
        ), picked AS (
         SELECT me.player_id,
            me.team_id,
            t.day_date AS entry_date,
            COALESCE(re_score.readiness_level, 'GREEN'::text) AS readiness_level,
            get_md_day_for_team_date(me.team_id, t.day_date) AS md_day
           FROM me
             CROSS JOIN today t
             LEFT JOIN re_score ON re_score.player_id = me.player_id AND re_score.entry_date = t.day_date
        ), templ AS (
         SELECT p.player_id,
            p.team_id,
            p.entry_date,
            p.readiness_level,
            p.md_day,
            mt.title,
            mt.description,
            mt.structure
           FROM picked p
             LEFT JOIN microdose_templates mt ON mt.md_day = p.md_day AND mt.readiness_level = p.readiness_level AND mt.team_id = p.team_id
        ), fallback AS (
         SELECT t.player_id,
            t.entry_date,
            t.readiness_level,
            t.md_day,
            COALESCE(t.title, mt2.title) AS plan_title,
            COALESCE(t.description, mt2.description) AS plan_description,
            COALESCE(t.structure, mt2.structure) AS plan_structure
           FROM templ t
             LEFT JOIN microdose_templates mt2 ON mt2.md_day = 'GENERIC'::text AND mt2.readiness_level = t.readiness_level AND mt2.team_id = t.team_id
        )
 SELECT player_id,
    entry_date,
    readiness_level,
    md_day,
    plan_title,
    plan_description,
    plan_structure
   FROM fallback;

-- ── 2b. v_player_today_microdose_final — scope the template (t) join ──
create or replace view public.v_player_today_microdose_final as
 WITH d AS (
         SELECT v.player_id,
            v.day_date AS entry_date,
            v.team_id,
            v.planned_focus,
            v.final_planned_day_type,
            v.readiness_flag,
            ( SELECT min(ms.match_date - v.day_date) AS min
                   FROM match_schedule ms
                  WHERE ms.team_id = v.team_id AND ms.match_date >= v.day_date) AS days_to_match,
            ( SELECT min(v.day_date - ms.match_date) AS min
                   FROM match_schedule ms
                  WHERE ms.team_id = v.team_id AND ms.match_date < v.day_date) AS days_since_match
           FROM v_player_daily_decision_v3 v
        ), resolved AS (
         SELECT d.player_id,
            d.entry_date,
            d.team_id,
            d.planned_focus,
            d.final_planned_day_type,
            d.readiness_flag,
                CASE
                    WHEN COALESCE(d.planned_focus, ''::text) ~~* '%MD-5%'::text THEN 'MD-5'::text
                    WHEN COALESCE(d.planned_focus, ''::text) ~~* '%MD+3%'::text THEN 'MD+3'::text
                    WHEN COALESCE(d.planned_focus, ''::text) ~~* '%MD+2%'::text THEN 'MD+2'::text
                    WHEN COALESCE(d.planned_focus, ''::text) ~~* '%MD+1%'::text THEN 'MD+1'::text
                    WHEN d.days_since_match IS NOT NULL AND d.days_since_match >= 1 AND d.days_since_match <= 3 AND (d.days_to_match IS NULL OR d.days_to_match > 5) THEN 'MD+'::text || d.days_since_match::text
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
            microdose_templates.team_id,
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
            WHEN COALESCE(l.lock_md_day, r.md_day_resolved) = 'MD+2'::text THEN 'POLISH_CALM'::text
            WHEN COALESCE(l.lock_md_day, r.md_day_resolved) = 'MD+3'::text THEN 'POLISH_CALM'::text
            ELSE 'POLISH_CALM'::text
        END AS training_system,
    COALESCE(l.lock_plan_title, t.template_title) AS plan_title,
    COALESCE(l.lock_plan_description, t.template_description) AS plan_description,
    COALESCE(l.lock_plan_structure, t.template_structure) AS plan_structure,
    l.locked_at,
    l.locked_at IS NOT NULL AS is_locked
   FROM resolved r
     LEFT JOIN l ON l.player_id = r.player_id AND l.entry_date = r.entry_date
     LEFT JOIN t ON t.md_day = COALESCE(l.lock_md_day, r.md_day_resolved) AND t.template_readiness_level = r.readiness_resolved AND t.team_id = r.team_id;

-- ── 2c. v_player_today_microdose_resolved — scope the tbase template join ──
-- Only the tbase ON clause gains a team predicate (authoritative player team via players);
-- everything else is reproduced verbatim. plan_*_raw is already team-safe once the root above
-- is scoped. vdef (variant letter only, not plan content) is intentionally left unscoped.
create or replace view public.v_player_today_microdose_resolved as
 WITH r AS (
         SELECT v.player_id,
            v.entry_date,
            v.readiness_level,
            COALESCE(NULLIF(v.md_day, ''::text), 'GENERIC'::text) AS md_day_raw,
            v.plan_title AS plan_title_raw,
            v.plan_description AS plan_description_raw,
            v.plan_structure AS plan_structure_raw,
            v.locked_at,
            v.is_locked
           FROM v_player_microdose_plan_today_locked v
        ), d AS (
         SELECT x.player_id,
            x.day_date,
            x.planned_focus,
            x.final_planned_day_type,
            x.readiness_flag
           FROM v_player_daily_decision_v3 x
        ), resolved AS (
         SELECT r.player_id,
            r.entry_date,
            r.readiness_level,
            r.md_day_raw,
            r.plan_title_raw,
            r.plan_description_raw,
            r.plan_structure_raw,
            r.locked_at,
            r.is_locked,
            d.planned_focus,
            d.final_planned_day_type,
            d.readiness_flag,
                CASE
                    WHEN (upper(COALESCE(d.final_planned_day_type, ''::text)) = ANY (ARRAY['GAME'::text, 'MATCH'::text])) OR (upper(COALESCE(d.planned_focus, ''::text)) = ANY (ARRAY['GAME'::text, 'MATCH'::text, 'MD'::text, 'MD (GAME)'::text, 'MD(GAME)'::text])) THEN 'MD'::text
                    WHEN upper(COALESCE(d.planned_focus, ''::text)) ~~ 'MD+1%'::text THEN 'MD+1'::text
                    WHEN upper(COALESCE(d.final_planned_day_type, ''::text)) = ANY (ARRAY['OFF'::text, 'REST'::text]) THEN 'OFF'::text
                    WHEN upper(COALESCE(d.planned_focus, ''::text)) = 'ACTIVATION'::text THEN 'MD-1'::text
                    WHEN upper(COALESCE(d.final_planned_day_type, ''::text)) = 'RECOVERY'::text THEN 'MD-2'::text
                    WHEN upper(COALESCE(d.planned_focus, ''::text)) = ANY (ARRAY['POLISH / CALM'::text, 'POLISH_CALM'::text]) THEN 'MD-2'::text
                    WHEN upper(COALESCE(d.planned_focus, ''::text)) = ANY (ARRAY['NEURAL / VELOCITY'::text, 'NEURAL/VELOCITY'::text, 'NEURAL_VELOCITY'::text]) THEN 'MD-3'::text
                    WHEN upper(COALESCE(d.planned_focus, ''::text)) = 'FORCE'::text THEN 'MD-4'::text
                    ELSE r.md_day_raw
                END AS md_day_resolved,
                CASE
                    WHEN upper(COALESCE(r.readiness_level, ''::text)) = ANY (ARRAY['RED'::text, 'YELLOW'::text, 'GREEN'::text, 'GREEN_PLUS'::text]) THEN upper(r.readiness_level)
                    WHEN upper(COALESCE(d.readiness_flag, ''::text)) = ANY (ARRAY['RED'::text, 'YELLOW'::text, 'GREEN'::text, 'GREEN_PLUS'::text]) THEN upper(d.readiness_flag)
                    ELSE 'YELLOW'::text
                END AS readiness_resolved
           FROM r
             LEFT JOIN d ON d.player_id = r.player_id AND d.day_date = r.entry_date
        ), picked AS (
         SELECT res.player_id,
            res.entry_date,
            res.readiness_level,
            res.md_day_raw,
            res.plan_title_raw,
            res.plan_description_raw,
            res.plan_structure_raw,
            res.locked_at,
            res.is_locked,
            res.planned_focus,
            res.final_planned_day_type,
            res.readiness_flag,
            res.md_day_resolved,
            res.readiness_resolved,
            md.decision_id,
            md.team_id,
            md.chosen_variant_id,
            md.locked AS decision_locked,
            md.source AS decision_source,
            md.confidence AS decision_confidence,
            md.why AS decision_why,
            md.inputs AS decision_inputs
           FROM resolved res
             LEFT JOIN ( SELECT m.id AS decision_id,
                    m.team_id,
                    m.player_id,
                    m.entry_date,
                    m.md_day AS md_day_decision,
                    m.readiness_level AS readiness_level_decision,
                    m.chosen_variant_id,
                    m.locked,
                    m.source,
                    m.confidence,
                    m.why,
                    m.inputs
                   FROM microdose_decisions m) md ON md.player_id = res.player_id AND md.entry_date = res.entry_date
        ), vpick AS (
         SELECT p.player_id,
            p.entry_date,
            p.readiness_level,
            p.md_day_raw,
            p.plan_title_raw,
            p.plan_description_raw,
            p.plan_structure_raw,
            p.locked_at,
            p.is_locked,
            p.planned_focus,
            p.final_planned_day_type,
            p.readiness_flag,
            p.md_day_resolved,
            p.readiness_resolved,
            p.decision_id,
            p.team_id,
            p.chosen_variant_id,
            p.decision_locked,
            p.decision_source,
            p.decision_confidence,
            p.decision_why,
            p.decision_inputs,
            COALESCE(vsel.id, vdef.id) AS variant_id,
            COALESCE(vsel.variant, vdef.variant) AS variant_letter,
            COALESCE(tbase.title, p.plan_title_raw) AS plan_title_final,
            COALESCE(tbase.description, p.plan_description_raw) AS plan_description_final,
            COALESCE(tbase.structure, p.plan_structure_raw) AS plan_structure_final
           FROM picked p
             LEFT JOIN microdose_templates tbase ON tbase.md_day = p.md_day_resolved AND tbase.readiness_level = p.readiness_resolved AND upper(COALESCE(tbase.variant, 'A'::text)) = 'A'::text AND tbase.team_id = ( SELECT pl.team_id FROM players pl WHERE pl.id = p.player_id)
             LEFT JOIN microdose_template_variants vsel ON vsel.id = p.chosen_variant_id
             LEFT JOIN microdose_template_variants vdef ON vdef.md_day = p.md_day_resolved AND vdef.readiness_level = p.readiness_resolved AND upper(vdef.variant) = 'A'::text
        )
 SELECT player_id,
    entry_date,
    readiness_level,
    md_day_raw,
    planned_focus,
    final_planned_day_type,
    readiness_flag,
    md_day_resolved,
    readiness_resolved,
        CASE
            WHEN md_day_resolved = 'MD-4'::text THEN 'FORCE'::text
            WHEN md_day_resolved = 'MD-3'::text THEN 'NEURAL_VELOCITY'::text
            WHEN md_day_resolved = 'MD-2'::text THEN 'POLISH_CALM'::text
            WHEN md_day_resolved = 'MD-1'::text THEN 'ACTIVATION_PRIMER'::text
            WHEN md_day_resolved = 'MD+1'::text THEN 'POLISH_CALM'::text
            WHEN md_day_resolved = 'MD'::text THEN 'POLISH_CALM'::text
            WHEN md_day_resolved = 'OFF'::text THEN 'OFF'::text
            ELSE 'POLISH_CALM'::text
        END AS training_system,
    decision_id,
    team_id,
    chosen_variant_id,
    decision_locked AS locked,
    decision_source AS source,
    decision_confidence AS confidence,
    decision_why AS why,
    decision_inputs AS inputs,
    variant_id,
    variant_letter AS variant,
    plan_title_final AS plan_title,
    plan_description_final AS plan_description,
    plan_structure_final AS plan_structure,
    locked_at,
    is_locked
   FROM vpick;
