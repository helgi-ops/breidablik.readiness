-- "Build pre-season" drafts: a rule-built plan proposal the coach edits and then accepts (or discards).
-- Nothing in a draft reaches week_plans / Week Setup until the coach accepts it. One open draft per team
-- and scope. `scope` is 'preseason' now; 'meso' and 'macro' later on the same base.
-- coach_edits = what the coach changed from the rule's proposal (settings + days) — the audit trail.
create table if not exists public.plan_proposals (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  season_year int not null,
  scope text not null check (scope in ('preseason', 'meso', 'macro')),
  status text not null default 'draft' check (status in ('draft', 'accepted', 'discarded')),
  from_scratch boolean not null default false,
  proposal jsonb not null,
  coach_edits jsonb not null default '{}'::jsonb,
  accept_summary jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  accepted_by uuid,
  accepted_at timestamptz
);
create unique index if not exists plan_proposals_one_open_draft
  on public.plan_proposals (team_id, scope) where status = 'draft';
create index if not exists idx_plan_proposals_team_created
  on public.plan_proposals (team_id, created_at desc);

-- All access goes through the coach-gated API (service role), which enforces team access — the same
-- pattern as coach_test_schedule. RLS on with no client policy blocks direct client reads/writes.
alter table public.plan_proposals enable row level security;
