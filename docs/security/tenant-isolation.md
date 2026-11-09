# Team isolation audit

**The promise:** a coach or player sees and changes only their own team's data, unless a rule below allows it on purpose.

Most API routes use the service role, which skips row-level security (RLS). The route is therefore the only guard on the server, and RLS is the guard for what the browser asks Postgres directly. Both need checking.

## How it runs

| Where | What | When |
|---|---|---|
| CI (`npm run audit:tenant -- --no-db`) | Source checks. A new high finding fails the build. | Every push |
| `/api/admin/security-audit/cron` | Database checks. Saves a row in `security_audit_runs` and emails `HEALTH_ALERT_EMAIL` on a new high finding. | Nightly |
| `npm run audit:tenant` | Both, using `.env.local`. | By hand, and from the `tenant-audit` agent |
| `liveProbe.test.ts` | Signs in as a test coach of team A and tries to reach team B. Needs `scripts/create-tenant-probe-user.ts` run once. | By hand |

## Rules

| Check | Looks for | Level |
|---|---|---|
| A_NO_AUTH | Route with no login or secret check | High |
| B_UNSCOPED_TENANT_ID | Team id (high) or player id (medium) from the caller with no access check | High / medium |
| C_OPTIONAL_TEAM_FILTER | `if (teamId)` that skips the filter when the id is empty | Medium |
| D_UNFILTERED_TEAM_TABLE | Query on a team table with no team or player filter | High in routes, medium in libraries, low in cron and admin code |
| E_CLIENT_UNSCOPED_QUERY | Same, from the browser. RLS is the backstop. | Medium |
| E2_CLIENT_PROFILES_WRITE | Browser writes anything but names to `profiles` | High |
| F_MODULE_LET | Module-level mutable state that can carry between requests | Medium |
| G_FETCH_WITHOUT_BEARER | Browser API call with no login token | Low |
| DB_RLS_OFF | Team table with RLS off that users can read | High |
| DB_USING_TRUE | Policy open to every user, including `true OR ...` | High for writes, medium for reads |
| DB_IS_STAFF_POLICY | Policy using `is_staff()`, which also matches coaches and some player logins. No policy may use it. | High |
| DB_PROFILES_GRANTS | Users can change `team_id`, `role`, `is_admin`, `player_id` or `user_id` on their profile | High |
| DB_ANON_VIEW / DB_VIEW_OWNER_RIGHTS | View readable without a login, or running with its owner's rights | High |
| DB_DEFINER_RPC | Definer function callable without a login (high), or by any user with no caller check (medium) | High / medium |
| DB_SIGNUP_TRUST | Signup again trusts a role or team from the signup form | High |
| DB_INVITE_WRITE | Users can write coach invitations directly | High |
| DB_NEW_ELEVATED_ACCOUNT | A new admin or staff account. Each known one is in the baseline. | High |
| DB_ORPHANS | Rows whose team differs from the player's, with no recorded move | Medium |
| DB_FOREIGN_PLAN_CONTENT | A player's daily plan lock (`player_microdose_plan_locks`) holds another team's `microdose_templates` session (`tenant_audit_foreign_plan_content()`) | High |
| DB_COACH_TEAMS_GAP | Coach profile pointing at a team with no `coach_teams` row | Medium |

## Allowed across teams on purpose

- Admin accounts, and coaches of several teams through `coach_teams`.
- `is_elevated_staff()`, which is real staff only. `is_staff()` is not this, because every `staff_users` row matches it. That includes coaches and 22 player logins, so it must not appear in a policy.
- A team keeps rows it recorded (`team_id` is its own) for a player who has since left. A new club sees none of them without a grant or membership.
- `player_data_grants` and `player_team_memberships`, including national-team upload.
- `is_previous_club` rows, and demo teams seeded from Breiðablik.
- Shared drills: `share_drill_with_team`, the public drill library and a coach's personal library.
- `opponent_scout_shares`, secret-protected cron jobs, and aggregates that return no other team's rows.

## When the audit flags something

1. **Fix it if it is real.** This is almost always the answer.
2. **If it is safe, add it to `security/tenant-audit.allowlist.json`** with `check`, `file`, a `match` where the file has several queries, and a true `reason` that says why it is safe. Reasons get reviewed like code.
3. **Never loosen a rule to silence one finding.** Add a test if a rule is truly wrong.

The baseline (`security/tenant-audit.baseline.json`) freezes high findings that are known and still open, so they don't block unrelated work. Update it only in a reviewed commit, with `npm run audit:tenant:baseline`, and read the diff. An entry removed from the baseline is a fix. An entry added is a decision to live with a hole for now.

Custom programme tables are created at runtime by `create_custom_microdose_table`, which locks each one through `secure_custom_programme_table`: row-level security on, read for the owning team, writes through the server only. Create them only through that function.

After adding a table with `team_id` or `player_id`, run `npx tsx scripts/audit-tenant-isolation.ts --update-tables` so the source checks cover it.

## Testing a database rule safely

Pretend to be a user inside a transaction that always rolls back, so nothing is saved, including test users:

```sql
do $$
declare res int;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', '<user id>', 'role', 'authenticated')::text, true);
  select count(*) into res from public.readiness_entries where team_id = '<other team>';
  reset role;
  raise exception 'RESULT %', res;
end $$;
```

Report counts only, never names. Fetch ids before `set local role`, because under RLS a lookup can return nothing and make a refused write look allowed.
