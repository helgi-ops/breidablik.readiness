-- stage4_bootstrap_for_date has failed on every call since 20260812140000.
--
-- That migration seeded system_decision = 'UNCONFIRMED' for a player with no check-in, but
-- stage4_decisions_system_decision_check only allows FULL / REDUCED / RECOVERY. The function is SECURITY
-- DEFINER and covers every team, so one player anywhere without a check-in aborted the whole insert
-- (the dashboard swallows the error as a warning). No UNCONFIRMED row has ever been stored.
--
-- 20261019140000 already settled the rule for stage4_ensure_decision: a player with no check-in simply
-- has no Stage-4 decision until they check in. This applies the same rule here. Only players with a
-- readiness colour are seeded, so the old misleading pre-check-in FULL does not come back either.
-- ON CONFLICT covers two dashboards bootstrapping the same day at once.
--
-- Stage-4 action only. Does not touch readiness_entries.color or the canonical verdict.
CREATE OR REPLACE FUNCTION public.stage4_bootstrap_for_date(p_date date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
begin
  insert into public.stage4_decisions (
    player_id,
    team_id,
    entry_date,
    system_decision,
    system_md_context
  )
  select
    p.id,
    p.team_id,
    p_date,
    -- Map readiness color -> training action.
    case lower(re.color)
      when 'red'    then 'RECOVERY'
      when 'yellow' then 'REDUCED'
      when 'green'  then 'FULL'
    end,
    t.md_day
  from public.players p
  join public.readiness_entries re
    on re.player_id = p.id
   and re.entry_date = p_date
   and lower(re.color) in ('red', 'yellow', 'green')
  left join public.v_training_day_context_team t
    on t.team_id = p.team_id
   and t."date" = p_date
  where not exists (
    select 1
    from public.stage4_decisions s
    where s.player_id = p.id
      and s.entry_date = p_date
  )
  on conflict (player_id, entry_date) do nothing;
end;
$function$;
