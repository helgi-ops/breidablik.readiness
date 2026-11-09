-- Daily plan locks hold only the player's own team's content.
--
-- Found 2026-11-09: every player_microdose_plan_locks row written since 2026-10-13 for a club other than
-- Breiðablik held a Breiðablik session byte for byte. The writer is the check-in trigger
-- lock_microdose_plan_on_readiness -> lock_player_microdose_plan(), which picked the first
-- microdose_templates row for (md_day, readiness) with no team filter. microdose_templates holds only
-- Breiðablik's rows, so every club got Breiðablik's session. It also took the team from profiles.team_id,
-- which is NULL for the demo players and differs from the roster team for a few test accounts.
-- (source = 'week_setup+templates' is the column default, which is how the rows were traced to it.
-- The variant trigger trg_mp_after_checkin_lock_plan is disabled and wrote nothing after 2026-02-15.)
--
-- 1. lock_player_microdose_plan reads the roster team (players.team_id) and only that team's templates.
--    A team with no template gets an empty lock: md_day + readiness are still recorded, because
--    v_player_today_microdose_final takes md_day from the lock first.
-- 2. A BEFORE trigger on the lock table pins team_id to the roster team and empties any plan content
--    that is another team's microdose_templates row or a row of the team-less
--    microdose_template_variants library. It runs for every writer (coach_override_microdose_plan,
--    mp_lock_plan_after_checkin, mp_repair_null_variants, the disabled variant trigger), but it only catches
--    exact copies of those two shared tables' `structure`: not edited copies, not other teams' custom
--    programme tables. No writer reads those today. It empties instead of raising, because it runs inside
--    the check-in insert and must never block a check-in. (trg_fill_lock_md_day sorts first and only sets md_day.)
-- 3. tenant_audit_foreign_plan_content() counts locks holding another team's template, for
--    `npm run audit:tenant` (finding DB_FOREIGN_PLAN_CONTENT).
-- 4. anon loses EXECUTE on the lock-writing RPCs. They are SECURITY INVOKER and RLS already stops anon,
--    so this only removes surface.
--
-- Existing bad locks are NOT changed here; that cleanup runs separately once the user approves it.

create or replace function public.lock_player_microdose_plan(p_player_id uuid, p_day date, p_locked_by uuid default null)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_team_id uuid;
  v_md_day text;
  v_readiness_level text;
  v_title text;
  v_desc text;
  v_struct jsonb;

  v_day date := coalesce(p_day, current_date);
begin
  -- The roster team owns the player's plan. The profile team is only a fallback for a player row with no team.
  select coalesce(pl.team_id, pr.team_id)
    into v_team_id
  from public.players pl
  left join public.profiles pr on pr.id = pl.user_id
  where pl.id = p_player_id
  limit 1;

  begin
    v_md_day := public.get_md_day_for_team_date(v_team_id, v_day);
  exception
    when others then
      v_md_day := 'GENERIC';
  end;

  if v_md_day is null or btrim(v_md_day) = '' then
    v_md_day := 'GENERIC';
  end if;

  begin
    select public.score_to_readiness_level(re.total_score)
      into v_readiness_level
    from public.readiness_entries re
    where re.player_id = p_player_id
      and re.entry_date = v_day
    limit 1;
  exception
    when others then
      v_readiness_level := null;
  end;

  if v_readiness_level is null then
    v_readiness_level := 'GREEN';
  end if;

  -- Only this team's templates: first (md_day, readiness), then (GENERIC, readiness).
  if v_team_id is not null then
    select mt.title, mt.description, mt.structure
      into v_title, v_desc, v_struct
    from public.microdose_templates mt
    where mt.team_id = v_team_id
      and mt.md_day = v_md_day
      and mt.readiness_level = v_readiness_level
    order by mt.variant nulls last
    limit 1;

    if v_struct is null then
      select mt2.title, mt2.description, mt2.structure
        into v_title, v_desc, v_struct
      from public.microdose_templates mt2
      where mt2.team_id = v_team_id
        and mt2.md_day = 'GENERIC'
        and mt2.readiness_level = v_readiness_level
      order by mt2.variant nulls last
      limit 1;
    end if;
  end if;

  -- No template of its own: an empty lock, never another team's session.
  if v_struct is null then
    v_struct := '[]'::jsonb;
    v_title := null;
    v_desc := null;
  end if;

  insert into public.player_microdose_plan_locks
    (player_id, entry_date, team_id, md_day, readiness_level, plan_title, plan_description, plan_structure, locked_by)
  values
    (p_player_id, v_day, v_team_id, v_md_day, v_readiness_level, v_title, v_desc, v_struct, p_locked_by)
  on conflict (player_id, entry_date) do update set
    locked_at = public.player_microdose_plan_locks.locked_at,
    locked_by = public.player_microdose_plan_locks.locked_by;
