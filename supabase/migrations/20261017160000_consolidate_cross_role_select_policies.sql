-- Perf: consolidate the remaining cross-role-set permissive SELECT pairs (the last
-- "Multiple Permissive Policies" cases). Each of these 7 tables has a {public}
-- SELECT policy AND an {authenticated} one; both apply to an authenticated user, so
-- the planner evaluates two quals. Merge into ONE `TO public USING (A OR B)`.
--
-- SAFETY — no anon widening: every table already has a {public} (or {anon,
-- authenticated}) policy that defines what anon may read; that qual is preserved
-- verbatim in the OR. The {authenticated}-side branch is entirely auth-context
-- based (auth.uid() directly, or SECURITY DEFINER helpers — player_accessible_
-- to_current_coach / coach_team_ids / my_player_id / is_admin / is_staff — that
-- resolve the current user), so it yields NOTHING for anon (auth.uid() is null).
-- Merging it under `TO public` therefore grants anon nothing new. Verified by an
-- anon BEFORE/AFTER snapshot (teams 106, workout_templates 42, the rest 0 — all
-- from the public side; unchanged after the merge).
--
-- NOT included: coach_teams — its two policies are TO {anon} and TO {authenticated}
-- (disjoint roles, no effective overlap), so it is not a real duplicate and the
-- anon-facing policy is left intact. Atomic DO block.
do $$
declare
  g record;
  merged text;
  newname text;
  pol text;
begin
  for g in
    select tablename,
           array_agg(policyname order by policyname) as names,
           array_agg(qual order by policyname) as quals
    from pg_policies
    where schemaname = 'public' and cmd = 'SELECT' and permissive = 'PERMISSIVE'
      and tablename in ('teams','player_injuries','player_session_rpe','players','profiles','readiness_entries','workout_templates')
    group by tablename
    having count(*) > 1
  loop
    merged := '(' || array_to_string(g.quals, ') or (') || ')';
    newname := left(g.tablename || '_sel_merged', 63);
    foreach pol in array g.names loop
      execute format('drop policy %I on public.%I', pol, g.tablename);
    end loop;
    execute format('drop policy if exists %I on public.%I', newname, g.tablename);
    execute format('create policy %I on public.%I for select to public using (%s)', newname, g.tablename, merged);
  end loop;
end $$;
