-- Sync Week-Setup planned matches into match_schedule.
--
-- Problem: coach_week_setup.matches (the coach's planned microcycle) is the source
-- the Daily Briefing reads for its MD label, but match_schedule (the recorded
-- fixtures) is what Recovery Watch / v_last_match_by_team / the exec dashboard
-- anchor to. When a coach plans a match in Week Setup it was never written to
-- match_schedule, so those surfaces lagged on the previous match (e.g. Daily
-- Briefing said MD+1 while Recovery Watch said MD+5).
--
-- Fix: a trigger upserts each Week-Setup match date into match_schedule on save,
-- plus a one-time backfill for existing setups. Add-only (never deletes a fixture,
-- which may already carry recorded minutes/results).

create or replace function public.sync_week_setup_matches() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare m jsonb;
begin
  if NEW.matches is not null then
    for m in select * from jsonb_array_elements(NEW.matches) loop
      if coalesce(m->>'date', '') <> '' then
        insert into public.match_schedule (id, team_id, match_date, is_home, kickoff_time)
        select gen_random_uuid(), NEW.team_id, (m->>'date')::date,
               upper(coalesce(m->>'home_away', 'H')) = 'H',
               nullif(m->>'kickoff_time', '')::time
        where not exists (
          select 1 from public.match_schedule s
          where s.team_id = NEW.team_id and s.match_date = (m->>'date')::date
        );
      end if;
    end loop;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_sync_week_setup_matches on public.coach_week_setup;
create trigger trg_sync_week_setup_matches
  after insert or update of matches on public.coach_week_setup
  for each row execute function public.sync_week_setup_matches();

-- Backfill existing plans (idempotent — only inserts dates not already scheduled).
insert into public.match_schedule (id, team_id, match_date, is_home, kickoff_time)
select gen_random_uuid(), ws.team_id, (m->>'date')::date,
       upper(coalesce(m->>'home_away', 'H')) = 'H', nullif(m->>'kickoff_time', '')::time
from public.coach_week_setup ws, jsonb_array_elements(ws.matches) m
where coalesce(m->>'date', '') <> ''
  and not exists (select 1 from public.match_schedule s where s.team_id = ws.team_id and s.match_date = (m->>'date')::date);
