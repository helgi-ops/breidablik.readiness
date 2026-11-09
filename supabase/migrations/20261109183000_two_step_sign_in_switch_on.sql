-- Switch two-step sign-in on (docs/security/admin-mfa.md). Applied 2026-11-09 with the coach's go-ahead.
-- 1. API routes: flag every admin that has a verified app. Reaches tokens at the next refresh, within an hour.
update auth.users u
set raw_app_meta_data = coalesce(u.raw_app_meta_data, '{}'::jsonb) || '{"mfa_required": true}'::jsonb
where exists (select 1 from public.profiles p where p.id = u.id and p.is_admin)
  and exists (select 1 from auth.mfa_factors f where f.user_id = u.id and f.status = 'verified');

-- 2. Realtime tables: Realtime does not pass through PostgREST, so these get their own restrictive policy.
drop policy if exists two_step_required on public.match_schedule;
create policy two_step_required on public.match_schedule as restrictive for all to authenticated
  using ((select public.two_step_session_ok())) with check ((select public.two_step_session_ok()));
drop policy if exists two_step_required on public.player_coach_messages;
create policy two_step_required on public.player_coach_messages as restrictive for all to authenticated
  using ((select public.two_step_session_ok())) with check ((select public.two_step_session_ok()));

-- 3. Browser database requests: PostgREST runs the check before every request.
alter role authenticator set pgrst.db_pre_request = 'public.enforce_two_step_sign_in';
notify pgrst, 'reload config';
