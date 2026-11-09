-- Fixed-window request counters for src/proxy.ts (AI, file parsing, public forms, invite links).
-- Subjects are SHA-256 hashes, so no IP address or login token is stored.
-- Unlogged: counters are worthless after a crash and should not add write-ahead log.
create unlogged table if not exists public.api_rate_limits (
  bucket text not null,
  subject text not null,
  window_start timestamptz not null,
  hits integer not null default 1,
  primary key (bucket, subject, window_start)
);

alter table public.api_rate_limits enable row level security;
revoke all on public.api_rate_limits from public, anon, authenticated;

create or replace function public.rate_limit_hit(
  p_bucket text,
  p_subject text,
  p_window_seconds integer,
  p_max integer
)
returns table (allowed boolean, hits integer, retry_after integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  v_hits integer;
begin
  insert into public.api_rate_limits as r (bucket, subject, window_start)
  values (p_bucket, p_subject, v_window)
  on conflict (bucket, subject, window_start) do update set hits = r.hits + 1
  returning r.hits into v_hits;

  -- About 1 call in 100 clears old windows, so no scheduled job is needed.
  if random() < 0.01 then
    delete from public.api_rate_limits where window_start < now() - interval '1 day';
  end if;

  return query select
    v_hits <= p_max,
    v_hits,
    greatest(1, ceil(extract(epoch from v_window + make_interval(secs => p_window_seconds) - now()))::integer);
end;
$$;

revoke all on function public.rate_limit_hit(text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, text, integer, integer) to service_role;
grant all on public.api_rate_limits to service_role;
