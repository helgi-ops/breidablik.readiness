# Consolidate the "Load Monitoring" Intelligence section (8 pages)

Part of the coach-surface consolidation (`coach-pages-audit-background-vs-destination.md`, step 1).
This is the biggest and most important cluster — eight "*Intelligence" pages, all descriptive,
personal-norm, and (by design) never touching the readiness colour. It is also the strongest case
FOR the background-signals approach: five of the eight ultimately become Today chips.

## What's in it (`loadMonitoringLinks`, ~line 69 of `CoachSidebar.tsx`)

| Link | What it reads | Scope | Target disposition | Blocked by |
|---|---|---|---|---|
| `/coach/load-intelligence` | internal:external load coupling | player + team | **Background** chip + drill-down | `coach_signals` |
| `/coach/decel-intelligence` | McBurnie 2022 decel risk | player | **Background** (injury-risk chip) | `coach_signals` |
| `/coach/hsr-intelligence` | HSR/sprint ACWR (Lite-tier twin of decel) | player | **Background** (same chip, tier-swapped) | `coach_signals` |
| `/coach/heart-rate-intelligence` | belt HR vs sRPE cross-check | player | **Background** (HR-mismatch flag) | `coach_signals` |
| `/coach/indoor-load` | FMP indoor-hall load | player | **Background** (indoor flag, no-GPS clubs) | `coach_signals` |
| `/coach/quadrant` | Gabbett external-vs-internal 2×2 | team | **Drill-down** (from Load plan) | — |
| `/coach/power-curve-intelligence` | ADI peak-period / power curve | player | **Player-hub tab** (peak-capacity chip) | Player hub |
| `/coach/ima-intelligence` | IMA stride day-profile | player/session | **Player-hub tab** ("session delivered" chip) | Player hub |

Tier notes (must be preserved): `power-curve`, `quadrant`, `indoor-load` are GPS/Catapult-gated;
`hsr` and `decel` are mutually exclusive by tier (Lite shows HSR, Full shows Decel — already
effectively one page swapped via `filterForTier`); `heart-rate` is belt-based (both tiers).

## The reality: this section can't fully distribute yet
Unlike Team Planning, none of these are `?tab=` duplicates — all eight are standalone pages, and
their target homes (Today chips, Player hub) **don't exist yet**. So a "delete the section" move now
would orphan pages. The honest sequencing:

- The real win is the **`coach_signals` background infrastructure** — that's what turns
  load/decel/hsr/heart-rate/indoor into Today chips. Load Monitoring is the flagship consumer of it.
- Until then, the safe, dependency-free win is to **group the 8 into one "Load Intelligence" hub**
  (launcher → tabs), collapsing 8 sidebar entries to 1. This is NOT throwaway: even in the target,
  the Today chips need a drill-down destination, and this hub is exactly that destination.

## Recommendation (best for the system): interim Load Intelligence hub now

`/coach/load-intelligence-hub` (or reuse `/coach/load-intelligence` as the hub shell) — a single
sidebar entry with a tab/selector for each tier-appropriate Intelligence page. Phase it like the
programme-library brief:

- **Phase 1 — launcher (ship first):** selector page with cards for each tier-visible Intelligence
  page, linking to the existing routes. Copy `/coach/rehab-protocols` as the template. Collapses the
  sidebar 8→1 immediately, zero risk to the bespoke bodies. Respect `filterForTier` so only the
  tier-appropriate cards show (no GPS cards for no-GPS clubs; HSR-vs-Decel by tier).
- **Phase 2 — real tabs:** the lighter pages become inline tabs; `quadrant` stays a drill-down
  reached from Load plan / the hub.
- **Phase 3 — chips graduate:** as `coach_signals` lands, `load`/`decel`/`hsr`/`heart-rate`/`indoor`
  surface as Today chips whose click opens this hub's matching tab; `power-curve` + `ima` move to
  Player-hub tabs. The hub shrinks to the remaining drill-downs (or is retired if empty).

If you'd rather not build interim structure, the alternative is to **leave Load Monitoring as-is
until `coach_signals` exists**, then distribute directly to chips — fewer moving parts, but the
8-item section lingers meanwhile. The hub is the better stepping stone because it delivers the
sidebar win now and is on the target path.

## Sidebar changes (Phase 1)
- Replace the 8 `loadMonitoringLinks` with one hub link `{ href: "/coach/load-intelligence-hub",
  label: { EN: "Load Intelligence", IS: "Álagsgreining" } }`. Keep the section label "Load
  Monitoring" / "Álagseftirlit" or rename to "Load Intelligence".
- The hub applies `filterForTier` internally so the SAME tier/sport visibility the individual links
  had is preserved per card/tab.

## Old routes
All eight `page.tsx` routes stay — only the sidebar surface changes. Chips (later) deep-link to
`/coach/load-intelligence-hub?tab=…` or to the individual routes.

## Gotchas
- **Language default:** `const [lang] = useLang(); const isEN = lang !== "IS";` — never object-
  destructure `useLang()` (that bug shipped Icelandic-by-default on the rehab hub).
- **Tier gating is load-bearing here** — more than any other section. Reuse `filterForTier`; do not
  show GPS-only tabs to no-GPS clubs, and keep HSR/Decel mutually exclusive by tier.
- Match existing Tailwind conventions (slate/violet); several pages use shadcn/ui.

## Guardrails
- Descriptive load context only — none touch the readiness colour (the whole section is built on that
  promise). The eventual chips sit BESIDE the colour, never become it.
- Exception-gating (later, for the chips) must be conservative — this is where over-flagging would
  hurt most (the yellow-oversensitivity lesson). A chip appears only when genuinely actionable.
- No new lint errors; pre-existing `set-state-in-effect` in the sidebar is not yours.

## Verification
- `npx eslint` the hub + sidebar (clean).
- Dev server: Load Monitoring shows one "Load Intelligence" entry; the hub lists only tier-appropriate
  Intelligence pages; each card/tab opens the correct existing page; GPS/tier gating matches the old
  per-link visibility; English by default.
- All eight routes still render standalone.

## Rollout
1. Phase 1 hub launcher + sidebar collapse (8→1) — ship.
2. Phase 2 inline the lighter tabs; `quadrant` → drill-down from Load plan.
3. Phase 3 (with `coach_signals` + Player hub) graduate chips + move power-curve/ima to Player hub.

Ref: `coach-pages-audit-background-vs-destination.md`, `/coach/rehab-protocols` (launcher pattern),
`programme-library-consolidation-brief.md` (tabbed-hub pattern), `CoachSidebar.tsx`
(`loadMonitoringLinks` ~line 69, `filterForTier`).
