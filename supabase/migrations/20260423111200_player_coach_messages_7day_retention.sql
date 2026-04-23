-- 7-day retention for player_coach_messages.
-- Daily pg_cron job deletes any message created more than 7 days ago.
-- Iceland is UTC year-round (no DST), so 03:00 UTC = 03:00 Iceland time.

create or replace function public.purge_old_player_coach_messages()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count integer;
begin
  delete from public.player_coach_messages
  where created_at < now() - interval '7 days';
  get diagnostics deleted_count = row_count;
  return deleted_count;
end
$$;

comment on function public.purge_old_player_coach_messages() is
  '7-day retention purge for chat messages. Returns rows deleted. Called by pg_cron daily.';

-- Drop any prior job with the same name (idempotent)
do $$
begin
  if exists (select 1 from cron.job where jobname = 'purge_player_coach_messages_daily') then
    perform cron.unschedule('purge_player_coach_messages_daily');
  end if;
end
$$;

-- Schedule the job: daily at 03:00 UTC (= 03:00 Iceland)
select cron.schedule(
  'purge_player_coach_messages_daily',
  '0 3 * * *',
  $cron$select public.purge_old_player_coach_messages();$cron$
);
