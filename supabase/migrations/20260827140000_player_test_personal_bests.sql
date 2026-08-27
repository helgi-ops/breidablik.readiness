-- Personal-best records (motivation feature). One row per achieved PB; drives
-- both the celebratory in-app card and the push. The unique key is the de-dup:
-- a given player's PB on a given test is recorded once. Ships with CMJ jump
-- height; `metric` is extensible.
create table if not exists public.player_test_personal_bests (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  team_id uuid references public.teams(id) on delete set null,
  metric text not null,                 -- 'cmj_jump_height'
  value numeric not null,
  unit text,
  prior_best numeric,
  improvement numeric,
  test_id text,                         -- raw_test_id (or date fallback) — de-dup identity
  achieved_at timestamptz not null,
  push_notified_at timestamptz,         -- null = push still pending
  created_at timestamptz not null default now(),
  unique (player_id, metric, test_id)
);

create index if not exists player_test_personal_bests_player_idx
  on public.player_test_personal_bests(player_id, achieved_at desc);
create index if not exists player_test_personal_bests_pending_push_idx
  on public.player_test_personal_bests(push_notified_at) where push_notified_at is null;

grant select, insert, update on public.player_test_personal_bests to service_role;
grant select on public.player_test_personal_bests to authenticated;

alter table public.player_test_personal_bests enable row level security;

-- A player reads their own PBs (players.user_id = auth.uid()). Writes happen via
-- the service_role detector (bypasses RLS), so no insert/update policy here.
drop policy if exists player_pb_read_own on public.player_test_personal_bests;
create policy player_pb_read_own on public.player_test_personal_bests
  for select to authenticated
  using (
    exists (
      select 1 from public.players p
      where p.id = player_test_personal_bests.player_id
        and p.user_id = auth.uid()
    )
  );
