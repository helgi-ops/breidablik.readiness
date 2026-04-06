-- Session RPE system
-- Production-safe schema for post-session RPE logging and load aggregation.

create extension if not exists pgcrypto;

create table if not exists public.session_rpe_entries (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  team_id uuid null references public.teams(id) on delete set null,
  session_date date not null,
  session_type text not null check (session_type in ('match', 'team_training', 'gym', 'recovery', 'individual', 'other')),
  session_name text null,
  duration_minutes integer not null check (duration_minutes between 1 and 300),
  rpe numeric(4,1) not null check (rpe >= 0 and rpe <= 10),
  session_load integer generated always as (round(rpe * duration_minutes)) stored,
  source text not null default 'player',
  notes text null,
  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists session_rpe_entries_player_id_idx
  on public.session_rpe_entries (player_id);

create index if not exists session_rpe_entries_team_id_idx
  on public.session_rpe_entries (team_id);

create index if not exists session_rpe_entries_session_date_idx
  on public.session_rpe_entries (session_date);

create index if not exists session_rpe_entries_player_date_idx
  on public.session_rpe_entries (player_id, session_date);

create index if not exists session_rpe_entries_team_date_idx
  on public.session_rpe_entries (team_id, session_date);

-- Reuse shared updated_at trigger helper if present; create only if missing.
do $$
begin
  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where p.proname = 'set_updated_at_timestamp' and n.nspname = 'public'
  ) then
    execute $fn$
      create function public.set_updated_at_timestamp()
      returns trigger
      language plpgsql
      as $$
      begin
        new.updated_at = now();
        return new;
      end;
      $$;
    $fn$;
  end if;
end
$$;

drop trigger if exists trg_session_rpe_entries_set_updated_at on public.session_rpe_entries;
create trigger trg_session_rpe_entries_set_updated_at
before update on public.session_rpe_entries
for each row
execute procedure public.set_updated_at_timestamp();

create or replace view public.session_rpe_daily_loads as
select
  e.player_id,
  e.team_id,
  e.session_date,
  count(*)::int as total_sessions,
  coalesce(sum(e.session_load), 0)::int as daily_load_total,
  round(avg(e.rpe)::numeric, 1) as avg_rpe,
  coalesce(sum(e.duration_minutes), 0)::int as total_duration_minutes,
  max(e.submitted_at) as latest_submission_at
from public.session_rpe_entries e
group by e.player_id, e.team_id, e.session_date;

alter table public.session_rpe_entries enable row level security;

-- Player ownership helper expression: mapped via players.user_id OR profiles.player_id.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'session_rpe_entries' and policyname = 'session_rpe_player_select_own'
  ) then
    create policy session_rpe_player_select_own
      on public.session_rpe_entries
      for select
      using (
        exists (
          select 1
          from public.players p
          where p.id = session_rpe_entries.player_id
            and p.user_id = auth.uid()
        )
        or exists (
          select 1
          from public.profiles pr
          where pr.id = auth.uid()
            and pr.player_id = session_rpe_entries.player_id
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'session_rpe_entries' and policyname = 'session_rpe_player_insert_own'
  ) then
    create policy session_rpe_player_insert_own
      on public.session_rpe_entries
      for insert
      with check (
        exists (
          select 1
          from public.players p
          where p.id = session_rpe_entries.player_id
            and p.user_id = auth.uid()
        )
        or exists (
          select 1
          from public.profiles pr
          where pr.id = auth.uid()
            and pr.player_id = session_rpe_entries.player_id
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'session_rpe_entries' and policyname = 'session_rpe_player_update_same_day'
  ) then
    create policy session_rpe_player_update_same_day
      on public.session_rpe_entries
      for update
      using (
        (
          exists (
            select 1
            from public.players p
            where p.id = session_rpe_entries.player_id
              and p.user_id = auth.uid()
          )
          or exists (
            select 1
            from public.profiles pr
            where pr.id = auth.uid()
              and pr.player_id = session_rpe_entries.player_id
          )
        )
        and session_rpe_entries.session_date = ((now() at time zone 'Atlantic/Reykjavik')::date)
      )
      with check (
        (
          exists (
            select 1
            from public.players p
            where p.id = session_rpe_entries.player_id
              and p.user_id = auth.uid()
          )
          or exists (
            select 1
            from public.profiles pr
            where pr.id = auth.uid()
              and pr.player_id = session_rpe_entries.player_id
          )
        )
        and session_rpe_entries.session_date = ((now() at time zone 'Atlantic/Reykjavik')::date)
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'session_rpe_entries' and policyname = 'session_rpe_coach_read_team'
  ) then
    create policy session_rpe_coach_read_team
      on public.session_rpe_entries
      for select
      using (
        exists (
          select 1
          from public.profiles pr
          where pr.id = auth.uid()
            and lower(coalesce(pr.role, '')) in ('coach', 'admin', 'staff')
            and (
              lower(coalesce(pr.role, '')) = 'admin'
              or pr.team_id = session_rpe_entries.team_id
            )
        )
      );
  end if;
end
$$;
