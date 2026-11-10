-- FREE lock on the server (trials ended Nov 2026).
-- A team is FREE-locked when plan_tier = 'FREE' and it is not a personal-trainer practice. Same rule as
-- isFreeLocked() in src/lib/micropulse/product/freeLock.ts. PRO/ELITE and PT teams are never affected.

-- 1. One SQL definition of the rule.
create or replace function public.is_free_locked_team(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select upper(coalesce(t.plan_tier, 'FREE')) = 'FREE'
            and lower(coalesce(t.team_type, '')) <> 'personal_trainer'
       from public.teams t where t.id = p_team_id),
    false)
$$;

-- 2. For the API proxy: is this signed-in user's current team FREE-locked?
--    Current team = profiles.team_id, falling back to the player's team. Unknown user / no team → false
--    (the request goes through; only a positively FREE-locked team is refused).
create or replace function public.free_locked_for_user(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.is_free_locked_team(
    (select coalesce(pr.team_id, pl.team_id)
       from public.profiles pr
       left join public.players pl on pl.id = pr.player_id
      where pr.id = p_user_id)), false)
$$;

revoke all on function public.is_free_locked_team(uuid) from public, anon, authenticated;
revoke all on function public.free_locked_for_user(uuid) from public, anon, authenticated;
grant execute on function public.is_free_locked_team(uuid) to service_role;
grant execute on function public.free_locked_for_user(uuid) to service_role;

-- 3. Coach alerts (pg_cron): skip FREE-locked teams. Body otherwise unchanged from 20260501204234.
create or replace function public.detect_all_team_notifications()
returns table(team_id uuid, new_count integer)
language plpgsql
security definer
as $function$
BEGIN
  RETURN QUERY
  SELECT
    t.id AS team_id,
    public.detect_coach_notifications(t.id) AS new_count
  FROM public.teams t
  WHERE EXISTS (
    SELECT 1 FROM public.players p
    WHERE p.team_id = t.id
      AND coalesce(p.is_active, true) = true
  )
    AND NOT public.is_free_locked_team(t.id);
END;
$function$;
