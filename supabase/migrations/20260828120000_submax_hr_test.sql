-- Submaximal HR (HRex) fitness test — a standardized fixed-load run (e.g. 4-5 min
-- at 9 km/h). Tracks aerobic-fitness change without a maximal test (Buchheit).
-- Descriptive conditioning context; never touches the readiness colour.
create table if not exists public.submax_hr_test (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  test_date date not null,
  speed_kmh numeric,           -- the fixed submaximal load (km/h)
  duration_s integer,          -- test duration (s)
  hrex_bpm numeric not null,   -- HRex = mean HR over the last 30-60 s
  hrr_bpm numeric,             -- HRR = HR drop over the first 60 s of recovery (optional)
  notes text,
  source text not null default 'manual',
  created_at timestamptz not null default now(),
  unique (player_id, test_date, source)
);

create index if not exists submax_hr_test_player_idx on public.submax_hr_test(player_id, test_date desc);

grant select, insert, update, delete on public.submax_hr_test to service_role;
grant select on public.submax_hr_test to authenticated;

alter table public.submax_hr_test enable row level security;

-- A coach reads their team's tests; a player reads their own. Writes go through
-- the service_role API (bypasses RLS), so no insert/update policy here.
drop policy if exists submax_hr_test_coach_read on public.submax_hr_test;
create policy submax_hr_test_coach_read on public.submax_hr_test
  for select to authenticated
  using (
    exists (select 1 from public.profiles p
      where p.id = auth.uid()
        and lower(coalesce(p.role,'')) in ('coach','admin','staff')
        and (lower(coalesce(p.role,'')) = 'admin' or p.team_id = submax_hr_test.team_id))
    or exists (select 1 from public.players pl where pl.id = submax_hr_test.player_id and pl.user_id = auth.uid())
  );
