# Claude Code task — Reporting Center leaks other teams' data (must be team-scoped)

Paste to Claude Code (or `@docs/tasks/reporting-center-team-scope-claude-code-brief.md`).

## Bug (privacy leak — prioritise)
An HK coach sees **Keflavík** (and every other club) in the Reporting Center. Verified: the HK
coaches only have HK in `coach_teams`, so this is NOT a data/assignment issue — it's the page
never filtering by team. `src/components/reporting/ReportingCenterPage.tsx` queries readiness
and roster with **no `team_id` filter**:

```ts
// loadDaily / loadWeekly
supabase.from("v_coach_readiness_today_v8")
  .select("player_id, full_name, total_score, final_color, …")
  .eq("entry_date", targetDate)          // ← no team filter
// roster count
supabase.from("players").select("id",{count:"exact",head:true})
  .eq("status","active")                  // ← no team filter (and wrong value, see below)
```

`v_coach_readiness_today_v8` and `players` have open SELECT RLS (any authenticated user reads
all rows), so the client is responsible for scoping — and doesn't. Result: a coach sees other
clubs' players' wellness/readiness. `v_coach_readiness_today_v8` **has a `team_id` column**
(confirmed), so scoping is straightforward.

Secondary bug in the same query: `players.status = 'active'` returns 0 — the real value is
`'ACTIVE'` (uppercase) / there's also an `is_active` boolean. The roster count is currently
broken. Fix while here.

## Fix
1. **Resolve the coach's active team** in `ReportingCenterPage`. Match the pattern already used
   in `src/app/coach/custom-templates/page.tsx` (load `coach_teams`, pick `is_primary` else
   first; render `TeamSwitcher` for multi-team coaches; keep `selectedTeamId` in state). Or, if
   the page is rendered under a shell that already knows `currentTeamId`, pass it in as a prop
   from `src/app/coach/reporting-center/page.tsx`.
2. **Filter every query by that team**:
   - `…from("v_coach_readiness_today_v8").eq("team_id", selectedTeamId)` in BOTH `loadDaily`
     and `loadWeekly`.
   - roster count: `…from("players").eq("team_id", selectedTeamId).eq("is_active", true)`
     (use `is_active`, or the correct `status` value — verify against a known team; do not use
     `status='active'` lowercase).
   - Any PDF/export path in this component: same team filter.
3. Re-run whenever `selectedTeamId` changes (effect dep).

## Hardening (same pass, recommended)
Grep other coach surfaces for the same unscoped pattern and fix any that read player/readiness
data without a `team_id` filter:
```
grep -rnE "from\(\"(v_coach_readiness_today_v8|players|player_external_load_daily|readiness_entries)\"\)" src/app/coach src/components --include=*.tsx
```
For each hit, confirm there is an `.eq("team_id", …)` scoped to the coach's team.

## Defence in depth (flag to owner — separate task, do NOT apply blind)
The real backstop is RLS: SELECT on `players` / `readiness_entries` / the readiness view should
be team-scoped for `role='coach'` (using the `coaches_team()` helper added in
`20260704130000_team_scope_coach_week_setup_writes.sql`) while staying open for the player app's
own-row reads. This is broad and can break the player surfaces if done carelessly — it belongs
with the team-scoping sweep in `docs/tasks/team-scope-coach-writes-claude-code-brief.md`, and
must be reviewed with the owner. The client-side fix above is the immediate, safe remedy.

## Acceptance criteria
- An HK coach in the Reporting Center sees ONLY HK players/readiness — Keflavík and all other
  clubs are gone, on both the Daily and Weekly tabs and any PDF export.
- Roster count reflects the selected team's active roster (non-zero, correct).
- A multi-team coach can switch teams and the data follows the switch.
- `npx tsc --noEmit` + `npx eslint` clean on touched files; stage specific files (no `git add -A`).
