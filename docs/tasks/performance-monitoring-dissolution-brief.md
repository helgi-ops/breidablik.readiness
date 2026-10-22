# Dissolve the "Performance Monitoring" sidebar section

Part of the coach-surface consolidation (`coach-pages-audit-background-vs-destination.md`, step 1).
This section (`Section` label "Performance Monitoring" / "Frammistöðueftirlit", rendered ~line 730
of `CoachSidebar.tsx` from `performanceAnalyticsForTier`) is the cleanest to remove: **half its
items aren't even pages** — they're deep-links into the Today dashboard's own tab bar.

## What's in it (grounded — `performanceAnalyticsLinks`, ~line 132)

| Link | Nature | Disposition |
|---|---|---|
| `/coach?tab=trend` — Readiness Trends | Today dashboard tab | already on Today → drop from sidebar |
| `/coach?tab=volatility` — Readiness Swings | Today dashboard tab | already on Today → drop from sidebar |
| `/coach?tab=vald` — Neuromuscular Fatigue (CMJ) | Today dashboard tab | already on Today → drop from sidebar |
| `/coach?tab=strength` — Strength Monitoring | Today dashboard tab | already on Today → drop from sidebar |
| `/coach/post-match-recovery` | page | **Background** — MD+ recovery chip on Today |
| `/coach/rtp` | page (interactive assessment) | **Drill-down** — from player card / Player hub |
| `/coach/assessment-profile` | page | **Drill-down** — from Player hub |
| `/coach/conditioning` | page | **Drill-down** — from Player hub |

The four `?tab=` entries are `DevCoachDashboardClient` views of `/coach` — Today already renders a
tab bar for them. Their sidebar links are just jumps to a page the coach is (or should be) on.

## The ordering dependency (important)
`rtp`, `assessment-profile`, `conditioning` are meant to become drill-downs of the **Player hub**,
which does not exist yet (it's part of the Intelligence-pages consolidation). So do not orphan them.
Two safe paths:

- **Path A (recommended, no dependency):** interim **Assessments hub** at `/coach/assessments` — a
  small selector page (same pattern as `/coach/rehab-protocols`) with three cards: Force-plate
  assessment (`rtp`), Assessment profile (`assessment-profile`), Conditioning (`conditioning`). One
  sidebar entry ("Assessments" / "Mælingar") replaces the whole section. When the Player hub lands,
  fold these three in as hub tabs and retire the interim hub (or keep it as the team-level entry).
- **Path B:** keep `rtp`, `assessment-profile`, `conditioning` as individual sidebar links under a
  slimmed section until the Player hub exists, and only remove the four `?tab=` links + move
  post-match-recovery now. Less tidy, zero new page.

Path A gives the full section-removal win now without waiting on the Player hub.

## Changes (Path A)

1. **New page `/coach/assessments`** — selector hub, three cards → `rtp`, `assessment-profile`,
   `conditioning`. Copy the `/coach/rehab-protocols` page as the template. **Language gotcha:** use
   `const [lang] = useLang();` and `const isEN = lang !== "IS";` (English default; never object-
   destructure `useLang()`). No team gate needed (these aren't club-restricted) — but respect the
   same tier gating the section used (see `filterForTier`; `rtp`/GPS gating if any).
2. **Sidebar (`CoachSidebar.tsx`):**
   - Remove the four `?tab=` links and `post-match-recovery` from `performanceAnalyticsLinks`.
   - Replace the remaining three with one `{ href: "/coach/assessments", label: { EN: "Assessments",
     IS: "Mælingar" } }`. The section can keep its "Performance Monitoring" label or be renamed
     "Assessments"; if only one link remains, consider merging it into an adjacent section so a
     one-item section doesn't linger.
   - Leave the `?tab=` views reachable via Today's own tab bar (unchanged) — just not duplicated in
     the sidebar. Confirm Today's tab bar exposes trend / volatility / vald / strength (it does).
3. **post-match-recovery** → its home is a background chip on Today (part of the `coach_signals`
   work). Until that lands, it can be reached from the Assessments hub or the injuries/recovery
   surface — do NOT leave it only in a deleted section. Simplest interim: add a 4th card
   "Post-match recovery" to the Assessments hub, move it to a Today chip in the signals step.

## Old routes
All four pages (`post-match-recovery`, `rtp`, `assessment-profile`, `conditioning`) keep their
`page.tsx` routes — nothing is deleted, only the sidebar surface changes. `?tab=` deep links keep
working (they're query params on `/coach`).

## Guardrails
- Descriptive/assessment surfaces only — none touch the readiness colour.
- Preserve tier/sport gating: `conditioning` is explicitly NOT GPS-gated (fitness tests serve every
  team incl. basketball); `rtp`/CMJ views may be VALD-gated. Reuse `filterForTier` semantics so the
  hub/link respects the same visibility the individual links had.
- English default, IS on toggle (the `useLang` tuple rule above).
- No new lint errors (`npx eslint` the touched files; pre-existing `set-state-in-effect` at ~line
  306 of the sidebar is not yours — don't add to it).

## Verification
- `npx eslint` the new page + sidebar (clean).
- Dev server: sidebar no longer shows the 8-item Performance Monitoring section; `/coach/assessments`
  lists the assessment pages; each card opens the correct existing page; English by default.
- Today's tab bar still reaches trend / volatility / vald / strength.
- The four pages still render standalone at their routes.

## Rollout (steps)
1. Build `/coach/assessments` selector (copy rehab hub) + collapse the section to one link.
2. (signals step) Move `post-match-recovery` to a Today background chip; drop its hub card.
3. (Player-hub step) Fold `rtp` / `assessment-profile` / `conditioning` into Player-hub tabs; decide
   whether to keep `/coach/assessments` as the team-level entry or retire it.

Ref: `coach-pages-audit-background-vs-destination.md`, `/coach/rehab-protocols` (the pattern),
`CoachSidebar.tsx` (`performanceAnalyticsLinks` ~line 132, section render ~line 730).
