-- ─────────────────────────────────────────────────────────────────────────
-- stage4_bootstrap_for_date — now respects readiness_entries.color
--
-- BEFORE: hardcoded system_decision = 'FULL' for every new stub row,
-- regardless of whether the player was already flagged YELLOW or RED on
-- their readiness check. Coaches saw "system recommends FULL" on players
-- the dashboard had flagged in red — internal contradiction that eroded
-- trust. The 30-day audit (28 May 2026): of 778 player-days with a
-- readiness color, 121/135 yellow days and 78/100 red days had stage4
-- still saying FULL because they were bootstrap stubs that no one
-- explicitly saved.
--
-- AFTER: bootstrap looks up the readiness color for the same (player,
-- date) and maps it through the same RED→RECOVERY / YELLOW→REDUCED /
-- GREEN→FULL rule the coach UI uses (flagToAction). Stays as 'FULL' only
-- when there's no readiness entry yet (haven't checked in).
--
-- See CLAUDE.md > "Canonical verdict source": readiness_entries.color
-- is the authoritative verdict; all downstream pipelines should respect it.
-- ─────────────────────────────────────────────────────────────────────────

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
    -- Map readiness color → training action. Falls back to FULL when
    -- there's no readiness entry yet (player hasn't checked in today).
    case lower(coalesce(re.color, ''))
      when 'red'    then 'RECOVERY'
      when 'yellow' then 'REDUCED'
      when 'green'  then 'FULL'
      else 'FULL'   -- no check-in yet → benefit of the doubt
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
