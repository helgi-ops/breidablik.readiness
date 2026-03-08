-- Daily internal load aggregation layer for coaches.
-- session_rpe_entries -> player_daily_load -> player_load_metrics (future ACWR / fatigue).

create extension if not exists pgcrypto;

create table if not exists public.player_daily_load (
  player_id uuid not null references public.players(id) on delete cascade,
  team_id uuid null references public.teams(id) on delete set null,
  load_date date not null,
  total_sessions integer not null default 0,
  total_load integer not null default 0,
  avg_rpe numeric(5,2) null,
  total_duration_minutes integer not null default 0,
  latest_submission_at timestamptz null,
  source text not null default 'session_rpe_entries',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (player_id, load_date)
);

create index if not exists player_daily_load_player_id_idx
  on public.player_daily_load (player_id);

create index if not exists player_daily_load_team_id_idx
  on public.player_daily_load (team_id);

create index if not exists player_daily_load_load_date_idx
  on public.player_daily_load (load_date);

create index if not exists player_daily_load_team_date_idx
  on public.player_daily_load (team_id, load_date);

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

drop trigger if exists trg_player_daily_load_set_updated_at on public.player_daily_load;
create trigger trg_player_daily_load_set_updated_at
before update on public.player_daily_load
for each row
execute procedure public.set_updated_at_timestamp();

create or replace function public.refresh_player_daily_load(
  p_target_date date default null,
  p_player_id uuid default null
)
returns table(upserted_count integer, deleted_count integer)
language plpgsql
security definer
set search_path = public
as $$
begin
  with source as (
    select
      e.player_id,
      max(e.team_id) as team_id,
      e.session_date as load_date,
      count(*)::int as total_sessions,
      coalesce(sum(e.session_load), 0)::int as total_load,
      round(avg(e.rpe)::numeric, 2) as avg_rpe,
      coalesce(sum(e.duration_minutes), 0)::int as total_duration_minutes,
      max(e.submitted_at) as latest_submission_at
    from public.session_rpe_entries e
    where (p_target_date is null or e.session_date = p_target_date)
      and (p_player_id is null or e.player_id = p_player_id)
    group by e.player_id, e.session_date
  ),
  upserted as (
    insert into public.player_daily_load (
      player_id,
      team_id,
      load_date,
      total_sessions,
      total_load,
      avg_rpe,
      total_duration_minutes,
      latest_submission_at,
      source
    )
    select
      s.player_id,
      s.team_id,
      s.load_date,
      s.total_sessions,
      s.total_load,
      s.avg_rpe,
      s.total_duration_minutes,
      s.latest_submission_at,
      'session_rpe_entries'
    from source s
    on conflict (player_id, load_date) do update
    set
      team_id = excluded.team_id,
      total_sessions = excluded.total_sessions,
      total_load = excluded.total_load,
      avg_rpe = excluded.avg_rpe,
      total_duration_minutes = excluded.total_duration_minutes,
      latest_submission_at = excluded.latest_submission_at,
      source = excluded.source,
      updated_at = now()
    returning 1
  ),
  deleted as (
    delete from public.player_daily_load pdl
    where (p_target_date is null or pdl.load_date = p_target_date)
      and (p_player_id is null or pdl.player_id = p_player_id)
      and pdl.source = 'session_rpe_entries'
      and not exists (
        select 1
        from source s
        where s.player_id = pdl.player_id
          and s.load_date = pdl.load_date
      )
    returning 1
  )
  select
    (select count(*) from upserted)::int,
    (select count(*) from deleted)::int
  into upserted_count, deleted_count;

  return next;
end;
$$;

create or replace function public.refresh_player_daily_load_from_session_rpe()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.refresh_player_daily_load(new.session_date, new.player_id);
    return new;
  elsif tg_op = 'UPDATE' then
    perform public.refresh_player_daily_load(old.session_date, old.player_id);
    perform public.refresh_player_daily_load(new.session_date, new.player_id);
    return new;
  elsif tg_op = 'DELETE' then
    perform public.refresh_player_daily_load(old.session_date, old.player_id);
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_refresh_player_daily_load_from_session_rpe on public.session_rpe_entries;
create trigger trg_refresh_player_daily_load_from_session_rpe
after insert or update or delete on public.session_rpe_entries
for each row
execute procedure public.refresh_player_daily_load_from_session_rpe();

alter table public.player_daily_load enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'player_daily_load' and policyname = 'player_daily_load_player_select_own'
  ) then
    create policy player_daily_load_player_select_own
      on public.player_daily_load
      for select
      using (
        exists (
          select 1
          from public.players p
          where p.id = player_daily_load.player_id
            and p.user_id = auth.uid()
        )
        or exists (
          select 1
          from public.profiles pr
          where pr.id = auth.uid()
            and pr.player_id = player_daily_load.player_id
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'player_daily_load' and policyname = 'player_daily_load_coach_read_team'
  ) then
    create policy player_daily_load_coach_read_team
      on public.player_daily_load
      for select
      using (
        exists (
          select 1
          from public.profiles pr
          where pr.id = auth.uid()
            and lower(coalesce(pr.role, '')) in ('coach', 'admin', 'staff')
            and (
              lower(coalesce(pr.role, '')) = 'admin'
              or pr.team_id = player_daily_load.team_id
            )
        )
      );
  end if;
end
$$;

-- Backfill existing rows once at migration time.
select * from public.refresh_player_daily_load(null, null);

