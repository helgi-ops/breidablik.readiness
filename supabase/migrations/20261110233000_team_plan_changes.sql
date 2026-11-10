-- Who changed a team's plan, and when (admin page "Stjórna liðum").
-- Written only by POST /api/admin/team-plan (service role). Admins can read it; nobody writes from the browser.
create table if not exists public.team_plan_changes (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  from_tier text,
  to_tier text not null check (to_tier in ('FREE', 'PRO', 'ELITE')),
  changed_by uuid references auth.users(id) on delete set null,
  changed_at timestamptz not null default now()
);

create index if not exists team_plan_changes_team_idx on public.team_plan_changes (team_id, changed_at desc);

alter table public.team_plan_changes enable row level security;

drop policy if exists team_plan_changes_admin_read on public.team_plan_changes;
create policy team_plan_changes_admin_read on public.team_plan_changes
  for select to authenticated
  using ((select public.is_admin()));

revoke all on public.team_plan_changes from anon;
revoke insert, update, delete, truncate on public.team_plan_changes from authenticated;
grant select on public.team_plan_changes to authenticated;
