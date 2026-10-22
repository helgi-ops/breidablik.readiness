# Claude Code task — coaches must always land in `staff_users` (fix week-setup RLS bug at the root)

Paste to Claude Code (or `@docs/tasks/staff-users-provisioning-claude-code-brief.md`).

## The bug (verified in prod)
Saving a week in `src/app/coach/week-setup/page.tsx` is a **direct client insert** into
`coach_week_setup`, so RLS applies with the coach's JWT. The insert policy requires
`is_staff()`:

```sql
is_staff() := EXISTS (SELECT 1 FROM public.staff_users WHERE user_id = auth.uid())
```

`is_staff()` gates ~40 coach-surface tables (coach_week_setup, week_setups, match_schedule,
player_plans, day_overrides, team_settings, …). **Coach provisioning adds coaches to
`coach_teams` + `profiles.role` but NEVER to `staff_users`** — there is no `staff_users`
insert anywhere in the codebase. Result: 33 of 35 coaches were missing from `staff_users`
and hit `new row violates row-level security policy for table "coach_week_setup"` on every
week save (and could not write most coach-surface tables).

A one-time data backfill has already been applied (all coaches synced into `staff_users`;
see `supabase/migrations/20260704120000_backfill_staff_users_from_coach_teams.sql`). **This
task makes sure it never drifts again** — new coaches must always end up in `staff_users`.

## Fix — do BOTH (defence in depth)

### 1. Application path (explicit + observable)
In the coach-invite accept flow `src/app/api/coach-invites/[token]/accept/route.ts`, after the
coach is linked to the team (the `coach_teams` write), **also upsert the coach into
`staff_users`**. The route uses the service-role client, so no RLS concern:

```ts
await supabaseAdmin
  .from("staff_users")
  .upsert({ user_id: coachUserId, role: "coach" }, { onConflict: "user_id" });
```

Do the same in any other place a coach becomes a coach (e.g. `team-invites` accept when the
target role is coach/staff, and any admin "add coach" tool under `src/app/admin/`). Grep for
`coach_teams` inserts and pair each with a `staff_users` upsert.

### 2. Database safety net (guarantees it regardless of code path) — RECOMMENDED
Add an `AFTER INSERT` trigger on `coach_teams` that upserts the coach into `staff_users`, so a
coach added by ANY means (app flow, admin SQL, future feature) is always staff:

```sql
create or replace function public.sync_staff_user_from_coach_team()
returns trigger language plpgsql security definer as $$
begin
  insert into public.staff_users (user_id, role)
  values (new.coach_id, 'coach')
  on conflict (user_id) do nothing;
  return new;
end $$;

drop trigger if exists trg_coach_team_staff_sync on public.coach_teams;
create trigger trg_coach_team_staff_sync
  after insert on public.coach_teams
  for each row execute function public.sync_staff_user_from_coach_team();
```

Save this as a timestamped migration under `supabase/migrations/` (repo convention) AND apply
it via `mcp__supabase__apply_migration`.

### 3. (Optional, discuss first) harden `is_staff()`
`staff_users` being a *separate* allowlist from `coach_teams` is what let the two drift. An
alternative is to make `is_staff()` also return true for anyone in `coach_teams`:

```sql
-- is_staff() := EXISTS(staff_users …) OR EXISTS(SELECT 1 FROM coach_teams WHERE coach_id = auth.uid())
```

This removes the single point of failure entirely, but broadens the gate — do NOT ship without
confirming with the product owner, since `is_staff()` is global (not team-scoped) and unlocks
~40 tables. Prefer #1 + #2 unless the owner wants #3.

## Note on scope of `is_staff()` (worth flagging to the owner, not part of this task)
`is_staff()` is a **global** flag, not team-scoped — any staff user can write any team's
`coach_week_setup`/plans via RLS. The UI only ever shows a coach their own teams, so this is
latent, not exploited, but a future hardening could scope write policies to `coach_teams`
membership per row. Out of scope here; note it in the backlog.

## Acceptance criteria
- Accepting a coach invite results in a `staff_users` row for that coach (verify by inserting a
  test coach_teams row → `staff_users` row appears via the trigger).
- `select count(*) from coach_teams ct left join staff_users su on su.user_id=ct.coach_id where
  su.user_id is null;` returns **0** and stays 0 after adding a new coach.
- A coach who just accepted an invite can save a week in `/coach/week-setup` with no RLS error.
- Migration `.sql` saved under `supabase/migrations/`; `npx tsc --noEmit` + `npx eslint` clean on
  touched files; stage specific files only (no `git add -A`).
