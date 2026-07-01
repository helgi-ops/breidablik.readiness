-- Per-surface usage rollup for the admin "what's used / what's dead" view.
create or replace function public.get_usage_summary()
returns table (
  path           text,
  total          bigint,
  last_7d        bigint,
  last_30d       bigint,
  distinct_users bigint,
  last_used      timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    path,
    count(*)::bigint                                                                 as total,
    count(*) filter (where occurred_at >= now() - interval '7 days')::bigint         as last_7d,
    count(*) filter (where occurred_at >= now() - interval '30 days')::bigint        as last_30d,
    count(distinct user_id)::bigint                                                  as distinct_users,
    max(occurred_at)                                                                 as last_used
  from public.usage_events
  where event_type = 'page_view'
  group by path
  order by last_30d desc, total desc;
$$;
