-- Demo – Full (checkin) (de300001…): make its played matches real matches.
--
--   1. The load on the four played match days was a shifted copy of Breiðablik days that weren't
--      necessarily matches (14 Oct: every "90-minute" player ran 4.3-5.3 km), so the match unit and
--      everything built on it read low. Each player + played match now clones a real league match of
--      that player's source player, picked by the demo minutes already seeded, so minutes and load
--      agree. Rows must pass a sanity check (90-145 m/min, IMA present). Two source players have no
--      fitting match: Player 3 (none >=80 min) and Player 11 (none near 78 min) use the other left
--      winger's matches. Deterministic, so safe to re-run.
--   2. refresh_demo_full_checkins() moved the LATEST fixture to current_date - 2 every night. With
--      future fixtures in the calendar (20261106090000) that would pull 28 Nov back to 5 Nov tonight,
--      22 Nov the night after, and so on. It now only rolls a latest fixture that is already old.
--
-- Descriptive demo data only: never writes readiness_entries.color. Applied live 2026-11-06.
-- Only Demo – Full is touched. Identifiers of the real athlete are not copied.

create or replace function public.refresh_demo_full_checkins()
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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
  if v_latest is not null and v_latest < current_date - 2 then
    update match_player_minutes set match_date = current_date - 2 where team_id = v_demo and match_date = v_latest;
    update match_schedule       set match_date = current_date - 2 where team_id = v_demo and match_date = v_latest;
  end if;
  return v_count;
end $function$;

do $$
declare
  v_team uuid := 'de300001-0000-4000-8000-000000000001';
  v_breid uuid := '94b52a06-0b83-48da-8664-639ec3486a0c';
  v_cols text;
  r record;
begin
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position) into v_cols
  from information_schema.columns
  where table_schema = 'public' and table_name = 'player_external_load_daily' and is_generated = 'NEVER'
    and column_name not in ('player_id','team_id','date','created_at','updated_at','md_day_label','source_team_id','external_athlete_id');

  for r in
    with src(rn, donor) as (values
      (1,'d9f1e2a0-2d3a-4624-b5c3-6e1039a0723f'::uuid),(2,'d372a2ea-a0c4-4a0b-9492-e9f04a091975'),
      (3,'4a6d7211-e9ad-4ba5-a921-2829aea8eb5d'),(4,'02b6a94e-9386-496e-b3dc-7d7b989fb409'),
      (5,'90aef56f-1f6e-4c73-b00c-44369ec5d22d'),(6,'0eef76b8-1aed-4bb0-926d-528f0e8010bc'),
      (7,'f8196567-0329-4edb-ad81-ed4af8bd91a8'),(8,'65cb3004-0c06-4806-a9ff-28ee77d43fef'),
      (9,'6429def5-7816-47c3-bbd5-47b2fe822602'),(10,'b1eed779-69c6-4e46-9403-f2358cb2ac3d'),
      (11,'4a6d7211-e9ad-4ba5-a921-2829aea8eb5d'),(12,'73a1c9ec-2ba2-408a-9aed-ec6c523ed507'),
      (13,'c67e779a-e0e5-4428-9de5-3ec6e668c152'),(14,'4a6d7211-e9ad-4ba5-a921-2829aea8eb5d')
    ),
    demo as (
      select s.rn, s.donor, md5(v_team::text || ':' || s.rn)::uuid as pid from src s
    ),
    played as (
      select mm.player_id as pid, mm.match_date, mm.minutes_played as target,
             row_number() over (partition by mm.player_id order by mm.match_date) as k
      from match_player_minutes mm
      where mm.team_id = v_team and mm.match_date <= current_date
    ),
    cand as (
      select d.pid, l.date as src_date, l.source as src_source,
             row_number() over (partition by d.pid order by abs(mm.minutes_played - t.target), l.date desc) as i,
             count(*) over (partition by d.pid) as n
      from demo d
      join (select pid, max(target) as target from played group by 1) t on t.pid = d.pid
      join match_player_minutes mm on mm.player_id = d.donor and mm.team_id = v_breid and mm.minutes_played > 0
      join match_schedule s on s.team_id = v_breid and s.match_date = mm.match_date and coalesce(s.is_friendly, false) = false
      join player_external_load_daily l on l.player_id = d.donor and l.date = mm.match_date
      where l.ima_accel is not null
        and l.total_distance / mm.minutes_played between 90 and 145
        and case when t.target >= 80 then mm.minutes_played >= 80
                 else mm.minutes_played < 80 and abs(mm.minutes_played - t.target) <= 15 end
    )
    select p.pid, p.match_date, d.donor, c.src_date, c.src_source
    from played p
    join demo d on d.pid = p.pid
    join cand c on c.pid = p.pid and c.i = ((p.k - 1) % c.n) + 1
  loop
    delete from player_external_load_daily where player_id = r.pid and date = r.match_date;
    execute format(
      'insert into player_external_load_daily (player_id, team_id, date, md_day_label, %1$s)
       select %2$L::uuid, %3$L::uuid, %4$L::date, ''MD'', %1$s
       from player_external_load_daily where player_id = %5$L and date = %6$L and source = %7$L',
      v_cols, r.pid, v_team, r.match_date, r.donor, r.src_date, r.src_source);
  end loop;
end $$;
