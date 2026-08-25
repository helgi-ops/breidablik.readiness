-- coach_signals — the shared "background signal" cache behind the Today briefing
-- chips (coach-pages-audit-background-vs-destination.md). One row per (team,
-- engine, day): the engine's verdict LEVEL + plain "why" + confidence, computed
-- once per day and read instantly by every surface. Team-level for now
-- (player_id null); the column is here so per-player signals can land later.
-- ADVISORY / descriptive — sits BESIDE the readiness colour, never becomes it.
create table if not exists public.coach_signals (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  engine text not null,                    -- 'game_plan_fit' | 'post_training' | 'match_minutes'
  player_id uuid references public.players(id) on delete set null,
  level text not null,                     -- 'steady' | 'watch' | 'elevated' | 'task'
  label jsonb not null default '{}'::jsonb, -- { en, is } chip title
  why jsonb not null default '{}'::jsonb,   -- { en: string[], is: string[] }
  confidence text,                          -- 'high' | 'moderate' | 'low'
  counterfactual jsonb,                     -- { en, is } | null
  href text,                                -- drill-down link
  as_of date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (team_id, engine, as_of)
);

create index if not exists coach_signals_team_asof_idx on public.coach_signals(team_id, as_of desc);

grant select, insert, update, delete on public.coach_signals to authenticated;
grant select, insert, update, delete on public.coach_signals to service_role;

alter table public.coach_signals enable row level security;

-- Coach reads their own team's signals. Writes happen via the service_role admin
-- client in the signals route (which bypasses RLS), so no insert/update policy.
drop policy if exists coach_signals_coach_read_team on public.coach_signals;
create policy coach_signals_coach_read_team on public.coach_signals
  for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and lower(coalesce(p.role, '')) in ('coach', 'admin', 'staff')
        and (lower(coalesce(p.role, '')) = 'admin' or p.team_id = coach_signals.team_id)
    )
  );
