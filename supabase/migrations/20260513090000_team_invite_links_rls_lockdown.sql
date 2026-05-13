-- Lock down team_invite_links — CRITICAL security fix
--
-- Supabase Security Advisor flagged this table on May 13 2026:
--   • rls_disabled_in_public  → RLS not enabled, table fully public
--   • sensitive_columns_exposed → `token` column readable by anon
--
-- The token column is the secret that grants team access. With anon
-- having SELECT (the legacy default), anyone with the project's anon
-- key could enumerate every invite token in the database and join any
-- team. The legacy default also gave anon INSERT/UPDATE/DELETE/TRUNCATE,
-- which compounds the issue (attacker could rewrite invites to redirect
-- joins or wipe the table).
--
-- All real usage in the app goes through /api/team-invites/* server
-- routes that use the service_role key (getSupabaseAdmin). No client-
-- side supabase-js code touches this table directly, so revoking
-- anon + authenticated access is safe.
--
-- Fix:
--   1. Revoke every privilege from anon + authenticated.
--   2. Keep service_role's full access (server-side jobs still work).
--   3. Enable RLS so even if grants drift back later, RLS still blocks.
--   4. Deliberately add NO policies for anon/authenticated. Service_role
--      bypasses RLS by design; everyone else is denied.

-- 1. Revoke client-side privileges
revoke all on public.team_invite_links from anon;
revoke all on public.team_invite_links from authenticated;

-- 2. Service role keeps everything (defensive grant — already has these
--    via default Supabase setup, but explicit makes the intent obvious).
grant select, insert, update, delete on public.team_invite_links to service_role;

-- 3. Enable RLS
alter table public.team_invite_links enable row level security;

-- 4. No policies. Service role bypasses RLS. Anon + authenticated have
--    no grants AND no policies → fully blocked. Both layers (grants and
--    RLS) defend in depth.

comment on table public.team_invite_links is
  'Team join tokens. Access via /api/team-invites/* server routes only — service_role only at DB layer. Tokens are sensitive (grant team access).';
