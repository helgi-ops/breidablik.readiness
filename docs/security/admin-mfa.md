# Two-step sign-in for admins

Admins register an authenticator app at `/admin/security`. Once registered, sign-in asks for a 6-digit code.

## Lost device

Supabase has no recovery codes, so keep a second app on a second device. If every app is lost, someone with
Supabase access removes the factor: Authentication, Users, open the user, remove the factor. That access is itself
protected by two-step sign-in on the Supabase account.

## Enforcement

Registering an app and the code step do not on their own stop a password-only session from reaching admin data.
Enforcement is a separate step, switched on only after every admin has registered and tested sign-in.
