-- Keep Demo – Kinexon (de300004) evergreen too. Like the GPS demo teams it has
-- no check-ins, so "evergreen" = sliding its external-load series forward so the
-- most recent session always lands on current_date. Rather than add a third cron
-- job, fold Kinexon into refresh_demo_gps_load() — it already slides exactly this
-- way for the other check-in-less load demos. The function now covers ALL three
-- load-only demo teams (GPS Pro, GPS Core, Kinexon); its daily cron
-- (refresh_demo_gps_load_daily, 03:10) is unchanged.
--
-- The two-step offset (+shift+100000 then -100000) still dodges the dense
-- (player_id,date,source) pkey collision a plain forward shift would cause.

create or replace function public.refresh_demo_gps_load()
returns void language plpgsql security definer set search_path = public as $$
declare v_team uuid; v_shift int;
  v_teams uuid[] := array[
    'de300002-0000-4000-8000-000000000002',  -- GPS Pro
    'de300003-0000-4000-8000-000000000003',  -- GPS Core
    'de300004-0000-4000-8000-000000000004'   -- Kinexon
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

-- Run once now so the Kinexon board is current immediately (the daily cron
-- already calls this function, so no schedule change is needed).
select public.refresh_demo_gps_load();
