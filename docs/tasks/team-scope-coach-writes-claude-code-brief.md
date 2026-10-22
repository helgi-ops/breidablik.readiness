# Claude Code task — team-scope ALL coach writes (a coach can only write their own teams)

Paste to Claude Code (or `@docs/tasks/team-scope-coach-writes-claude-code-brief.md`).

## Why
`is_staff()` is a **global** flag: being staff let a coach write ANY team's data via RLS.
Requirement (product owner): a coach may only create/edit data for **teams they manage**
(`coach_teams`). Elevated/global staff (`staff_users.role='staff'` — admins/org staff) keep
full cross-team access.

Already done (this migration, verified in prod):
- `supabase/migrations/20260704120000_backfill_staff_users_from_coach_teams.sql` — every coach
  is now in `staff_users` (fixes the RLS insert error).
- `supabase/migrations/20260704130000_team_scope_coach_week_setup_writes.sql` — **coach_week_setup**
  writes are now team-scoped. It also added two reusable helpers:
  - `is_elevated_staff()` → `staff_users.role='staff'`
  - `coaches_team(p_team uuid)` → the user has a `coach_teams` row for `p_team`
Verified: HK coaches can write HK, not Breiðablik; staff can write both.

**This task extends the same scoping to the rest of the coach write surface.** Do it
table-by-table with verification — a wrong team path locks coaches out, so do NOT blanket-apply.

## The pattern
For every write policy currently gated on `is_staff()`, change INSERT `with check`, UPDATE
`using`+`with check`, DELETE `using` to:

```sql
is_staff() and ( is_elevated_staff() or <this row belongs to a team the coach manages> )
```

- **Team-scoped tables** (row has `team_id`): use `coaches_team(team_id)`.
- **Player-scoped tables** (row has `player_id`, not `team_id`): add and use a helper
  ```sql
  create or replace function public.coaches_player(p_player uuid)
  returns boolean language sql stable security definer as $$
    select exists (
      select 1 from public.players pl
      join public.coach_teams ct on ct.team_id = pl.team_id
      where pl.id = p_player and ct.coach_id = auth.uid()
    )
  $$;
  ```
  then `coaches_player(player_id)`. (Confirm each table's FK column name first.)
- Leave **SELECT** policies as-is unless the owner asks to tighten reads (players must still
  read their team's week/plan; over-tightening SELECT breaks the player app).

## Tables to scope (all currently `is_staff()`-gated writes — verify column before each)
Team-scoped (`team_id`): `week_setups`, `week_day_overrides`, `day_overrides`, `week_plans`,
`match_schedule`, `team_matches`, `team_settings`, `team_load_targets`, `coach_plan_rules`,
`training_session_context`, `microdose_decisions`, `microdose_overrides`, `stage4_overrides`,
`stage4_manual_overrides`, `decision_exceptions`.
Player-scoped (`player_id`): `player_plans`, `player_plan_items`, `player_daily_workout`,
`player_daily_load`, `player_load_metrics`, `player_microdose_plan_locks`,
`player_push_subscriptions`, `player_push_tokens`, `session_rpe_entries`, `player_session_rpe`,
`daily_player_sessions`, `readiness_entries`, `players`.
**Keep elevated-only (do NOT team-scope — org/admin tables):** `staff_users`, `coach_teams`,
`team_coaches`, `coach_invitations`, `team_invites`, `statsport_athlete_map`,
`checkin_notification_log`, `email_reminder_log`, `rpe_notification_log`.
(For each table: `select policyname, cmd, qual, with_check from pg_policies where tablename=…;`
and check the real FK column — some "player_*" tables may key on a different id.)

## Watch-outs
- Tables written by **service-role API routes** bypass RLS entirely — RLS scoping only bites
  direct client writes (like coach_week_setup). Still worth scoping for defence in depth, but
  prioritise tables the client writes directly (grep `.from("<table>").insert|update|upsert`
  under `src/app/**` client components).
- Some rows have `team_id`/`player_id` NULL (legacy). `coaches_team(NULL)` returns false →
  a coach can't touch legacy null-team rows (fine; elevated staff can). Don't crash on null.
- `players` table: writes here (roster edits) should be scoped to `coaches_team(team_id)` on the
  player's own row, not `coaches_player` (avoid self-reference). Handle explicitly.

## Acceptance criteria
- For each scoped table, a `role='coach'` user can INSERT/UPDATE/DELETE only rows whose
  team resolves (directly or via player) to one of their `coach_teams`; a foreign team's row is
  rejected. Prove with an emulation query per table (like the coach_week_setup verification:
  own-team = true, foreign-team = false; elevated staff = true for both).
- `role='staff'` users retain full cross-team write everywhere.
- No coach loses access to their OWN team on any table (regression check: run the emulation for
  a few real coaches across all scoped tables).
- One timestamped migration per logical batch under `supabase/migrations/`, also applied via
  `mcp__supabase__apply_migration`. `npx tsc`/`eslint` unaffected (RLS-only). Stage specific
  files; no `git add -A`.
```
