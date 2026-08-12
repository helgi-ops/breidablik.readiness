-- Refine the stage4 re-sync: a row is only a GENUINE (protected) lock when the lock was
-- actually stamped — locked_at / locked_by set, or a coach_decision exists. Many rows were
-- seeded with locked=true but locked_at/locked_by/coach_decision all NULL (a pre-check-in
-- placeholder default), which the previous version treated as a real lock and never
-- re-synced. Those are not coach decisions, so they must follow readiness_entries
-- .training_action like any unlocked row. Genuine coach locks are still never touched.
-- Descriptive decision-action only — does NOT change readiness_entries.color / the verdict.
-- Applied via mcp apply_migration; committed here per the repo rule that every applied
-- migration is reproducible.
CREATE OR REPLACE FUNCTION public.stage4_ensure_decision(p_player_id uuid, p_entry_date date)
 RETURNS SETOF stage4_decisions_final
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_team_id uuid;
  v_system_decision text;
  v_basis text;
  v_md_context text;
  v_genuine_lock boolean;
  v_exists boolean;
begin
  select true,
    (coalesce(s.locked, false) = true
      and (s.locked_at is not null or s.locked_by is not null or s.coach_decision is not null))
  into v_exists, v_genuine_lock
  from public.stage4_decisions s
  where s.player_id = p_player_id and s.entry_date = p_entry_date
  limit 1;

  -- A GENUINE coach-locked decision is final — never touch it. (A bare locked=true with
  -- no locked_at/locked_by/coach_decision is a seed placeholder, not a real lock.)
  if coalesce(v_genuine_lock, false) = true then
    return query
    select * from public.stage4_decisions_final f
    where f.player_id = p_player_id and f.entry_date = p_entry_date;
    return;
  end if;

  select r.team_id, r.training_action, r.computed_auto_reason, r.md_day
  into v_team_id, v_system_decision, v_basis, v_md_context
  from public.readiness_entries r
  where r.player_id = p_player_id and r.entry_date = p_entry_date
  order by r.created_at desc
  limit 1;

  if v_system_decision is null then
    if coalesce(v_exists, false) = true then
      return query
      select * from public.stage4_decisions_final f
      where f.player_id = p_player_id and f.entry_date = p_entry_date;
      return;
    end if;

    select p.team_id into v_team_id
    from public.players p
    where p.id = p_player_id
    limit 1;

    v_system_decision := 'UNCONFIRMED';
    v_basis := 'No readiness entry found -> UNCONFIRMED (awaiting check-in or coach override).';
    v_md_context := coalesce(v_md_context, 'GENERIC');
  end if;

  insert into public.stage4_decisions (
    player_id, team_id, entry_date,
    system_decision, system_md_context, system_variant, system_basis
  )
  values (
    p_player_id, v_team_id, p_entry_date,
    v_system_decision, v_md_context, 'A', v_basis
  )
  on conflict on constraint stage4_decisions_player_date_uniq
  do update
    set system_decision   = excluded.system_decision,
        system_basis      = excluded.system_basis,
        system_md_context = excluded.system_md_context,
        team_id           = excluded.team_id,
        updated_at        = now()
  where not (coalesce(public.stage4_decisions.locked, false) = true
             and (public.stage4_decisions.locked_at is not null
                  or public.stage4_decisions.locked_by is not null
                  or public.stage4_decisions.coach_decision is not null))
    and (public.stage4_decisions.system_decision   is distinct from excluded.system_decision
      or public.stage4_decisions.system_basis      is distinct from excluded.system_basis
      or public.stage4_decisions.system_md_context is distinct from excluded.system_md_context);

  return query
  select * from public.stage4_decisions_final f
  where f.player_id = p_player_id and f.entry_date = p_entry_date;
end;
$function$;

-- Backfill: re-sync every non-genuinely-locked stale row (unlocked OR seed-pseudo-locked)
-- from the latest readiness_entries.training_action. Genuine coach locks (coach_decision
-- set, or a stamped locked_at/locked_by) are excluded and preserved.
update public.stage4_decisions s
set system_decision   = latest.training_action,
    system_basis      = coalesce(latest.computed_auto_reason, s.system_basis),
    system_md_context = coalesce(latest.md_day, s.system_md_context),
    updated_at        = now()
from (
  select distinct on (player_id, entry_date)
    player_id, entry_date, training_action, computed_auto_reason, md_day
  from public.readiness_entries
  where training_action is not null
  order by player_id, entry_date, created_at desc
) latest
where latest.player_id = s.player_id
  and latest.entry_date = s.entry_date
  and s.system_decision is distinct from latest.training_action
  and not (coalesce(s.locked, false) = true
           and (s.locked_at is not null or s.locked_by is not null or s.coach_decision is not null));
