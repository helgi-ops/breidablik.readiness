-- Derived load metrics layer from player_daily_load.
-- This is context for coaching decisions and future model features.
-- It is not a standalone medical verdict and is not directly used in final day decision yet.

create table if not exists public.player_load_metrics (
  player_id uuid not null references public.players(id) on delete cascade,
  team_id uuid null references public.teams(id) on delete set null,
  metric_date date not null,
  daily_load integer not null default 0,
  acute_load_7d numeric(10,2) null,
  chronic_load_28d numeric(10,2) null,
  acwr numeric(10,3) null,
  load_trend text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (player_id, metric_date)
);

create index if not exists player_load_metrics_player_id_idx
  on public.player_load_metrics (player_id);

create index if not exists player_load_metrics_team_id_idx
  on public.player_load_metrics (team_id);

create index if not exists player_load_metrics_metric_date_idx
  on public.player_load_metrics (metric_date);

create index if not exists player_load_metrics_team_date_idx
  on public.player_load_metrics (team_id, metric_date);

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

drop trigger if exists trg_player_load_metrics_set_updated_at on public.player_load_metrics;
create trigger trg_player_load_metrics_set_updated_at
before update on public.player_load_metrics
for each row
execute procedure public.set_updated_at_timestamp();

create or replace function public.refresh_player_load_metrics(
  p_target_date date default null,
  p_player_id uuid default null
)
returns table(upserted_count integer, deleted_count integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_start_date date;
  v_end_date date;
begin
  if p_target_date is null then
    select min(load_date), max(load_date)
      into v_start_date, v_end_date
    from public.player_daily_load
    where (p_player_id is null or player_id = p_player_id);

    if v_start_date is null or v_end_date is null then
      delete from public.player_load_metrics
      where (p_player_id is null or player_id = p_player_id);
      get diagnostics deleted_count = row_count;
      upserted_count := 0;
      return next;
      return;
    end if;
  else
    v_start_date := p_target_date;
    v_end_date := p_target_date + 27;
  end if;

  with scoped_players as (
    select distinct p.player_id
    from public.player_daily_load p
    where (p_player_id is null or p.player_id = p_player_id)
      and p.load_date between (v_start_date - 27) and v_end_date
    union
    select distinct m.player_id
    from public.player_load_metrics m
    where (p_player_id is null or m.player_id = p_player_id)
      and m.metric_date between v_start_date and v_end_date
  ),
  date_series as (
    select sp.player_id, gs::date as metric_date
    from scoped_players sp
    cross join generate_series(v_start_date, v_end_date, interval '1 day') gs
  ),
  daily as (
    select
      ds.player_id,
      ds.metric_date,
      coalesce(pdl.team_id, p_any.team_id) as team_id,
      coalesce(pdl.total_load, 0)::int as daily_load
    from date_series ds
    left join public.player_daily_load pdl
      on pdl.player_id = ds.player_id and pdl.load_date = ds.metric_date
    left join lateral (
      select pdl2.team_id
      from public.player_daily_load pdl2
      where pdl2.player_id = ds.player_id
      order by pdl2.load_date desc
      limit 1
    ) p_any on true
  ),
  calc as (
    select
      d.player_id,
      d.team_id,
      d.metric_date,
      d.daily_load,
      round((
        select coalesce(sum(coalesce(p2.total_load, 0)), 0)::numeric
        from generate_series(d.metric_date - 6, d.metric_date, interval '1 day') s(day)
        left join public.player_daily_load p2
          on p2.player_id = d.player_id and p2.load_date = s.day::date
      ) / 7.0, 2) as acute_load_7d,
      round((
        select coalesce(sum(coalesce(p3.total_load, 0)), 0)::numeric
        from generate_series(d.metric_date - 27, d.metric_date, interval '1 day') s(day)
        left join public.player_daily_load p3
          on p3.player_id = d.player_id and p3.load_date = s.day::date
      ) / 28.0, 2) as chronic_load_28d
    from daily d
  ),
  normalized as (
    select
      c.player_id,
      c.team_id,
      c.metric_date,
      c.daily_load,
      c.acute_load_7d,
      c.chronic_load_28d,
      case
        when c.chronic_load_28d is null or c.chronic_load_28d = 0 then null
        else round((c.acute_load_7d / c.chronic_load_28d)::numeric, 3)
      end as acwr,
      case
        when c.chronic_load_28d is null or c.chronic_load_28d = 0 then null
        when c.acute_load_7d > c.chronic_load_28d * 1.10 then 'RISING'
        when c.acute_load_7d < c.chronic_load_28d * 0.90 then 'DROPPING'
        else 'STABLE'
      end as load_trend
    from calc c
  ),
  upserted as (
    insert into public.player_load_metrics (
      player_id,
      team_id,
      metric_date,
      daily_load,
      acute_load_7d,
      chronic_load_28d,
      acwr,
      load_trend
    )
    select
      n.player_id,
      n.team_id,
      n.metric_date,
      n.daily_load,
      n.acute_load_7d,
      n.chronic_load_28d,
      n.acwr,
      n.load_trend
    from normalized n
    on conflict (player_id, metric_date) do update
    set
      team_id = excluded.team_id,
      daily_load = excluded.daily_load,
      acute_load_7d = excluded.acute_load_7d,
      chronic_load_28d = excluded.chronic_load_28d,
      acwr = excluded.acwr,
      load_trend = excluded.load_trend,
      updated_at = now()
    returning 1
  ),
  deleted as (
    delete from public.player_load_metrics m
    where (p_player_id is null or m.player_id = p_player_id)
      and m.metric_date between v_start_date and v_end_date
      and not exists (
        select 1
        from normalized n
        where n.player_id = m.player_id and n.metric_date = m.metric_date
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

create or replace function public.refresh_player_load_metrics_from_daily_load()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.refresh_player_load_metrics(new.load_date, new.player_id);
    return new;
  elsif tg_op = 'UPDATE' then
    perform public.refresh_player_load_metrics(old.load_date, old.player_id);
    perform public.refresh_player_load_metrics(new.load_date, new.player_id);
    return new;
  elsif tg_op = 'DELETE' then
    perform public.refresh_player_load_metrics(old.load_date, old.player_id);
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_refresh_player_load_metrics_from_daily_load on public.player_daily_load;
create trigger trg_refresh_player_load_metrics_from_daily_load
after insert or update or delete on public.player_daily_load
for each row
execute procedure public.refresh_player_load_metrics_from_daily_load();

alter table public.player_load_metrics enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'player_load_metrics' and policyname = 'player_load_metrics_player_select_own'
  ) then
    create policy player_load_metrics_player_select_own
      on public.player_load_metrics
      for select
      using (
        exists (
          select 1
          from public.players p
          where p.id = player_load_metrics.player_id
            and p.user_id = auth.uid()
        )
        or exists (
          select 1
          from public.profiles pr
          where pr.id = auth.uid()
            and pr.player_id = player_load_metrics.player_id
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'player_load_metrics' and policyname = 'player_load_metrics_coach_read_team'
  ) then
    create policy player_load_metrics_coach_read_team
      on public.player_load_metrics
      for select
      using (
        exists (
          select 1
          from public.profiles pr
          where pr.id = auth.uid()
            and lower(coalesce(pr.role, '')) in ('coach', 'admin', 'staff')
            and (
              lower(coalesce(pr.role, '')) = 'admin'
              or pr.team_id = player_load_metrics.team_id
            )
        )
      );
  end if;
end
$$;

-- Initial backfill
select * from public.refresh_player_load_metrics(null, null);

