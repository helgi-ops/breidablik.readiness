-- Read-only catalog for the nightly tenant-isolation audit. Only service_role may call it.

create table if not exists public.security_audit_runs (
  id uuid primary key default gen_random_uuid(),
  ran_at timestamptz not null default now(),
  high_count int not null default 0,
  new_high_count int not null default 0,
  findings jsonb not null default '[]'::jsonb
);
alter table public.security_audit_runs enable row level security;
revoke all on public.security_audit_runs from anon, authenticated;

create or replace function public.tenant_audit_catalog()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  select jsonb_build_object(
    'tables', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'name', c.relname,
        'rls', c.relrowsecurity,
        'tenant', exists (select 1 from information_schema.columns ic where ic.table_schema = 'public' and ic.table_name = c.relname and ic.column_name in ('team_id', 'player_id')),
        'anon_select', has_table_privilege('anon', c.oid, 'select'),
        'authenticated_select', has_table_privilege('authenticated', c.oid, 'select'),
        'authenticated_write', has_table_privilege('authenticated', c.oid, 'insert') or has_table_privilege('authenticated', c.oid, 'update')
      ) order by c.relname), '[]'::jsonb)
      from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
    ),
    'policies', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'table', c.relname,
        'name', p.polname,
        'cmd', p.polcmd::text,
        'using', pg_get_expr(p.polqual, p.polrelid),
        'check', pg_get_expr(p.polwithcheck, p.polrelid)
      ) order by c.relname, p.polname), '[]'::jsonb)
      from pg_policy p join pg_class c on c.oid = p.polrelid
      where c.relnamespace = 'public'::regnamespace
    ),
    'views', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'name', c.relname,
        'invoker', coalesce(c.reloptions::text[] && array['security_invoker=true', 'security_invoker=on'], false),
        'anon_select', has_table_privilege('anon', c.oid, 'select')
      ) order by c.relname), '[]'::jsonb)
      from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('v', 'm')
    ),
    'functions', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'name', p.proname,
        'anon_exec', has_function_privilege('anon', p.oid, 'execute'),
        'authenticated_exec', has_function_privilege('authenticated', p.oid, 'execute'),
        'checks_caller', p.prosrc ~* 'auth\.uid\(\)|is_admin\(\)|is_staff\(\)|is_elevated_staff\(\)|coach_team_ids\(\)|coaches_team\('
      ) order by p.proname), '[]'::jsonb)
      from pg_proc p
      where p.pronamespace = 'public'::regnamespace and p.prosecdef and p.prokind = 'f'
        and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
    ),
    'profiles_update_columns', (
      select coalesce(jsonb_agg(a.attname order by a.attname), '[]'::jsonb)
      from pg_attribute a
      where a.attrelid = 'public.profiles'::regclass and a.attnum > 0 and not a.attisdropped
        and (has_column_privilege('authenticated', a.attrelid, a.attnum, 'update') or has_column_privilege('anon', a.attrelid, a.attnum, 'update'))
    ),
    'coach_teams_gap', (
      select count(*) from public.profiles p
       where upper(coalesce(p.role, '')) in ('COACH', 'STAFF') and p.team_id is not null
         and not exists (select 1 from public.coach_teams ct where ct.coach_id = p.id and ct.team_id = p.team_id)
    ),
    'signup_function_guarded', (
      select coalesce(
        p.prosrc like '%not in (''PLAYER'', ''COACH'')%'
        and p.prosrc like '%coach_invite_token%'
        and p.prosrc like '%team_invite_token%', false)
      from pg_proc p where p.oid = 'public.handle_new_user'::regproc
    ),
    'elevated_accounts', (
      select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'role', p.role, 'is_admin', p.is_admin) order by p.id), '[]'::jsonb)
      from public.profiles p where coalesce(p.is_admin, false) or upper(coalesce(p.role, '')) in ('ADMIN', 'STAFF')
    )
  );
$function$;

-- Rows whose team differs from the player's current team, ignoring players who really moved (recorded memberships)
-- and previous-club load rows.
create or replace function public.tenant_audit_orphans()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  t text;
  n bigint;
  res jsonb := '{}'::jsonb;
begin
  foreach t in array array['readiness_entries', 'stage4_decisions', 'session_rpe_entries', 'coach_signals'] loop
    if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = t and column_name = 'team_id')
       and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = t and column_name = 'player_id') then
      execute format(
        'select count(*) from public.%I r join public.players p on p.id = r.player_id
          where r.team_id is distinct from p.team_id
            and not exists (select 1 from public.player_team_memberships m where m.player_id = r.player_id and m.team_id = r.team_id)',
        t
      ) into n;
      res := res || jsonb_build_object(t, n);
    end if;
  end loop;
  return res;
end;
$function$;

revoke all on function public.tenant_audit_catalog() from public, anon, authenticated;
revoke all on function public.tenant_audit_orphans() from public, anon, authenticated;
grant execute on function public.tenant_audit_catalog() to service_role;
grant execute on function public.tenant_audit_orphans() to service_role;
