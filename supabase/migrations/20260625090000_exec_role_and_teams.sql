-- EXEC (management / GM / board) read-only role.
-- profiles.role is free-text (no check constraint), so 'EXEC' needs no enum change.
-- This adds the multi-team grant table (mirrors coach_teams) so an EXEC for a club
-- sees ALL the club's teams, and extends invite links to allow EXEC invites.

create table if not exists public.exec_teams (
  exec_id uuid not null references auth.users(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (exec_id, team_id)
);

alter table public.exec_teams enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'exec_teams' and policyname = 'exec_teams_self_read') then
    create policy exec_teams_self_read on public.exec_teams for select using (auth.uid() = exec_id);
  end if;
end $$;

-- Allow EXEC as an invite target_role (was PLAYER|COACH only).
do $$
declare cname text;
begin
  select conname into cname from pg_constraint
   where conrelid = 'public.team_invite_links'::regclass and contype = 'c'
     and pg_get_constraintdef(oid) ilike '%target_role%' limit 1;
  if cname is not null then execute format('alter table public.team_invite_links drop constraint %I', cname); end if;
  alter table public.team_invite_links add constraint team_invite_links_target_role_chk
    check (target_role = any (array['PLAYER', 'COACH', 'EXEC']));
end $$;
