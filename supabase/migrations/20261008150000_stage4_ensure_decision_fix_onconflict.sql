-- Fix: stage4_decisions stopped being written on 2026-09-14 (dropped-constraint regression).
--
-- 20260914130000_dedupe_unique_constraints.sql dropped the redundant twin
-- `stage4_decisions_player_date_uniq`, keeping the identical `stage4_decisions_player_id_entry_date_key`
-- UNIQUE (player_id, entry_date). But `stage4_ensure_decision` (the SECURITY DEFINER upsert the coach
-- Today / /api/stage4/coach + /api/stage4/ensure-decision RPCs call per player) used
-- `on conflict on constraint stage4_decisions_player_date_uniq`. With that constraint gone every insert
-- raised "constraint … does not exist", so NO stage4 decision row has been created since 2026-09-15.
-- readiness_entries (and the canonical colour view) were unaffected — only the action layer
-- (FULL/REDUCED/RECOVERY, Decision Summary, v_team_readiness_today, the Command Center KPI tiles) went dark.
--
-- Fix = repoint ON CONFLICT at the surviving twin by COLUMN (player_id, entry_date). We do NOT re-add
-- the dropped constraint — its removal was intentional. Audited: `stage4_ensure_decision` is the ONLY
-- live routine that named any of the three dropped constraints; no TS code references them.
--
-- Boundary (CLAUDE.md): stage4_decisions.final_decision is the TRAINING ACTION, never the readiness
-- colour. This restores the action layer only; readiness_entries.color / v_coach_readiness_today_v8
-- are untouched.

-- 1) Recreate the function with column-based ON CONFLICT (backed by stage4_decisions_player_id_entry_date_key).
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
  on conflict (player_id, entry_date)
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

-- 2) Backfill the gap. Regenerate stage4 for every readiness player-day that has NO stage4 row yet.
--    Idempotent (unique on player_id, entry_date) and self-bounding — on first apply this repopulates
--    the 2026-09-15 → today gap; on any later replay it only touches rows that are genuinely missing.
DO $backfill$
declare
  r record;
begin
  for r in
    select distinct re.player_id, re.entry_date
    from public.readiness_entries re
    where not exists (
      select 1 from public.stage4_decisions sd
      where sd.player_id = re.player_id and sd.entry_date = re.entry_date
    )
  loop
    perform public.stage4_ensure_decision(r.player_id, r.entry_date);
  end loop;
end
$backfill$;

-- 3) Deploy-time smoke guard. If any readiness entry exists, ensure() must succeed and yield a
--    stage4 row — so a future constraint rename that breaks the ON CONFLICT target fails THIS
--    migration loudly instead of silently killing stage4 writes again. No-ops on an empty DB.
DO $guard$
declare
  r record;
  n int;
begin
  select re.player_id, re.entry_date into r
  from public.readiness_entries re
  order by re.entry_date desc, re.created_at desc
  limit 1;

  if r.player_id is not null then
    perform public.stage4_ensure_decision(r.player_id, r.entry_date);
    select count(*) into n from public.stage4_decisions sd
    where sd.player_id = r.player_id and sd.entry_date = r.entry_date;
    if n = 0 then
      raise exception 'stage4_ensure_decision smoke guard failed: no stage4 row for %/% after ensure()', r.player_id, r.entry_date;
    end if;
  end if;
end
$guard$;
