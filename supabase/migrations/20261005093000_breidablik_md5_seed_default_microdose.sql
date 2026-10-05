-- The locker-room TV view defaults to the team's DEFAULT microdose_templates set, which had MD-4 but
-- no MD-5 — so MD-5 only showed if the coach manually switched to the Breidablik custom set. Clone the
-- team's MD-4 rows to MD-5 (early-week force day) in the default table so MD-5 appears by default too.
-- Idempotent (skips rows already present for the same readiness/variant/season_phase).
insert into microdose_templates (md_day, readiness_level, title, description, structure, variant, id, team_id, season_phase, structure_en)
select 'MD-5', t.readiness_level,
       case when t.title ilike 'MD-5%' then t.title else 'MD-5 (snemma í viku) · ' || coalesce(t.title, 'Force') end,
       t.description, t.structure, t.variant, gen_random_uuid(), t.team_id, t.season_phase, t.structure_en
from microdose_templates t
where t.team_id = '94b52a06-0b83-48da-8664-639ec3486a0c' and t.md_day = 'MD-4'
  and not exists (
    select 1 from microdose_templates x
    where x.team_id = t.team_id and x.md_day = 'MD-5'
      and x.readiness_level is not distinct from t.readiness_level
      and x.variant is not distinct from t.variant
      and x.season_phase is not distinct from t.season_phase
  );
