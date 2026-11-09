# Two-step sign-in for admins

Admins register an authenticator app at `/admin/security`. Once registered, sign-in asks for a 6-digit code.

## Lost device

Supabase has no recovery codes, so keep a second app on a second device. If every app is lost, someone with
Supabase access removes the factor: Authentication, Users, open the user, remove the factor. That access is itself
protected by two-step sign-in on the Supabase account.

## Enforcement

A session that has not entered its code (`aal` other than `aal2` in the token) is refused in three places:

| Where | Rule | Code |
|---|---|---|
| API routes | token carries `app_metadata.mfa_required = true` | `src/proxy.ts`, `src/lib/auth/twoStep.ts`, cookie path in `src/lib/notifications/auth.ts` |
| Browser database reads and writes | account has a verified app | PostgREST pre-request `public.enforce_two_step_sign_in()` |
| Realtime tables (`match_schedule`, `player_coach_messages`) | account has a verified app | restrictive policy on `public.two_step_session_ok()` |

The proxy only decodes the token, which is safe because it can only refuse: every route still verifies the token.
The flag is set by hand on admin accounts; an admin added later needs it too:

```sql
update auth.users set raw_app_meta_data = raw_app_meta_data || '{"mfa_required": true}' where id = '<user id>';
```

The flag reaches the token at the next refresh, within an hour.

The sign-in screen, the admin area and the password reset ask for the code before they read anything else.

### Switching it off

Each part stops on its own:

- API routes: remove the flag, `update auth.users set raw_app_meta_data = raw_app_meta_data - 'mfa_required' where id = '<user id>';`
- Database: `alter role authenticator reset pgrst.db_pre_request; notify pgrst, 'reload config';`
- Realtime tables: drop the two `two_step_required` policies.

If an admin is locked out, removing their factor in Supabase (see Lost device) lifts all three at once for the
database, and removing the flag lifts the API check.
