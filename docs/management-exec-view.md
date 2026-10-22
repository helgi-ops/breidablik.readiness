# Spec — Management / Executive read-only "Club status" view

> A framkvæmdastjóri (GM/board) asked to **see the team's status** without coach
> tooling. Build a **read-only EXEC role** + a club-status dashboard. Privacy-first
> and tier-fair (works on Lite + Pro). This realises the ELITE "organization
> dashboards / executive reporting" promise; there is already a seed at
> `src/app/coach/org-reporting` to build on. **Rules decide / AI explains; never the
> readiness color itself.**

## Who it's for

The person who pays/decides — GM, sporting director, board. They want a 5-second
read of squad health and proof the system is being used. They do NOT want (and
should not see) the S&C drill-down or individual health data.

## Role & access

- New role value **`EXEC`** (management). `profiles.role` today uses
  COACH/ADMIN/STAFF/PLAYER; EXEC must be **strictly read-only everywhere** — no
  writes, no settings, no player edits.
- **Multi-team / whole-club access** via the existing `coach_teams` pattern (or a
  parallel `exec_teams`) so an EXEC for a club sees **all that club's teams**
  (mfl karla + kvenna + yngri flokkar). This is the GM-level value and fits ELITE
  multi-team. Scope strictly to the granted teams.
- **Invite flow:** extend `team_invite_links.target_role` to allow `'EXEC'` (today
  PLAYER|COACH — update the check constraint) and handle it in `/join/[token]` +
  the accept routes, creating an EXEC profile bound to the team/club. Reuse
  `TeamInviteLinks` UI (add a "Stjórnandi" option) so a coach generates an exec
  invite link exactly like a player/coach link.

## Dashboard (read in 5 seconds, plain language, explainability-first)

1. **One-line club verdict** on top (per team, then club roll-up), e.g. *"Squad
   availability strong; load building toward the weekend; 2 players managed."*
2. **Availability today** — counts of cleared / managed / unavailable, from the
   canonical color view `v_coach_readiness_today_v8.final_color` (counts only).
3. **Weekly load trajectory** — Building / Sustainable / Spiking (reuse the existing
   load verdict).
4. **Post-match recovery** — how many rebounded vs still carrying fatigue (reuse
   post-match recovery).
5. **Trend over time** — availability % and load band over recent weeks/months.
6. **Usage / adherence** — check-in completion % (shows the product is being used —
   the buyer cares).
7. **Club roll-up (ELITE)** — the same tiles aggregated across all the club's teams,
   plus a per-team breakdown.

## Privacy boundary (mandatory)

- EXEC sees **aggregates and availability only** — NOT individual medical/wellness
  detail (sleep, soreness, injury specifics, per-player health). Names appear only
  at availability level (e.g. "managed today"), configurable per club; default =
  aggregate/anonymised for any health data.
- **Enforce server-side** — the EXEC endpoints must never return individual health
  rows, not just hide them in the UI. Add `player_access_audit` entries for EXEC
  reads if that table is used elsewhere.

## Tier-fair

All tiles are aggregate counts/verdicts that already degrade gracefully, so the EXEC
view works the same on **Lite (Vector Core)** and **Pro** — confidence still shown
where relevant. No IMA required.

## Endpoint / UI

- `/api/exec/club-overview` (EXEC-auth, read-only): returns the club roll-up +
  per-team tiles by calling the existing aggregates server-side (readiness color
  counts, load verdict, recovery, compliance).
- New route group `src/app/exec/` with its own minimal shell (no coach nav).

## Constraints (CLAUDE.md)

- Explainability-first: one-sentence verdict on top, plain language, no S&C jargon;
  confidence shown; canonical color stays `v_coach_readiness_today_v8.final_color`
  (do not recompute).
- **Read-only is a hard security boundary** — enforce in API auth (reject any
  mutation for EXEC), not just UI.
- No new lint errors (`npx eslint <file>`). Any DB change (role enum / check
  constraint / `exec_teams`) applied via `apply_migration` must also be saved as a
  timestamped `.sql` under `supabase/migrations/`. Stage specific files only.

## Order of work

1. `EXEC` role + read-only enforcement in API auth + the invite `target_role='EXEC'`
   constraint + `/join` handling.
2. `exec_teams` (or reuse `coach_teams`) grant + the "Stjórnandi" option in
   `TeamInviteLinks`.
3. `/api/exec/club-overview` (aggregates only, server-side privacy enforcement).
4. `src/app/exec/` shell + dashboard (tiles + per-team breakdown + trend).

## Verify

- EXEC login views the club overview for granted teams **only**, cannot open any
  coach/player edit surface, and the API **rejects writes** for EXEC.
- **No individual health/wellness data** is returned to EXEC (check the endpoint
  payload, not just the UI).
- Club roll-up sums correctly across the club's teams; tiles render on a Lite team
  with lower confidence where applicable; reads in 5 seconds.

## Commercial note

This is the surface the buyer (GM/board) actually logs into — it gives them
oversight and proof the investment is used, which is exactly who decides renewal.
Both a retention lever and a sales differentiator, and it's already promised under
ELITE ("organization dashboards, executive reporting").
