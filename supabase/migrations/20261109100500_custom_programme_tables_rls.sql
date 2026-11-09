-- Custom programme tables (one per custom_template_sets.table_name) are created at runtime by
-- create_custom_microdose_table, which left row-level security off. Any login could therefore read, change and delete
-- every team's programme from the browser. Breidablik's table had RLS, but its read policy was USING (true).
--
-- Players and the TV display read these tables from the browser, so they stay readable for the team that owns the rows.
-- All writes go through the server (service role and the save_custom_template_records RPC). No browser code writes to them.

-- Who may read a team's programme. Definer, so it can read profiles and memberships whatever their own policies say.
create or replace function public.can_read_team_programme(p_team uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $fn$
  select p_team is not null and (
    exists (select 1 from profiles where id = auth.uid() and (is_admin or team_id = p_team))
    or exists (select 1 from staff_users where user_id = auth.uid() and role = 'staff')
    or exists (select 1 from coach_teams where coach_id = auth.uid() and team_id = p_team)
    or exists (select 1 from players where user_id = auth.uid() and team_id = p_team)
    or exists (
      select 1
      from players pl
      join player_team_memberships m on m.player_id = pl.id
      where pl.user_id = auth.uid()
        and m.team_id = p_team
        and m.status = 'active'
        and m.valid_from <= current_date
        and (m.valid_to is null or m.valid_to >= current_date)
    )
  )
$fn$;
revoke all on function public.can_read_team_programme(uuid) from public, anon;
grant execute on function public.can_read_team_programme(uuid) to authenticated, service_role;

-- One place that locks a programme table, used here and by create_custom_microdose_table.
create or replace function public.secure_custom_programme_table(p_table_name text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $fn$
begin
  if p_table_name !~ '^[a-z][a-z0-9_]*$' then
    raise exception 'Invalid table name: %', p_table_name;
  end if;
  execute format('alter table public.%I enable row level security', p_table_name);
  execute format('revoke all on public.%I from public, anon, authenticated', p_table_name);
  execute format('grant select on public.%I to authenticated', p_table_name);
  execute format('grant all on public.%I to service_role', p_table_name);
  execute format('drop policy if exists team_programme_read on public.%I', p_table_name);
  execute format(
    'create policy team_programme_read on public.%I for select to authenticated using (can_read_team_programme(team_id))',
    p_table_name
  );
end;
$fn$;
revoke all on function public.secure_custom_programme_table(text) from public, anon, authenticated;
grant execute on function public.secure_custom_programme_table(text) to service_role;

-- Tables created from now on are locked from the start. The rest of the body is unchanged.
create or replace function public.create_custom_microdose_table(p_table_name text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
  c record;
  v_idx text := 'cmt_' || substr(md5(p_table_name), 1, 20) || '_phase_uq';
BEGIN
  IF p_table_name !~ '^[a-z][a-z0-9_]*$' THEN
    RAISE EXCEPTION 'Invalid table name: %', p_table_name;
  END IF;

  EXECUTE format($sql$
    CREATE TABLE IF NOT EXISTS %I (
      id              uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
      team_id         uuid,
      md_day          text        NOT NULL,
      readiness_level text        NOT NULL,
      title           text        NOT NULL,
      description     text,
      structure       jsonb       NOT NULL DEFAULT '[]'::jsonb,
      variant         text        NOT NULL DEFAULT 'A',
      season_phase    text        NOT NULL DEFAULT 'inseason',
      created_at      timestamptz DEFAULT now()
    )
  $sql$, p_table_name);

  EXECUTE format(
    'ALTER TABLE %I ADD COLUMN IF NOT EXISTS season_phase text NOT NULL DEFAULT ''inseason''',
    p_table_name
  );

  FOR c IN
    SELECT con.conname
    FROM pg_constraint con
    WHERE con.conrelid = p_table_name::regclass
      AND con.contype = 'u'
      AND (
        SELECT array_agg(att.attname::text ORDER BY att.attname::text)
        FROM unnest(con.conkey) k
        JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = k
      ) = ARRAY['md_day','readiness_level','team_id','variant']::text[]
  LOOP
    EXECUTE format('ALTER TABLE %I DROP CONSTRAINT %I', p_table_name, c.conname);
  END LOOP;

  EXECUTE format(
    'CREATE UNIQUE INDEX IF NOT EXISTS %I ON %I (team_id, md_day, readiness_level, variant, season_phase)',
    v_idx, p_table_name
  );

  PERFORM public.secure_custom_programme_table(p_table_name);
END;
$function$;

-- Existing tables. The two shared tables are not custom programmes and keep their own rules: microdose_templates is
-- scoped to the caller's team, and global_microdose_templates holds no team's data.
drop policy if exists "Authenticated users can read breidablik templates"
  on public.breidablik_football_karlar_microdose_templates;

do $$
declare
  t text;
begin
  for t in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and c.relname ~ 'microdose_templates'
      and c.relname not in ('microdose_templates', 'global_microdose_templates')
      and exists (
        select 1 from pg_attribute a
        where a.attrelid = c.oid and a.attname = 'team_id' and not a.attisdropped
      )
  loop
    perform public.secure_custom_programme_table(t);
  end loop;
end $$;
