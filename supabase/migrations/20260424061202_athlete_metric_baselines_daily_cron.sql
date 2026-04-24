-- Schedule daily refresh at 04:00 UTC (= 04:00 Iceland, no DST).
-- One hour after the chat-message purge job at 03:00.

do $$
begin
  if exists (select 1 from cron.job where jobname = 'refresh_athlete_metric_baselines_daily') then
    perform cron.unschedule('refresh_athlete_metric_baselines_daily');
  end if;
end
$$;

select cron.schedule(
  'refresh_athlete_metric_baselines_daily',
  '0 4 * * *',
  $cron$select public.refresh_athlete_metric_baselines();$cron$
);
