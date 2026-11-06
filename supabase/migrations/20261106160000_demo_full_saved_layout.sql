-- Demo – Full (checkin) (de300001…): replace the saved day layout that carried the Mixed filler.
--
-- The hub seeded its day grid from a Sat/Sun layout that ignored the team's fixtures, and those days then
-- read as forced-on Mixed days (five in the week of 12 Oct). The block auto-saved that at 12:29 UTC today,
-- so the saved rows would keep it even with the seed fixed in seedBlockDays. These rows are what the fixed
-- planner produces for the team's two competitive blocks.
--
-- Leaves the week of 2 Nov alone (the course weekend: MD-1 Activation on 7 Nov, match on 8 Nov) and every
-- GAME row. Descriptive planning, never readiness_entries.color. Applied live 2026-11-06.

insert into week_plans (team_id, week_start, day_date, day_index, day_type, focus, planned_load, system_key, notes, day_intent)
select 'de300001-0000-4000-8000-000000000001'::uuid, v.week_start, v.day_date, v.day_index, v.day_type, v.focus, v.planned_load, 'POWER', null, v.day_intent
from (values
  ('2026-10-12'::date, '2026-10-12'::date, 1, 'TRAIN', 'MD-2 Mixed', 6, null),
  ('2026-10-12'::date, '2026-10-13'::date, 2, 'OFF', 'MD-1', 1, 'OFF'),
  ('2026-10-12'::date, '2026-10-15'::date, 4, 'TRAIN', 'MD+1 Top-up', 6, null),
  ('2026-10-12'::date, '2026-10-16'::date, 5, 'OFF', 'MD+2', 1, 'OFF'),
  ('2026-10-12'::date, '2026-10-17'::date, 6, 'TRAIN', 'MD-4 Locomotive', 6, null),
  ('2026-10-12'::date, '2026-10-18'::date, 7, 'TRAIN', 'MD-3 Mixed', 6, null),
  ('2026-10-19'::date, '2026-10-19'::date, 1, 'OFF', 'MD-2', 1, 'OFF'),
  ('2026-10-19'::date, '2026-10-20'::date, 2, 'TRAIN', 'MD-1 Activation', 6, null),
  ('2026-10-19'::date, '2026-10-22'::date, 4, 'TRAIN', 'MD+1 Top-up', 6, null),
  ('2026-10-19'::date, '2026-10-23'::date, 5, 'OFF', 'MD+2', 1, 'OFF'),
  ('2026-10-19'::date, '2026-10-24'::date, 6, 'OFF', 'MD-6', 1, 'OFF'),
  ('2026-10-19'::date, '2026-10-25'::date, 7, 'TRAIN', 'MD-5 Mechanical', 6, null),
  ('2026-10-26'::date, '2026-10-26'::date, 1, 'TRAIN', 'MD-4 Locomotive', 6, null),
  ('2026-10-26'::date, '2026-10-27'::date, 2, 'TRAIN', 'MD-3 Mixed', 6, null),
  ('2026-10-26'::date, '2026-10-28'::date, 3, 'OFF', 'MD-2', 1, 'OFF'),
  ('2026-10-26'::date, '2026-10-29'::date, 4, 'TRAIN', 'MD-1 Activation', 6, null),
  ('2026-10-26'::date, '2026-10-31'::date, 6, 'TRAIN', 'MD+1 Top-up', 6, null),
  ('2026-10-26'::date, '2026-11-01'::date, 7, 'OFF', 'MD+2', 1, 'OFF'),
  ('2026-11-09'::date, '2026-11-09'::date, 1, 'TRAIN', 'MD+1 Top-up', 6, null),
  ('2026-11-09'::date, '2026-11-10'::date, 2, 'OFF', 'MD+2', 1, 'OFF'),
  ('2026-11-09'::date, '2026-11-11'::date, 3, 'TRAIN', 'MD-3 Locomotive', 6, null),
  ('2026-11-09'::date, '2026-11-12'::date, 4, 'TRAIN', 'MD-2 Mixed', 6, null),
  ('2026-11-09'::date, '2026-11-13'::date, 5, 'OFF', 'MD-1', 1, 'OFF'),
  ('2026-11-09'::date, '2026-11-15'::date, 7, 'TRAIN', 'MD+1 Top-up', 6, null),
  ('2026-11-16'::date, '2026-11-16'::date, 1, 'OFF', 'MD+2', 1, 'OFF'),
  ('2026-11-16'::date, '2026-11-17'::date, 2, 'OFF', 'MD-1', 1, 'OFF'),
  ('2026-11-16'::date, '2026-11-19'::date, 4, 'TRAIN', 'MD+1 Top-up', 6, null),
  ('2026-11-16'::date, '2026-11-20'::date, 5, 'OFF', 'MD+2', 1, 'OFF'),
  ('2026-11-16'::date, '2026-11-21'::date, 6, 'OFF', 'MD-1', 1, 'OFF'),
  ('2026-11-23'::date, '2026-11-23'::date, 1, 'TRAIN', 'MD+1 Top-up', 6, null),
  ('2026-11-23'::date, '2026-11-24'::date, 2, 'OFF', 'MD+2', 1, 'OFF'),
  ('2026-11-23'::date, '2026-11-25'::date, 3, 'TRAIN', 'MD-3 Locomotive', 6, null),
  ('2026-11-23'::date, '2026-11-26'::date, 4, 'TRAIN', 'MD-2 Mixed', 6, null),
  ('2026-11-23'::date, '2026-11-27'::date, 5, 'OFF', 'MD-1', 1, 'OFF'),
  ('2026-11-23'::date, '2026-11-29'::date, 7, 'TRAIN', 'MD+1 Top-up', 6, null)
) v(week_start, day_date, day_index, day_type, focus, planned_load, day_intent)
on conflict (team_id, day_date) do update set
  week_start = excluded.week_start, day_index = excluded.day_index, day_type = excluded.day_type, focus = excluded.focus,
  planned_load = excluded.planned_load, system_key = excluded.system_key, day_intent = excluded.day_intent;

update week_setups set system_key = 'POWER', intensity_target = 5
where team_id = 'de300001-0000-4000-8000-000000000001'::uuid and week_start in (select w from (values ('2026-10-12'::date), ('2026-10-19'::date), ('2026-10-26'::date), ('2026-11-09'::date), ('2026-11-16'::date), ('2026-11-23'::date)) x(w));

-- The week's GAME rows carry its system too.
update week_plans set system_key = 'POWER'
where team_id = 'de300001-0000-4000-8000-000000000001'::uuid and day_type = 'GAME'
  and day_date in ('2026-10-14', '2026-10-21', '2026-10-30', '2026-11-14', '2026-11-18', '2026-11-22', '2026-11-28');
