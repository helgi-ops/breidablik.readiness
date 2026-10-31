-- Keep the "Demo – Full (checkin)" football demo team evergreen for prospect
-- demos, exactly like refresh_demo_lite_checkins does for the Lite team. The
-- demo has no real players logging in, so without this its readiness goes stale
-- at the seed date and the coach Today board shows "most recent check-in (<old
-- date>)" (the carry-forward note) instead of a live, current-day board.
--
-- Daily this function:
--   1. Seeds today's check-ins — idempotent, copies each active demo player's
--      most recent wellness fields to current_date; the readiness BEFORE-INSERT
--      trigger (mp_apply_hybrid_readiness) recomputes the colour against the
--      player's own baseline, so the squad shows a realistic green/yellow/red mix.
--   2. Rolls the demo's most recent match to current_date - 2, so the post-match
--      recovery board + recovery watch always sit in the MD+1/MD+2 window.
-- (stage4 decisions are bootstrapped on dashboard view, so not seeded here.)
--
-- Demo team_id: de300001-0000-4000-8000-000000000001  (see memory: gps-only-load-today)
-- Mirrors: 20260624120000_refresh_demo_lite_checkins.sql

create or replace function public.refresh_demo_full_checkins()
returns integer language plpgsql security definer set search_path = public as $$
declare v_count int; v_demo uuid := 'de300001-0000-4000-8000-000000000001'; v_latest date;
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

-- Daily at 03:05 (05 min after the Lite refresh). cron.schedule upserts by job
-- name, so this is re-runnable.
select cron.schedule('refresh_demo_full_checkins_daily', '5 3 * * *', 'select public.refresh_demo_full_checkins()');

-- Run once now so the board is live immediately, not only after the next 03:05.
select public.refresh_demo_full_checkins();
