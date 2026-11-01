-- Keep Demo – Kinexon's latest match in the MD+1 recovery window so the
-- post-match-recovery board demonstrates (its Kinexon external load now feeds the
-- MD+1 mechanical dose). refresh_demo_gps_load already slides the three load demo
-- teams' external-load series forward; extend it to also roll the Kinexon demo's
-- most recent match to current_date - 1 (mirrors refresh_demo_full_checkins'
-- match roll). Demo – Kinexon has no hand-entered minutes, so the board's
-- session-duration fallback marks appearances from the match-day Kinexon load.

create or replace function public.refresh_demo_gps_load()
returns void language plpgsql security definer set search_path = public as $$
declare v_team uuid; v_shift int;
  v_teams uuid[] := array[
    'de300002-0000-4000-8000-000000000002',  -- GPS Pro
    'de300003-0000-4000-8000-000000000003',  -- GPS Core
    'de300004-0000-4000-8000-000000000004'   -- Kinexon
  ];
  v_kx uuid := 'de300004-0000-4000-8000-000000000004';
  v_latest date;
begin
  foreach v_team in array v_teams loop
    select current_date - max(date) into v_shift
      from player_external_load_daily where team_id = v_team;
    if v_shift is not null and v_shift > 0 then
      update player_external_load_daily set date = date + v_shift + 100000 where team_id = v_team;
      update player_external_load_daily set date = date - 100000 where team_id = v_team;
    end if;
  end loop;

  -- Roll the Kinexon demo's most recent match to MD+1 (yesterday).
  select max(match_date) into v_latest from match_schedule where team_id = v_kx;
  if v_latest is not null and v_latest <> current_date - 1 then
    update match_player_minutes set match_date = current_date - 1 where team_id = v_kx and match_date = v_latest;
    update match_schedule       set match_date = current_date - 1 where team_id = v_kx and match_date = v_latest;
  end if;
end $$;

select public.refresh_demo_gps_load();
