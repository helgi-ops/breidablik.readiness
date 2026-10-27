-- A fixture in match_schedule (the source of truth for games) should automatically
-- create a GAME day in week_plans, so every surface that reads week_plans (player Today,
-- Week Setup, the coach Daily Briefing) sees the game — even when KKÍ/KSÍ publish the
-- schedule late and the week was set up without it. Never clobbers a coach-authored row
-- (ON CONFLICT DO NOTHING); auto rows are tagged system_key='MATCH_SCHEDULE'.

create or replace function public.match_week_plan_focus(p_opponent text, p_is_home boolean)
returns text language sql immutable as $$
  select case
    when p_opponent is null or btrim(p_opponent) = '' then 'MD · Leikur'
    when p_is_home is false then 'MD · Leikur @ ' || p_opponent || ' (úti)'
    else 'MD · Leikur vs ' || p_opponent || ' (heima)'
  end;
$$;

create or replace function public.sync_match_to_week_plan()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Reschedule / delete: drop the auto-created GAME row at the OLD date (only ours).
  if (tg_op = 'DELETE')
     or (tg_op = 'UPDATE' and (new.match_date is distinct from old.match_date
                               or new.team_id is distinct from old.team_id)) then
    delete from public.week_plans
    where team_id = old.team_id and day_date = old.match_date
      and system_key = 'MATCH_SCHEDULE';
  end if;

  -- Insert / update: ensure a GAME day exists for the fixture (never overwrite a coach row).
  if (tg_op = 'INSERT' or tg_op = 'UPDATE') then
    insert into public.week_plans
      (team_id, week_start, day_date, day_index, day_type, focus, planned_load, system_key, day_intent)
    values (
      new.team_id,
      (date_trunc('week', new.match_date))::date,
      new.match_date,
      extract(dow from new.match_date)::int,
      'GAME',
      public.match_week_plan_focus(new.opponent, new.is_home),
      9,
      'MATCH_SCHEDULE',
      'GAME'
    )
    on conflict (team_id, day_date) do nothing;
  end if;

  return null; -- AFTER trigger
end;
$$;

drop trigger if exists trg_sync_match_to_week_plan on public.match_schedule;
create trigger trg_sync_match_to_week_plan
after insert or update or delete on public.match_schedule
for each row execute function public.sync_match_to_week_plan();

-- Backfill today's + future fixtures that have no week_plans row yet.
insert into public.week_plans
  (team_id, week_start, day_date, day_index, day_type, focus, planned_load, system_key, day_intent)
select ms.team_id,
       (date_trunc('week', ms.match_date))::date,
       ms.match_date,
       extract(dow from ms.match_date)::int,
       'GAME',
       public.match_week_plan_focus(ms.opponent, ms.is_home),
       9,
       'MATCH_SCHEDULE',
       'GAME'
from public.match_schedule ms
where ms.match_date >= current_date
on conflict (team_id, day_date) do nothing;
