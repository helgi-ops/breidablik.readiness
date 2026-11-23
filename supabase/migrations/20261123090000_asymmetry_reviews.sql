-- The coach's decision on a player's left/right asymmetry (strength-day-rules brief §4b, 2026-11-23).
-- A gap ≥ 10% (CoD or VALD) no longer swaps the lift on its own: it goes to the coach / physio first. One tap writes a
-- row here: 'swap' lets the engine use one leg at a time for 28 days, 'keep' keeps the two-leg lift. Append-only: the
-- newest row per player is in force and the rest is the audit trail (who, when, what %, why).
-- Never the readiness colour.

create table if not exists public.asymmetry_reviews (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  decision text not null check (decision in ('swap', 'keep')),
  asym_pct numeric,
  source text,
  reason text,
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz not null default now()
);

create index if not exists asymmetry_reviews_player_idx on public.asymmetry_reviews (player_id, decided_at desc);
create index if not exists asymmetry_reviews_team_idx on public.asymmetry_reviews (team_id, decided_at desc);

alter table public.asymmetry_reviews enable row level security;

-- Coaches / staff of the team read; writes go through /api/coach/asymmetry-review (service role), so no client write policy.
drop policy if exists asymmetry_reviews_coach_read on public.asymmetry_reviews;
create policy asymmetry_reviews_coach_read on public.asymmetry_reviews
  for select using (
    exists (
      select 1 from public.profiles pr
      where pr.id = (select auth.uid())
        and lower(coalesce(pr.role, '')) in ('coach', 'admin', 'staff')
        and (
          lower(coalesce(pr.role, '')) = 'admin'
          or pr.team_id = asymmetry_reviews.team_id
          or asymmetry_reviews.team_id in (select ct.team_id from public.coach_teams ct where ct.coach_id = (select auth.uid()))
        )
    )
  );
