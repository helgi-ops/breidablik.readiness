-- Perf: consolidate duplicate PERMISSIVE SELECT policies (Supabase lint
-- "Multiple Permissive Policies"). When a table has >1 permissive SELECT policy
-- for the same role, Postgres applies each as a separate qual and ORs them per
-- query. Merging them into ONE policy `USING (A OR B [OR C…])` is
-- identity-preserving (permissive policies combine by OR, by definition) and lets
-- the planner apply a single barrier.
--
-- SCOPE: SELECT only, and only groups whose policies share the SAME role set — so
-- no policy's audience changes (no role widening). Each group's quals are already
-- InitPlan-wrapped from the earlier auth.uid() fix, so the merge preserves that.
-- WRITE-side duplicates (INSERT/UPDATE) are left for a separate pass (WITH CHECK
-- semantics need per-case care; writes are low-volume, not a read-path hot spot).
--
-- Atomic (single DO block): any failure rolls the whole batch back.
do $$
declare
  g record;
  merged_qual text;
  roles_sql text;
  newname text;
  pol text;
begin
  for g in
    select tablename,
           array(select unnest(roles) order by 1) as role_set,
           array_agg(policyname order by policyname) as names,
           array_agg(qual order by policyname) as quals
    from pg_policies
    where schemaname = 'public' and cmd = 'SELECT' and permissive = 'PERMISSIVE' and qual is not null
    group by tablename, array(select unnest(roles) order by 1)
    having count(*) > 1
  loop
    merged_qual := '(' || array_to_string(g.quals, ') or (') || ')';
    select string_agg(quote_ident(r), ', ') into roles_sql from unnest(g.role_set) as r;
    newname := left(g.tablename || '_sel_' || array_to_string(g.role_set, '_') || '_merged', 63);

    foreach pol in array g.names loop
      execute format('drop policy %I on public.%I', pol, g.tablename);
    end loop;
    execute format('drop policy if exists %I on public.%I', newname, g.tablename);
    execute format('create policy %I on public.%I for select to %s using (%s)',
      newname, g.tablename, roles_sql, merged_qual);
  end loop;
end $$;
