# Brief — consolidate Progressive Overload into the Periodization Hub (harvest the engine, retire the page)

**Decision:** the standalone **Progressive Overload** page (`/coach/progressive-overload`) is not redundant
in *logic* but is redundant as a *destination* — it does what the Meso Cycle ramp should do, only as a
separate tool. Keep the engine, fold it into the hub, retire the top-level page. This continues the coach-
pages consolidation (fewer pages, one story) and delivers the "progressive overload taken in" the coach
asked for. Descriptive planning — never the readiness colour. Rules recommend; the coach decides.

Files: `src/lib/micropulse/progressiveOverload/index.ts` (the engine — keep), `src/lib/micropulse/
periodization/index.ts` (the Meso block builder — call the engine), `src/app/coach/periodization-hub/
page.tsx` (Meso + Players tabs), `src/app/coach/progressive-overload/page.tsx` (retire),
`src/app/coach/CoachSidebar.tsx` (remove nav entry ~line 159), `src/components/coach/
ProgressiveOverloadCard.tsx` (reuse in the hub).

## Why fold, not delete

`buildProgressiveOverload` is genuinely better than the Meso block's current **flat** multiplier
(`base + step·i`, capped ×1.4). It already:

- ramps KPIs at **different rates** (`WEEKLY_RATE` — volume faster than HSR/sprint, protecting the posterior
  chain, Malone/Gabbett),
- **ceilings each KPI at its own match reference** ("build TO match, not beyond"),
- tags every weekly target with **which rule bound it** (`CapReason` = `rate` | `acwr` | `ceiling`) — self-
  explaining, exactly the manifesto's provenance requirement,
- produces a **per-player build summary** (`PlayerRamp`, status `build` / `progress` / `hold`).

Throwing that away and keeping the flat multiplier would be the wrong trade. Harvest it.

## Part 1 — drive the Meso ramp with the engine (replace the flat multiplier)

In the Meso block builder (`buildCalendarBlock`), replace the flat `base + step·i` week multiplier with a
ramp derived from `buildProgressiveOverload`:

- Per KPI (dist / HSR / load / the IMA variables from the IMA brief), take the engine's **weekly ramp** as
  the week's fraction-of-match, instead of one scalar multiplier applied to every KPI equally. This makes
  the block's weekly overload **differentiated** (volume climbs faster than HSR) and **ceilinged at match
  demand** automatically — the two things the flat multiplier gets wrong.
- Keep the block's structure (MD-anchored day-types, ≤3-in-a-row, deload week) exactly; only the **weekly
  scaling per KPI** now comes from the engine.
- Surface the engine's **cap reason** in the overload table / tooltip ("HSR held by rate cap this week",
  "distance at match ceiling") so the ramp explains itself — reuse `CapReason`.

Deload week stays the unload (mult ~0.6) as today; the engine ramps the build weeks up to it.

## Part 2 — move the per-player build into the hub (Players tab / "build-up" mode)

The page's real unique value is the **per-player build-to-match-fitness** summary — the right tool for pre-
season and for a player returning from a break/injury who must be ramped back to match load. Put it where
players already live:

- On the **Players tab**, add a **"Build-up plan"** view for the selected player: run
  `buildProgressiveOverload` on that player's rows → his per-KPI ramp + `status` (build / progress / hold)
  toward *his own* match unit, reusing `ProgressiveOverloadCard`. This dovetails with the per-player
  individualisation brief (same match-unit path).
- Optionally expose a **"build-up"** toggle on the Meso planner for a pre-season / return-to-play block that
  ramps from current baseline rather than assuming match-fit — the engine already models exactly this.

## Part 3 — reconcile the ACWR tension (important)

The engine caps weeks at **ACWR ≤ 1.3** (`ACWR_CEILING`, Gabbett). The Periodization Hub deliberately
**dismisses ACWR** as the target (Teixeira 2021 + the club's "Time to Dismiss ACWR" note), using
**training:match ratio + acute-load trend + readiness** instead. Don't ship both stances side by side.

- Keep the ACWR value as a **contested secondary readout**, labelled (the Meso map already shows "ACWR … —
  contested view"); do the same wherever the build shows it.
- Make the **primary** guardrail the hub's stance: the match-demand **ceiling** (already in the engine) plus
  the **acute-load trend + readiness** deload trigger (`MesoBlock`). Rename the surfaced cap reason from
  "ACWR cap" to the plain "held so the week doesn't spike" and let ACWR be the optional detail, not the
  headline. This keeps one honest position across the hub.

## Part 4 — retire the page

- Remove the `/coach/progressive-overload` nav entry from `CoachSidebar.tsx` (~line 159).
- Redirect `/coach/progressive-overload` → `/coach/periodization-hub` (Players/Build-up) so old links/tutorial
  deep-links don't 404; keep the route as a thin redirect.
- Update the tutorial copy (`tutorialCopy.ts` "How to use Progressive Overload") to point at the hub, or fold
  it into the hub's tutorial.
- Keep `src/lib/micropulse/progressiveOverload/index.ts` and `ProgressiveOverloadCard.tsx` — they're now the
  hub's engine + component, not a standalone page.

## Acceptance

- The Meso block's weekly overload is driven by `buildProgressiveOverload` (differentiated per-KPI rates +
  match-demand ceiling), not a flat multiplier; the block structure (day-types, ≤3, deload) is unchanged;
  each week's scaling shows its cap reason.
- The Players tab shows a per-player build-up plan (ramp + build/progress/hold) toward the player's own match
  unit, reusing `ProgressiveOverloadCard`.
- ACWR appears only as a labelled contested secondary readout; the primary guardrails are the match ceiling
  + acute-trend/readiness. One consistent stance hub-wide.
- The standalone page is gone from nav; the route redirects into the hub; the tutorial points at the hub. No
  functionality lost. EN/IS. Never the readiness colour. Lint + typecheck clean; manifesto five-question
  check passes.

Ref: `src/lib/micropulse/progressiveOverload/index.ts` (`buildProgressiveOverload`, `WEEKLY_RATE`,
`CapReason`, `PlayerRamp`, `ACWR_CEILING`), `src/lib/micropulse/periodization/index.ts` (`buildCalendarBlock`
weekly multiplier), `src/app/coach/periodization-hub/page.tsx`, `src/components/coach/
ProgressiveOverloadCard.tsx`, `src/app/coach/CoachSidebar.tsx`, `docs/research/football-periodization-
evidence.md` (the ACWR-dismissal + match-relative rationale). Pairs with the hub-restructure, per-player, and
IMA-variables briefs.
