-- Root cause of the pre-check-in placeholders: stage4_bootstrap_for_date defaulted
-- system_decision to FULL when a player had not checked in yet ("benefit of the doubt").
-- That fake FULL then got frozen/locked before the real RED/RECOVERY check-in, so the
-- decision-action surface disagreed with the readiness colour. Seed the honest UNCONFIRMED
-- state instead (already the no-entry state used by stage4_ensure_decision); the real
-- action is re-synced from readiness_entries.training_action the moment the player checks
-- in. Descriptive decision-action only — does NOT touch readiness_entries.color / the verdict.
-- Applied via mcp apply_migration; committed here per the repo rule that every applied
-- migration is reproducible.
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
    -- Map readiness color -> training action. Before a check-in exists there is no
    -- readiness signal, so seed UNCONFIRMED (honest "awaiting check-in") rather than a
    -- misleading FULL that could be frozen before the real RED/RECOVERY arrives.
    case lower(coalesce(re.color, ''))
      when 'red'    then 'RECOVERY'
      when 'yellow' then 'REDUCED'
      when 'green'  then 'FULL'
      else 'UNCONFIRMED'
    end,
    t.md_day
  from public.players p
  left join public.v_training_day_context_team t
    on t.team_id = p.team_id
   and t."date" = p_date
  left join public.readiness_entries re
    on re.player_id = p.id
   and re.entry_date = p_date
  where not exists (
    select 1
    from public.stage4_decisions s
    where s.player_id = p.id
      and s.entry_date = p_date
  );
end;
$function$;