end;
$function$;

revoke all on function public.lock_player_microdose_plan(uuid, date, uuid) from public, anon, authenticated;
grant execute on function public.lock_player_microdose_plan(uuid, date, uuid) to service_role;

-- Guard for every writer of the lock table.
create or replace function public.tg_lock_plan_team_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_roster_team uuid;
begin
  select p.team_id into v_roster_team from public.players p where p.id = new.player_id;
  if v_roster_team is not null then
    new.team_id := v_roster_team;
  end if;

  if new.plan_structure is not null and new.plan_structure <> '[]'::jsonb
     and not exists (
       select 1 from public.microdose_templates mt
       where mt.structure = new.plan_structure and mt.team_id = new.team_id
     )
     and (
       exists (
         select 1 from public.microdose_templates mt
         where mt.structure = new.plan_structure and mt.team_id is distinct from new.team_id
       )
       or exists (
         select 1 from public.microdose_template_variants v where v.structure = new.plan_structure
       )
     ) then
    raise warning 'player_microdose_plan_locks: emptied a plan that belongs to another team (player %, date %)',
      new.player_id, new.entry_date;
    new.plan_structure := '[]'::jsonb;
    new.plan_title := null;
    new.plan_description := null;
  end if;

  return new;
end;
$function$;

revoke all on function public.tg_lock_plan_team_guard() from public, anon, authenticated;

drop trigger if exists trg_lock_plan_team_guard on public.player_microdose_plan_locks;
create trigger trg_lock_plan_team_guard
  before insert or update on public.player_microdose_plan_locks
  for each row execute function public.tg_lock_plan_team_guard();

-- Audit: locks whose content is another team's template (and not also their own team's).
create or replace function public.tenant_audit_foreign_plan_content()
returns jsonb
language sql
stable
security definer
set search_path = public
as $function$
  select jsonb_build_object(
    'player_microdose_plan_locks',
    (select count(*)
       from public.player_microdose_plan_locks l
       join public.players p on p.id = l.player_id
      where l.plan_structure <> '[]'::jsonb
        and exists (select 1 from public.microdose_templates mt
                     where mt.structure = l.plan_structure and mt.team_id is distinct from p.team_id)
        and not exists (select 1 from public.microdose_templates mt
                         where mt.structure = l.plan_structure and mt.team_id = p.team_id))
  );
$function$;

revoke all on function public.tenant_audit_foreign_plan_content() from public, anon, authenticated;
grant execute on function public.tenant_audit_foreign_plan_content() to service_role;

-- The lock-writing RPCs need a login.
revoke execute on function public.coach_override_microdose_plan(uuid, date, uuid, text) from public, anon;
revoke execute on function public.mp_lock_plan_after_checkin(uuid, date, uuid, text, text, text, text, jsonb) from public, anon;
grant execute on function public.coach_override_microdose_plan(uuid, date, uuid, text) to authenticated, service_role;
grant execute on function public.mp_lock_plan_after_checkin(uuid, date, uuid, text, text, text, text, jsonb) to authenticated, service_role;
