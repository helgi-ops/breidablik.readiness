-- Dedicated maximal-effort running-test store (CS/D' anchors).
-- Descriptive test data. Kept SEPARATE from player_load_peak_period so the MII power
-- curve stays monotonic (these maximal 4-min efforts exceed incidental MII peaks).
-- Distance recorded AS-IS (coach: the distance is the true 4-min running distance; the
-- period-tag time varied 3:55-4:50 only because of when the Catapult marker was started).
create table if not exists public.player_running_test (
  id            uuid primary key default gen_random_uuid(),
  player_id     uuid not null references public.players(id) on delete cascade,
  team_id       uuid not null,
  test_date     date not null,
  test_name     text not null,
  duration_s    integer not null,
  distance_m    numeric not null,
  speed_m_per_min numeric,
  source        text not null default 'catapult_run_test_4min',
  notes         text,
  created_at    timestamptz not null default now(),
  unique (player_id, test_date, test_name, source)
);
alter table public.player_running_test enable row level security;

create policy player_running_test_coach_read_team on public.player_running_test
  for select using (exists (select 1 from profiles pr
    where pr.id = auth.uid()
      and lower(coalesce(pr.role,'')) = any (array['coach','admin','staff'])
      and (lower(coalesce(pr.role,'')) = 'admin'
        or pr.team_id = player_running_test.team_id
        or player_running_test.team_id in (select ct.team_id from coach_teams ct where ct.coach_id = auth.uid()))));

create policy player_running_test_player_select_own on public.player_running_test
  for select using (exists (select 1 from players p where p.id = player_running_test.player_id and p.user_id = auth.uid())
    or exists (select 1 from profiles pr where pr.id = auth.uid() and pr.player_id = player_running_test.player_id));

insert into public.player_running_test (player_id, team_id, test_date, test_name, duration_s, distance_m, speed_m_per_min, source, notes) values
  ('b1eed779-69c6-4e46-9403-f2358cb2ac3d','94b52a06-0b83-48da-8664-639ec3486a0c','2026-08-17','4 min running (max)',240,1181.6,295.4,'catapult_run_test_4min','Best 4-min running effort, distance recorded as-is (coach: distance correct; period-tag time 4:50 is a marker-start artifact). Period 4 mín Running Drill 2.'),
  ('2219c614-dc43-4f99-8976-209b79984f00','94b52a06-0b83-48da-8664-639ec3486a0c','2026-08-17','4 min running (max)',240,1171.1,292.8,'catapult_run_test_4min','Best 4-min running effort, distance recorded as-is (coach: distance correct; period-tag time 4:50 is a marker-start artifact). Period 4 mín Running Drill 2.'),
  ('d24149e4-7ca3-429d-83a1-39e3cc813f7a','94b52a06-0b83-48da-8664-639ec3486a0c','2026-08-17','4 min running (max)',240,1159.7,289.9,'catapult_run_test_4min','Best 4-min running effort, distance recorded as-is (coach: distance correct; period-tag time 4:50 is a marker-start artifact). Period 4 mín Running Drill 2.'),
  ('debd8c5d-a70f-4d2a-a274-72dabf349010','94b52a06-0b83-48da-8664-639ec3486a0c','2026-08-17','4 min running (max)',240,1150.5,287.6,'catapult_run_test_4min','Best 4-min running effort, distance recorded as-is (coach: distance correct; period-tag time 4:50 is a marker-start artifact). Period 4 mín Running Drill 2.'),
  ('67ebee97-2194-4edd-adfc-389636001860','94b52a06-0b83-48da-8664-639ec3486a0c','2026-08-17','4 min running (max)',240,1150.4,287.6,'catapult_run_test_4min','Best 4-min running effort, distance recorded as-is (coach: distance correct; period-tag time 4:18 is a marker-start artifact). Period 4 min Running.'),
  ('0eef76b8-1aed-4bb0-926d-528f0e8010bc','94b52a06-0b83-48da-8664-639ec3486a0c','2026-08-17','4 min running (max)',240,1138.9,284.7,'catapult_run_test_4min','Best 4-min running effort, distance recorded as-is (coach: distance correct; period-tag time 4:50 is a marker-start artifact). Period 4 mín Running Drill 2.'),
  ('728189a0-17e5-4755-a85f-2bec18193a11','94b52a06-0b83-48da-8664-639ec3486a0c','2026-08-17','4 min running (max)',240,1134.0,283.5,'catapult_run_test_4min','Best 4-min running effort, distance recorded as-is (coach: distance correct; period-tag time 4:13 is a marker-start artifact). Period 4 Mín Running 1.'),
  ('d372a2ea-a0c4-4a0b-9492-e9f04a091975','94b52a06-0b83-48da-8664-639ec3486a0c','2026-08-17','4 min running (max)',240,1117.2,279.3,'catapult_run_test_4min','Best 4-min running effort, distance recorded as-is (coach: distance correct; period-tag time 4:23 is a marker-start artifact). Period 4 min Running.'),
  ('65cb3004-0c06-4806-a9ff-28ee77d43fef','94b52a06-0b83-48da-8664-639ec3486a0c','2026-08-17','4 min running (max)',240,1105.4,276.4,'catapult_run_test_4min','Best 4-min running effort, distance recorded as-is (coach: distance correct; period-tag time 4:18 is a marker-start artifact). Period 4 min Running.'),
  ('684c88c0-eca5-4df7-a191-00501427852f','94b52a06-0b83-48da-8664-639ec3486a0c','2026-08-17','4 min running (max)',240,1080.0,270.0,'catapult_run_test_4min','Best 4-min running effort, distance recorded as-is (coach: distance correct; period-tag time 4:07 is a marker-start artifact). Period 4 Min Running 1.'),
  ('73a1c9ec-2ba2-408a-9aed-ec6c523ed507','94b52a06-0b83-48da-8664-639ec3486a0c','2026-08-17','4 min running (max)',240,1077.8,269.4,'catapult_run_test_4min','Best 4-min running effort, distance recorded as-is (coach: distance correct; period-tag time 4:50 is a marker-start artifact). Period 4 mín Running Drill 2.'),
  ('3cd5b12f-668b-4a92-857c-9041346ce4d4','94b52a06-0b83-48da-8664-639ec3486a0c','2026-08-17','4 min running (max)',240,1070.2,267.6,'catapult_run_test_4min','Best 4-min running effort, distance recorded as-is (coach: distance correct; period-tag time 4:07 is a marker-start artifact). Period 4 Min Running 1.'),
  ('90aef56f-1f6e-4c73-b00c-44369ec5d22d','94b52a06-0b83-48da-8664-639ec3486a0c','2026-08-17','4 min running (max)',240,1067.7,266.9,'catapult_run_test_4min','Best 4-min running effort, distance recorded as-is (coach: distance correct; period-tag time 4:50 is a marker-start artifact). Period 4 mín Running Drill 2.'),
  ('4a6d7211-e9ad-4ba5-a921-2829aea8eb5d','94b52a06-0b83-48da-8664-639ec3486a0c','2026-08-17','4 min running (max)',240,1052.2,263.1,'catapult_run_test_4min','Best 4-min running effort, distance recorded as-is (coach: distance correct; period-tag time 4:09 is a marker-start artifact). Period 4 min Running Drill.'),
  ('342ca30f-aedf-4a8f-a703-1a2076c0deb5','94b52a06-0b83-48da-8664-639ec3486a0c','2026-08-17','4 min running (max)',240,1044.0,261.0,'catapult_run_test_4min','Best 4-min running effort, distance recorded as-is (coach: distance correct; period-tag time 4:50 is a marker-start artifact). Period 4 mín Running Drill 2.'),
  ('5a3d4f3c-9e14-46ab-95d7-87c7916da90b','94b52a06-0b83-48da-8664-639ec3486a0c','2026-08-17','4 min running (max)',240,1043.7,260.9,'catapult_run_test_4min','Best 4-min running effort, distance recorded as-is (coach: distance correct; period-tag time 4:18 is a marker-start artifact). Period 4 min Running.'),
  ('07d30d3e-e81a-44fa-b1dc-614d3594c62b','94b52a06-0b83-48da-8664-639ec3486a0c','2026-08-17','4 min running (max)',240,1040.1,260.0,'catapult_run_test_4min','Best 4-min running effort, distance recorded as-is (coach: distance correct; period-tag time 4:50 is a marker-start artifact). Period 4 mín Running Drill 2.'),
  ('786662d3-b100-4b70-bc7a-6e1e368a39fb','94b52a06-0b83-48da-8664-639ec3486a0c','2026-08-17','4 min running (max)',240,1019.4,254.8,'catapult_run_test_4min','Best 4-min running effort, distance recorded as-is (coach: distance correct; period-tag time 4:09 is a marker-start artifact). Period 4 Min Running 4.'),
  ('9dca35eb-5398-4a4e-ae1d-620722603e58','94b52a06-0b83-48da-8664-639ec3486a0c','2026-08-17','4 min running (max)',240,1014.7,253.7,'catapult_run_test_4min','Best 4-min running effort, distance recorded as-is (coach: distance correct; period-tag time 4:03 is a marker-start artifact). Period 4 min Running Drill.'),
  ('f8196567-0329-4edb-ad81-ed4af8bd91a8','94b52a06-0b83-48da-8664-639ec3486a0c','2026-08-17','4 min running (max)',240,999.5,249.9,'catapult_run_test_4min','Best 4-min running effort, distance recorded as-is (coach: distance correct; period-tag time 4:06 is a marker-start artifact). Period 4 min Running Drill.')
on conflict (player_id, test_date, test_name, source) do update set distance_m=excluded.distance_m, speed_m_per_min=excluded.speed_m_per_min, notes=excluded.notes;
