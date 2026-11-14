-- Programme Library "Speed & power", lota 4 step 3: the team's chosen level and exercise swaps per quality
-- (top speed, acceleration, braking, jump). See docs/goal-plan.md.
--
-- Library settings only. Player goal plans are frozen at approval and never read this table; it never touches the
-- readiness colour or Today's session (player_today_strength_override).
--
-- Access: every write goes through the server (service role) after requireCoachAccessForTeam and validation against
-- the swap registry (src/lib/micropulse/goalPlan/swaps.ts). The browser may only READ its own team's row: coaches
-- of the team and admins. No staff_users shortcut (that table has held player logins before).

-- ─── 1. Table ──────────────────────────────────────────────────────────────
create table if not exists public.team_quality_plan_prefs (
  team_id uuid not null references public.teams(id) on delete cascade,
  quality text not null check (quality in ('top_speed', 'acceleration', 'braking', 'jump')),
  level text not null default 'intermediate' check (level in ('beginner', 'intermediate', 'advanced')),
  -- slot key → option key, only real swaps (never "planned").
  swaps jsonb not null default '{}'::jsonb check (jsonb_typeof(swaps) = 'object'),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (team_id, quality)
);

-- ─── 2. Who may read ──────────────────────────────────────────────────────
create or replace function public.can_read_team_coach_prefs(p_team uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $fn$
  select p_team is not null and (
    exists (
      select 1 from profiles
      where id = auth.uid()
        and (is_admin or (team_id = p_team and upper(coalesce(role, '')) in ('COACH', 'ADMIN', 'STAFF')))
    )
    or exists (select 1 from coach_teams where coach_id = auth.uid() and team_id = p_team)
  )
$fn$;
revoke all on function public.can_read_team_coach_prefs(uuid) from public, anon;
grant execute on function public.can_read_team_coach_prefs(uuid) to authenticated, service_role;

-- ─── 3. Grants: read-only for logged-in users, writes only from the server ──
revoke all on public.team_quality_plan_prefs from public, anon, authenticated;
grant select on public.team_quality_plan_prefs to authenticated;
grant select, insert, update, delete on public.team_quality_plan_prefs to service_role;

-- ─── 4. RLS ────────────────────────────────────────────────────────────────
alter table public.team_quality_plan_prefs enable row level security;

drop policy if exists team_quality_plan_prefs_read on public.team_quality_plan_prefs;
create policy team_quality_plan_prefs_read on public.team_quality_plan_prefs
  for select to authenticated
  using (public.can_read_team_coach_prefs(team_id));
