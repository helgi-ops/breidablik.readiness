-- Keep the GPS-only demo teams (Demo – GPS Pro de300002, Demo – GPS Core de300003)
-- evergreen. They have no check-ins, so "evergreen" = sliding their external-load
-- series forward so the most recent session always lands on current_date. The
-- whole series translates by one offset (ACWR shape preserved). A forward shift on
-- a dense (player_id,date,source) unique series collides mid-statement, so we do it
-- in two steps: push far future, then pull back the same amount.
-- Companion to refresh_demo_lite_checkins / refresh_demo_full_checkins.

create or replace function public.refresh_demo_gps_load()
returns void language plpgsql security definer set search_path = public as $$
declare v_team uuid; v_shift int;
  v_teams uuid[] := array[
    'de300002-0000-4000-8000-000000000002',  -- GPS Pro
    'de300003-0000-4000-8000-000000000003'   -- GPS Core
  ];
begin
  foreach v_team in array v_teams loop
    select current_date - max(date) into v_shift
      from player_external_load_daily where team_id = v_team;
    if v_shift is not null and v_shift > 0 then
      update player_external_load_daily set date = date + v_shift + 100000 where team_id = v_team;
      update player_external_load_daily set date = date - 100000 where team_id = v_team;
    end if;
  end loop;
end $$;

-- Daily at 03:10 (after the check-in refreshes). cron.schedule upserts by name.
select cron.schedule('refresh_demo_gps_load_daily', '10 3 * * *', 'select public.refresh_demo_gps_load()');

-- Run once now so both boards are current immediately.
select public.refresh_demo_gps_load();
