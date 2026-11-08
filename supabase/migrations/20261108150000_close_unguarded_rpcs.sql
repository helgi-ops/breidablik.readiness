-- The first tenant audit found SECURITY DEFINER functions any client could call.
-- Definer functions skip row-level security, so the function body is the only guard.

-- No caller in the app, and no team check in the body: any login could overwrite another team's Stage 4 decision or lock
-- any check-in. join_team_with_code moved a profile into any team that had a code, and a coach could write that code.
do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.stage4_apply_override(uuid, date, text, text)',
    'public.stage4_apply_override(uuid, date, text, text, text)',
    'public.stage4_set_coach_override(uuid, date, text, text)',
    'public.stage4_set_coach_variant(uuid, date, text)',
    'public.lock_readiness_entry(uuid)',
    'public.join_team_with_code(text)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end $$;

-- These check the caller in the body and are used by logged-in clients. They need a login.
do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.accept_client_invitation(text)',
    'public.accept_coach_invitation(text)',
    'public.admin_compliance_flags()',
    'public.stage4_generate_today_decisions(uuid, date)',
    'public.ensure_player_for_user()',
    'public.share_drill_with_team(uuid, uuid)',
    'public.lock_team_microdose_plans(date)'
  ] loop
    execute format('revoke all on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated, service_role', fn);
  end loop;
end $$;

-- The audit catalog learns who each policy applies to and which functions are triggers,
-- so server-only policies and trigger functions stop reading as findings.
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
        'roles', (select coalesce(jsonb_agg(pg_get_userbyid(r)), '[]'::jsonb) from unnest(p.polroles) r where r <> 0),
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
        'returns_trigger', p.prorettype = 'trigger'::regtype,
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

revoke all on function public.tenant_audit_catalog() from public, anon, authenticated;
grant execute on function public.tenant_audit_catalog() to service_role;
