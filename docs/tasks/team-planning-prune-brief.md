# Prune the "Team Planning" sidebar section

Part of the coach-surface consolidation (`coach-pages-audit-background-vs-destination.md`, step 1).
Unlike Performance Monitoring, Team Planning does NOT fully dissolve — `fixtures`, `week-setup` and
`load-plan` are genuine interactive planners and stay as destinations. This prunes the six non-
destination items around them.

## What's in it (`teamPlanningLinks`, ~line 149 of `CoachSidebar.tsx`)

| Link | Nature | Disposition | Blocked by |
|---|---|---|---|
| `/coach/fixtures` | interactive calendar (workflow entry) | **keep destination** | — |
| `/coach/week-setup` | weekly planner | **keep destination** | — |
| `/coach/load-plan` | pre-session report | **keep destination** | — |
| `/coach/availability-board` | team "who can I pick" state | **move → Monitoring** | — |
| `/coach?tab=md` | Today dashboard tab (MD comparison) | **drop from sidebar** (already on Today) | — |
| `/coach?tab=drills` | Today dashboard tab (session builder) | **drop from sidebar** (already on Today) | — |
| `/coach/game-plan-fit` | per-player matchday readiness | **Background** chip on Today | `coach_signals` |
| `/coach/post-training` | actual-vs-planned report | **Background** chip on Today | `coach_signals` |
| `/coach/match-minutes` | MD+1 minutes entry | **Background/task** chip on Today | `coach_signals` |
| `/coach/progressive-overload` | per-player overload builder | **Drill-down** (Player hub) | Player hub |

Net target: Team Planning = `fixtures`, `week-setup`, `load-plan` (3 destinations). Everything else
relocates.

## Decisions (made — "best for the system")

1. **Availability board → Monitoring.** Its content is a today team-state read (medical gate +
   readiness + load), not a planning tool. It belongs with the readiness/injury surfaces the coach
   scans each morning, not in the plan-the-week workflow. In the current sidebar the natural home is
   the **Injury Monitoring** section (rename-agnostic); in the target IA it's the "Monitoring" group.
2. **Sequence to avoid orphaning.** Only two items move with zero dependency; the rest need a target
   surface that doesn't exist yet. So:
   - **Now (safe, zero orphan):** drop `?tab=md` and `?tab=drills` from `teamPlanningLinks` — they
     remain reachable via Today's own tab bar. Relocate `availability-board` to the Monitoring/Injury
     section.
   - **Wait for `coach_signals`:** `game-plan-fit`, `post-training`, `match-minutes` become Today
     chips. Until then, keep them in a slimmed Planning section (or a small "Matchday" grouping) so
     they aren't orphaned.
   - **Wait for Player hub:** `progressive-overload` becomes a Player-hub drill-down. Until then keep
     it reachable — simplest is from `week-setup` (it's per-player overload planning) or leave the
     sidebar link.

## Changes

### Step 1 — now (in this pass)
- `teamPlanningLinks`: remove `/coach?tab=md` and `/coach?tab=drills`.
- Move `/coach/availability-board` out of `teamPlanningLinks` into the Injury Monitoring links array
  (the Monitoring group), keeping its label. Confirm Today's tab bar still exposes MD comparison +
  session builder (it does — they're `?tab=` views of `DevCoachDashboardClient`).

### Step 2 — with the signals work
- Remove `game-plan-fit`, `post-training`, `match-minutes` from the sidebar; surface as Today chips
  (`coach_signals`): matchday-fit chip, actual-vs-planned chip, "confirm MD+1 minutes" task chip.

### Step 3 — with the Player hub
- Remove `progressive-overload` from the sidebar; add as a Player-hub tab / player-card action.

After all steps Team Planning holds `fixtures`, `week-setup`, `load-plan`.

## Old routes
Nothing deleted — every page keeps its route. Only the sidebar surface changes. `?tab=` links keep
working as query params on `/coach`.

## Guardrails
- Descriptive/planning surfaces only — none touch the readiness colour (game-plan-fit is advisory,
  never the colour).
- English default, IS on toggle (`const [lang] = useLang(); const isEN = lang !== "IS";` — never
  object-destructure `useLang()`).
- Preserve tier/sport gating via `filterForTier`.
- No new lint errors; the pre-existing `set-state-in-effect` at ~line 306 of the sidebar is not yours.

## Verification
- `npx eslint src/app/coach/CoachSidebar.tsx` (no NEW errors).
- Dev server: Team Planning shows fixtures / week-setup / load-plan (+ the deferred items until their
  target surfaces exist); availability-board appears under Monitoring/Injury; MD comparison + session
  builder still reachable from Today's tab bar; English by default.

Ref: `coach-pages-audit-background-vs-destination.md`, `CoachSidebar.tsx`
(`teamPlanningLinks` ~line 149, Injury Monitoring links, section render).
