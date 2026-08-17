-- Generic standardized fitness-test store (Yo-Yo, 30-15 IFT, beep/MSFT, VAMEVAL, 4-min MAS run,
-- line drill, 17s, max sprint). One row per result; test_type validated in the API (not a DB enum,
-- so it stays extensible). Descriptive load/conditioning context — never touches readiness.
-- RLS mirrors player_running_test / player_load_peak_period (coach-read-team + player-select-own).
create table if not exists public.player_fitness_test (
  id           uuid primary key default gen_random_uuid(),
  player_id    uuid not null references public.players(id) on delete cascade,
  team_id      uuid not null,
  test_date    date not null,
  test_type    text not null,           -- yo_yo_ir1 | yo_yo_ir2 | ift_30_15 | msft_beep | mas_vameval | mas_run_4min | line_drill | suicide_17s | sprint_max
  result_value numeric,                 -- Yo-Yo: m · 30-15: VIFT km/h · beep: level.shuttle · MAS/sprint: km/h · line drill/17s: s
  result_unit  text,                    -- 'm' | 'km/h' | 'level' | 's'
  stage        numeric,                 -- optional: beep level / IFT stage
  time_s       numeric,                 -- optional: timed tests
  distance_m   numeric,                 -- optional: secondary distance
  mas_kmh      numeric,                 -- derived MAS where the test supports it (nullable)
  vo2max_est   numeric,                 -- derived VO2max where supported (nullable)
  source       text not null default 'manual',
  notes        text,
  created_at   timestamptz not null default now(),
  unique (player_id, test_date, test_type, source)
);
alter table public.player_fitness_test enable row level security;

create policy player_fitness_test_coach_read_team on public.player_fitness_test
  for select using (exists (select 1 from profiles pr
    where pr.id = auth.uid()
      and lower(coalesce(pr.role,'')) = any (array['coach','admin','staff'])
      and (lower(coalesce(pr.role,'')) = 'admin'
        or pr.team_id = player_fitness_test.team_id
        or player_fitness_test.team_id in (select ct.team_id from coach_teams ct where ct.coach_id = auth.uid()))));

create policy player_fitness_test_player_select_own on public.player_fitness_test
  for select using (exists (select 1 from players p where p.id = player_fitness_test.player_id and p.user_id = auth.uid())
    or exists (select 1 from profiles pr where pr.id = auth.uid() and pr.player_id = player_fitness_test.player_id));

-- Copy the existing 4-min MAS runs into the generic store as test_type='mas_run_4min'.
insert into public.player_fitness_test (player_id, team_id, test_date, test_type, result_value, result_unit, distance_m, mas_kmh, source, notes)
select player_id, team_id, test_date, 'mas_run_4min', distance_m, 'm', distance_m,
       round((distance_m/4.0*0.06)::numeric, 1), coalesce(source,'manual'), notes
from public.player_running_test
on conflict (player_id, test_date, test_type, source) do nothing;
