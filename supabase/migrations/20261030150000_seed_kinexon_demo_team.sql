-- Seed a "Demo – Kinexon" BASKETBALL demo team (de300004…) so clubs can see how
-- Kinexon Perform IMU data looks inside MicroPulse. Indoor, GPS-only (no check-in).
-- Values are synthetic but basketball-realistic (low distance, high jumps / IMA /
-- change-of-direction) and — unlike the Titan demos — Changes of Direction
-- (cod_events/ima_cod) and session_duration_minutes are populated, which is
-- Kinexon's differentiator.
--
-- source='catapult' is used so the existing load surfaces render it today; the
-- real integration will use source='kinexon' once that value is added to the
-- source filters (see docs/tasks/kinexon-ingestion-brief.md). Uses random(), so
-- re-running regenerates values — intended for a demo seed. Applied live 2026-10-31.

insert into teams (id,name,sport) values
 ('de300004-0000-4000-8000-000000000004','Demo – Kinexon','basketball')
on conflict (id) do update set name=excluded.name, sport='basketball';

insert into team_settings (team_id,sport_type,indoor_mode,uses_wellness_features,settings) values
 ('de300004-0000-4000-8000-000000000004','basketball',true,false,'{}'::jsonb)
on conflict (team_id) do update set uses_wellness_features=false, sport_type='basketball', indoor_mode=true;

with pos(rn,p) as (values (1,'PG'),(2,'SG'),(3,'SG'),(4,'SF'),(5,'SF'),(6,'PF'),
 (7,'PF'),(8,'C'),(9,'PG'),(10,'SG'),(11,'SF'),(12,'C'))
insert into players (id,full_name,team,position,is_active,team_id,sport)
select md5('de300004-0000-4000-8000-000000000004:'||rn)::uuid,'Player '||rn,'Demo – Kinexon',p,true,
       'de300004-0000-4000-8000-000000000004','basketball'
from pos
on conflict (id) do update set full_name=excluded.full_name,position=excluded.position,
  is_active=true,team_id=excluded.team_id,sport='basketball';

do $$
declare v_team uuid := 'de300004-0000-4000-8000-000000000004';
  d int; rn int; pid uuid;
  dur int; dist int; hsd int; spr int; mv numeric; acc int; dec int; b2a int; b2d int;
  ia int; id_ int; icod int; pl numeric; metp int; hmld int; jmp int; imp int; ahr int; mhr int;
begin
  delete from player_external_load_daily where team_id=v_team;
  for d in 1..42 loop
    if (d % 7) = 6 then continue; end if;
    for rn in 1..12 loop
      pid := md5(v_team::text||':'||rn)::uuid;
      dur := 60 + floor(random()*35)::int;  dist := 2200 + floor(random()*2300)::int;
      hsd := 40 + floor(random()*120)::int; spr := 10 + floor(random()*60)::int;
      mv := round((5.5 + random()*1.8)::numeric,2);
      acc := 40 + floor(random()*45)::int; dec := 40 + floor(random()*45)::int;
      b2a := 8 + floor(random()*14)::int;  b2d := 8 + floor(random()*14)::int;
      ia := 45 + floor(random()*35)::int;  id_ := 55 + floor(random()*35)::int; icod := 30 + floor(random()*50)::int;
      pl := round((420 + random()*380)::numeric,1);
      metp := 230 + floor(random()*70)::int; hmld := 120 + floor(random()*260)::int;
      jmp := 35 + floor(random()*85)::int;  imp := 180 + floor(random()*160)::int;
      ahr := 150 + floor(random()*26)::int; mhr := 184 + floor(random()*13)::int;
      insert into player_external_load_daily
        (player_id, team_id, date, source, session_duration_minutes,
         total_distance, high_speed_distance, hir_dist, sprint_distance,
         velocity_band5_total_distance, velocity_band6_total_distance, max_velocity, max_vel,
         accelerations, decelerations, tot_as, tot_ds, accel_b2_3_tot_effs_gen2, decel_b2_3_tot_effs_gen2,
         ima_accel, ima_decel, ima_cod, ima_total, cod_events,
         player_load, total_player_load, player_load_per_minute,
         metabolic_power, metabolic_power_peak, high_metabolic_load_distance_m,
         jumps, impacts, avg_heart_rate, max_heart_rate)
      values
        (pid, v_team, current_date - d, 'catapult', dur,
         dist, hsd, hsd+spr, spr, hsd, spr, mv, mv,
         acc, dec, acc, dec, b2a, b2d,
         ia, id_, icod, ia+id_+icod, icod,
         pl, pl, round((pl/dur)::numeric,1),
         metp, metp+300+floor(random()*100)::int, hmld,
         jmp, imp, ahr, mhr);
    end loop;
  end loop;
end $$;

-- recent games (basketball)
insert into match_schedule (id,team_id,match_date,kickoff_time,competition,opponent,is_home,goals_for,goals_against,is_friendly)
select md5('de300004:match:'||g.n)::uuid,'de300004-0000-4000-8000-000000000004'::uuid,current_date-g.days,
       time '19:15','Bónus deild',g.opp,g.home,g.gf,g.ga,false
from (values (1,2,'Demo Körfa',true,88,79),(2,9,'Sýni ÍF',false,74,81),(3,16,'Prufu BK',true,92,85)) g(n,days,opp,home,gf,ga)
on conflict (id) do nothing;

-- link to the demo (admin) account; refresh_demo_football_teams() (in
-- 20261030080151_seed_football_demo_teams.sql) already rolls de300004 forward daily.
insert into coach_teams (coach_id,team_id,is_primary) values
 ('ce8806d3-054d-41ad-a0d6-3d4e23c8ba18','de300004-0000-4000-8000-000000000004',false)
on conflict do nothing;
