# IA plan + Code brief — Library as a Today tab, and Squad → "Squad Intelligence" in the hub

Two moves the owner asked for, grounded in the current nav. Both finish a direction that's already
half-built (Today is tabbed; hubs exist), and both follow the manifesto: **Today = head-coach decision
surface; the hubs = the S&C drill-down.** Guiding rule throughout: **one canonical home per view; everything
else is a deep-link — never a second full copy.**

## Current state (verified — corrected against the running app)
- **Today** (`src/app/coach/dev-coach-dashboard/DevCoachDashboardClient.tsx`): the **visible** tab bar is
  **Today · Squad · Load & RPE · GPS Data** — only four. The `MORE_TABS` group in the code (Session =
  `key:"drills"`, Readiness Swings, CMJ, Strength, Trends, RTP) is **not surfaced** in the current tab bar,
  so there is **no visible Session tab** and no library tab on Today today.
- **Coaching Library** (`src/app/coach/library/page.tsx`) is a full, self-contained page: top tabs
  **Drills · Videos · Meetings**, and inside **Drills** a sub-tab row **Build session · Sessions · My Library
  · General Library · Archived · Analytics**. (So the session builder — "Build session" — lives *inside* the
  library, which is why no separate Session tab is needed.) Linked in the sidebar (`teamPlanningLinks`).
- **Load Intelligence hub** (`src/app/coach/load-intelligence-hub/page.tsx`): 8 tabs (Load, PowerCurve, HSR,
  Quadrant, Indoor, Decel, HeartRate, IMA), **heavily GPS/tier-gated** (LITE_HIDDEN / FULL_HIDDEN /
  NO_GPS_HIDDEN).

## Move 1 — the WHOLE Coaching Library as a Today tab
Owner decision (from the running app): the Today **"Library"** tab must contain **everything** the Coaching
Library page has — **Drills** (incl. its sub-tabs Build session · Sessions · My Library · General Library ·
Archived · Analytics), **Videos**, and **Meetings** — not a trimmed browse view. The session builder comes
along for free because "Build session" is already inside the library's Drills tab.

- **Reuse the whole library, don't rebuild it.** Extract the Coaching Library page body into a single shared
  component (e.g. `<CoachingLibrary />`) that renders the full Drills/Videos/Meetings experience, and mount
  **the same component** both at the standalone route `/coach/library` AND inside Today's new **Library**
  tab. One source of truth — a drill/video/session added in one appears in the other, because it IS the
  same component.
- **Nested tab URLs:** Today is URL-driven (`/coach?tab=...`) and so is the library (`?tab=drills` +
  sub-tab). Namespace the inner params so they don't clobber Today's (e.g. Today `?tab=library` with the
  library's own state under a distinct key like `libtab=` / `libsub=`), so deep-links and the back button
  still work on both levels.
- **Placement:** add `library` to Today's tab bar next to Squad/Load (primary row), so it reads e.g.
  **Today · Library · Load & RPE · GPS Data** (Squad becomes a deep-link per Move 2). The Library tab sits
  below the Today verdict like the others — Today stays decision-first; the library never renders above the
  command center.
- **Sidebar / standalone route:** Today is now the primary home for the library. Keep the `/coach/library`
  route working (for direct links and the admin drill-upload flow); the sidebar "Coaching Library" entry is
  optional — keep it as a second entry depth, or drop it to declutter (owner's call). No second *copy* either
  way — both entries render the same `<CoachingLibrary />`.

## Move 2 — Squad → "Squad Intelligence" in the Load Intelligence hub
The detailed per-player readiness grid is the S&C drill-down, so it belongs in the hub, not as a heavy Today
tab.

- Add a **"Squad Intelligence"** tab to `load-intelligence-hub` as the **first tab** (it's the most-used and
  readiness-based). Move the content currently rendered by Today's `squad` tab there (the per-player grid +
  OverrideHistoryCard + the trust-review pair).
- **CRITICAL — do NOT GPS-gate it.** The hub's tier-gating (LITE_HIDDEN / FULL_HIDDEN / NO_GPS_HIDDEN) is for
  GPS/load tabs. Squad Intelligence is **readiness/wellness** (no GPS), so it must render for **every** team,
  including no-GPS / Lite. Add it to the hub's tab list **outside** the gated href-sets, or explicitly
  exempt its key. (If this isn't handled, no-GPS teams lose the squad view entirely — a regression.)
- On **Today**, keep the **squad verdict** (the `SquadVerdictBanner` / command-center counts) and turn the
  old `squad` tab into a **deep-link**: "See full squad →" routes to
  `/coach/load-intelligence-hub?tab=squad`. Remove the heavy `squad` tab body from Today's tab bar (keep the
  verdict banner on the `today` tab). Quick access survives; the detail lives in one place.
- **Naming:** keep the hub entry "Load Intelligence" / "Álagsgreining" in the sidebar, but its first tab
  reads **"Squad Intelligence" / "Liðsgreining"**. (Optional: rename the hub header to "Squad & Load
  Intelligence" so the squad content is discoverable from the name — owner's call; default keeps the sidebar
  label unchanged to avoid churn.)

## Files to touch
- `library/page.tsx`: extract its body into a shared `<CoachingLibrary />` component (keeps Drills +
  sub-tabs, Videos, Meetings); the route becomes a thin wrapper that renders it.
- `DevCoachDashboardClient.tsx`: add `library` to the `CoachTab` union + `VALID_TABS` + the visible tab bar;
  render `<CoachingLibrary />` in that tab with namespaced inner tab params; remove `squad` from the tab bar
  and replace its body with the squad-verdict + "see full squad →" deep-link; keep the verdict on the
  `today` tab.
- `load-intelligence-hub/page.tsx`: add the `squad` tab (first), render the moved squad component, **exempt
  it from the tier-gating sets**.
- `CoachSidebar.tsx`: no new top-level entries required; point any old `/coach?tab=squad` deep-links at the
  hub; keep (or drop) the Coaching Library entry — either way it renders the same `<CoachingLibrary />`.

## Guardrails / tests
- **No duplication:** the Today Library tab and `/coach/library` render the **same** components (one source).
  A drill/video added in one shows in the other.
- **Decision-first:** Today's verdict/command-center stays first; Library and the squad-verdict link are
  secondary, never above it.
- **No-GPS safety:** Squad Intelligence renders for a no-GPS / Lite team (add a test team with no GPS →
  tab visible + populated). Load/GPS tabs still gate as before.
- **Deep-links intact:** `/coach/load-intelligence-hub?tab=squad` and the Today "see full squad" link resolve;
  back-button works (URL-driven tabs, as Today already does).
- **Boundary:** pure IA/navigation — no change to readiness colour, decision engine, or data. (Note: the
  separate stage4 regression — `docs/tasks/stage4-decisions-stopped-sept14-constraint-fix-brief.md` — is what
  makes the squad **counts** show 0 right now; fixing that is independent of this IA move but should land so
  Squad Intelligence shows real numbers.)
- `npx eslint` on changed files; typecheck.

## Why this is the right shape
Both moves push toward the audit's conclusion (#124 / `coach-pages-audit-background-vs-destination.md`):
decide one home per view and make the rest deep-links. Today becomes *decide + quick-reach* (verdict,
session, library, MD); the hubs become the *analyse/deep* surfaces (Squad + Load Intelligence). That's the
"one screen, depth on click" head-coach experience the manifesto calls for — and it sets up P4
(coach-signals coverage) to surface everything else as exception-gated chips on Today later.
