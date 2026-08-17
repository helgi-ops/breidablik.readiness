-- Critical-Speed field-test efforts — a coach-entered maximal run (e.g. a 4-min "go as far
-- as you can"). One row per (player, test date, effort duration). Two+ efforts of different
-- durations let us fit a TRUE CS/D′ (D = D′ + CS·t) from genuine maximal points, far better
-- than the estimate from match/training peak windows. Descriptive conditioning context —
-- it never touches the readiness colour, the load target, or the daily decision.
create table if not exists public.player_cs_test (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  team_id uuid references public.teams(id) on delete cascade,
  test_date date not null default current_date,
  duration_min numeric not null check (duration_min > 0 and duration_min <= 60),
  distance_m numeric not null check (distance_m > 0 and distance_m < 20000),
  note text null,
  created_by uuid null,
  created_at timestamptz not null default now(),
  unique (player_id, test_date, duration_min)
);
create index if not exists player_cs_test_player_idx on public.player_cs_test (player_id, test_date desc);

alter table public.player_cs_test enable row level security;

create policy player_cs_test_coach_read on public.player_cs_test
  for select using (
    exists (select 1 from public.profiles pr where pr.id = auth.uid()
      and lower(coalesce(pr.role,'')) = any (array['coach','admin','staff'])
      and (lower(coalesce(pr.role,'')) = 'admin' or pr.team_id = player_cs_test.team_id
        or player_cs_test.team_id in (select ct.team_id from public.coach_teams ct where ct.coach_id = auth.uid()))));
create policy player_cs_test_coach_write on public.player_cs_test
  for insert with check (
    exists (select 1 from public.profiles pr where pr.id = auth.uid()
      and lower(coalesce(pr.role,'')) = any (array['coach','admin','staff'])
      and (lower(coalesce(pr.role,'')) = 'admin' or pr.team_id = player_cs_test.team_id
        or player_cs_test.team_id in (select ct.team_id from public.coach_teams ct where ct.coach_id = auth.uid()))));

create policy player_cs_test_player_read on public.player_cs_test
  for select using (
    exists (select 1 from public.players p where p.id = player_cs_test.player_id and p.user_id = auth.uid())
    or exists (select 1 from public.profiles pr where pr.id = auth.uid() and pr.player_id = player_cs_test.player_id));
