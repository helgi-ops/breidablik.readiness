-- Keep the "MicroPulse Sýnislið (Lite)" demo team evergreen for prospect demos.
-- The demo has no real players, so without this its readiness goes stale at the
-- clone date (Today Command Center / Decision Summary show "no check-in today")
-- and its last match drifts far past the recovery window (post-match recovery +
-- recovery-watch surfaces would evaluate at MD+10 instead of MD+1/MD+2).
--
-- Daily this function:
--   1. Seeds today's check-ins — idempotent, copies each active demo player's most
--      recent wellness fields to current_date; the readiness BEFORE-INSERT trigger
--      (mp_apply_hybrid_readiness) recomputes the colour against the player's own
--      baseline, so the squad shows a realistic green/yellow/red mix.
--   2. Rolls the demo's most recent match to current_date - 2, so the post-match
--      recovery board + recovery watch always sit in the MD+1/MD+2 window.
-- (stage4 decisions are bootstrapped on dashboard view, so not seeded here.)
--
-- Demo team_id: 02bab8e8-3cba-4f2e-bf3f-050fa8f1ad89  (see memory: demo-lite-team)

create or replace function public.refresh_demo_lite_checkins()
returns integer language plpgsql security definer set search_path = public as $$
declare v_count int; v_demo uuid := '02bab8e8-3cba-4f2e-bf3f-050fa8f1ad89'; v_latest date;
begin
  insert into readiness_entries (
    player_id, team_id, entry_date, readiness, sleep, soreness, total_score,
    fatigue_energy, sleep_quality, sleep_duration, stress_mood, muscle_soreness, is_imputed
  )
  select distinct on (re.player_id)
    re.player_id, v_demo, current_date,
    re.readiness, re.sleep, re.soreness, re.total_score,
    re.fatigue_energy, re.sleep_quality, re.sleep_duration, re.stress_mood, re.muscle_soreness, false
  from readiness_entries re
  join players p on p.id = re.player_id
  where re.team_id = v_demo and p.team_id = v_demo and p.is_active
    and re.entry_date < current_date
    and not exists (select 1 from readiness_entries x where x.player_id = re.player_id and x.entry_date = current_date)
  order by re.player_id, re.entry_date desc;
  get diagnostics v_count = row_count;

  select max(match_date) into v_latest from match_schedule where team_id = v_demo;
  if v_latest is not null and v_latest <> current_date - 2 then
    update match_player_minutes set match_date = current_date - 2 where team_id = v_demo and match_date = v_latest;
    update match_schedule       set match_date = current_date - 2 where team_id = v_demo and match_date = v_latest;
  end if;
  return v_count;
end $$;

-- Daily at 03:00. cron.schedule upserts by job name, so this is re-runnable.
select cron.schedule('refresh_demo_lite_checkins_daily', '0 3 * * *', 'select public.refresh_demo_lite_checkins()');
