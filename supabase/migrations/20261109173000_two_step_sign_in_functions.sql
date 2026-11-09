-- Two-step sign-in, database side (docs/security/admin-mfa.md). Creating these changes nothing: the pre-request
-- function only acts once PostgREST is pointed at it, and the policy helper only once a policy uses it.

-- An account with a verified authenticator app may reach the database only from a session that entered a code.
-- Any failure while checking lets the request through: a bad claim must never block every user.
create or replace function public.enforce_two_step_sign_in()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  claims jsonb;
  owes_code boolean := false;
begin
  begin
    claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
    if claims ->> 'role' = 'authenticated' and coalesce(claims ->> 'aal', 'aal1') <> 'aal2' then
      owes_code := exists (
        select 1 from auth.mfa_factors f
        where f.user_id = (claims ->> 'sub')::uuid and f.status = 'verified'
      );
    end if;
  exception when others then
    owes_code := false;
  end;
  if owes_code then
    raise sqlstate 'PT401' using
      message = 'Two-step sign-in required',
      hint = 'Sign in again and enter the code from your authenticator app.';
  end if;
end;
$$;

revoke all on function public.enforce_two_step_sign_in() from public;
grant execute on function public.enforce_two_step_sign_in() to anon, authenticated, service_role;

-- Same rule as a boolean, for restrictive policies on tables that Realtime streams (Realtime skips PostgREST).
create or replace function public.two_step_session_ok()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select auth.jwt() ->> 'aal'), 'aal1') = 'aal2'
      or not exists (
        select 1 from auth.mfa_factors f
        where f.user_id = (select auth.uid()) and f.status = 'verified'
      );
$$;

revoke all on function public.two_step_session_ok() from public;
grant execute on function public.two_step_session_ok() to anon, authenticated, service_role;
