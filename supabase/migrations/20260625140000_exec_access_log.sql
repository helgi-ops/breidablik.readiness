-- Read-access audit for the EXEC (management) club-overview. player_access_audit
-- is purpose-built for grant/consent CHANGES (its CHECK constraints forbid a
-- "view" action), so EXEC reads get a dedicated, fit-for-purpose log: who viewed
-- which team's overview, when, and how many injured-player names were exposed.

create table if not exists public.exec_access_log (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  exec_id uuid not null references auth.users(id) on delete cascade,
  team_id uuid references public.teams(id) on delete set null,
  injured_names_shown int not null default 0,
  action text not null default 'club_overview_view'
);

alter table public.exec_access_log enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'exec_access_log' and policyname = 'exec_access_log_self_read') then
    create policy exec_access_log_self_read on public.exec_access_log for select using (auth.uid() = exec_id);
  end if;
end $$;
