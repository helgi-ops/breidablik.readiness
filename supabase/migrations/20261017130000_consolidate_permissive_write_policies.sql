-- Perf: consolidate duplicate PERMISSIVE write policies (INSERT / UPDATE) —
-- the write-side companion to the SELECT consolidation. Same identity-preserving
-- OR-merge (permissive policies combine by OR), applied to the right clause(s):
--   INSERT → WITH CHECK (checkA OR checkB)
--   UPDATE → USING (usingA OR usingB) WITH CHECK (checkA OR checkB)
--
-- Scope: same-role-set groups only (no audience change). Every group here has a
-- uniform shape (all INSERT members carry WITH CHECK; all UPDATE members carry
-- BOTH USING and WITH CHECK), so there is no null-clause substitution to reason
-- about — and the guard below SKIPS any group that is not uniform, leaving it
-- untouched rather than risk a wrong merge. Atomic (rolls back on any failure).
do $$
declare
  g record;
  merged_using text;
  merged_check text;
  roles_sql text;
  newname text;
  pol text;
begin
  for g in
    select tablename, cmd,
      array(select unnest(roles) order by 1) as role_set,
      array_agg(policyname order by policyname) as names,
      array_agg(qual order by policyname) as quals,
      array_agg(with_check order by policyname) as checks,
      bool_and(with_check is not null) as all_have_check,
      bool_and(qual is not null) as all_have_using
    from pg_policies
    where schemaname = 'public' and permissive = 'PERMISSIVE' and cmd in ('INSERT','UPDATE')
    group by tablename, cmd, array(select unnest(roles) order by 1)
    having count(*) > 1
  loop
    select string_agg(quote_ident(r), ', ') into roles_sql from unnest(g.role_set) as r;
    newname := left(g.tablename || '_' || lower(g.cmd) || '_' || array_to_string(g.role_set, '_') || '_merged', 63);

    if g.cmd = 'INSERT' then
      if not g.all_have_check then continue; end if;             -- not uniform → skip
      merged_check := '(' || array_to_string(g.checks, ') or (') || ')';
      foreach pol in array g.names loop execute format('drop policy %I on public.%I', pol, g.tablename); end loop;
      execute format('drop policy if exists %I on public.%I', newname, g.tablename);
      execute format('create policy %I on public.%I for insert to %s with check (%s)', newname, g.tablename, roles_sql, merged_check);
    elsif g.cmd = 'UPDATE' then
      if not (g.all_have_check and g.all_have_using) then continue; end if;  -- not uniform → skip
      merged_using := '(' || array_to_string(g.quals, ') or (') || ')';
      merged_check := '(' || array_to_string(g.checks, ') or (') || ')';
      foreach pol in array g.names loop execute format('drop policy %I on public.%I', pol, g.tablename); end loop;
      execute format('drop policy if exists %I on public.%I', newname, g.tablename);
      execute format('create policy %I on public.%I for update to %s using (%s) with check (%s)', newname, g.tablename, roles_sql, merged_using, merged_check);
    end if;
  end loop;
end $$;
