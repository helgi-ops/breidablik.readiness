-- Keep the "MicroPulse Sýnislið (Lite)" demo team's daily readiness check-ins
-- current, so the Today Command Center / Decision Summary always have today's
-- data for prospect demos. The demo has no real players submitting check-ins, so
-- without this its readiness goes stale at the clone date.
--
-- Idempotent: for each active demo player WITHOUT a check-in today, copy their
-- most recent prior entry's wellness fields to today. The readiness_entries
-- BEFORE-INSERT trigger (mp_apply_hybrid_readiness) recomputes the colour against
-- the player's own baseline, so the squad shows a realistic green/yellow/red mix.
-- (stage4 decisions are bootstrapped on dashboard view, so they are not seeded here.)
--
-- Demo team_id: 02bab8e8-3cba-4f2e-bf3f-050fa8f1ad89  (see memory: demo-lite-team)

create or replace function public.refresh_demo_lite_checkins()
returns integer language plpgsql security definer set search_path = public as $$
declare v_count int;
begin
  insert into readiness_entries (
    player_id, team_id, entry_date, readiness, sleep, soreness, total_score,
    fatigue_energy, sleep_quality, sleep_duration, stress_mood, muscle_soreness, is_imputed
  )
  select distinct on (re.player_id)
    re.player_id, '02bab8e8-3cba-4f2e-bf3f-050fa8f1ad89'::uuid, current_date,
    re.readiness, re.sleep, re.soreness, re.total_score,
    re.fatigue_energy, re.sleep_quality, re.sleep_duration, re.stress_mood, re.muscle_soreness, false
  from readiness_entries re
  join players p on p.id = re.player_id
  where re.team_id = '02bab8e8-3cba-4f2e-bf3f-050fa8f1ad89'
    and p.team_id  = '02bab8e8-3cba-4f2e-bf3f-050fa8f1ad89' and p.is_active
    and re.entry_date < current_date
    and not exists (select 1 from readiness_entries x where x.player_id = re.player_id and x.entry_date = current_date)
  order by re.player_id, re.entry_date desc;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- Daily at 03:00. cron.schedule upserts by job name, so this is re-runnable.
select cron.schedule('refresh_demo_lite_checkins_daily', '0 3 * * *', 'select public.refresh_demo_lite_checkins()');
