# IA plan + Code brief — Strength Hub (coach owns the rules; system reads readiness + microcycle)

## The ask (owner, Oct 2026)
Strength planning is scattered across several routes ("út um allt"). Bring it into **one Strength Hub**.
Crucially, keep MicroPulse's wedge (the thing Bridge / PT-apps don't do): the plan is
**readiness- and microcycle-connected**, but — per the manifesto — **the strength coach owns and sets the
rules / structure** (how the build-up should be), and **the system only reads readiness + the microcycle and
applies/advises within the coach's rules.** Rules are coach-authored and overridable; the system never
invents the plan.

## Current state (verified — much of the engine already exists)
- Planning surfaces are split: `/coach/strength` ("Today's session" = daily send) with a **week** tab
  (`?tab=week` = the MD-periodised week planner, the old `/coach/training-programme` folded in);
  `/coach/programme-library` (tabbed programme hub); PT-mode `ptStrengthLinks` (Custom programmes, Explosive
  Power 12w, LV Profile / 1RM ramp-test, admin-only). Monitoring (Strength Monitoring + VBT/CMJ) lives as
  Today tabs / the intelligence hubs.
- The **readiness+MD engine is largely built** in `src/lib/micropulse/strengthProgramming/`:
  `structures.ts` (`STRUCTURES_ALLOWED_BY_MD`, `DEFAULT_STRUCTURE_BY_MD`, `STRUCTURE_LABEL`,
  `readinessDowngrade`), `seasonPhaseStrength.ts`, `inSeasonStrengthMode.ts`, `preseasonEmphasis.ts`,
  `adaptationRules.ts`, `blockEmphasis.ts`, `rpeAutoregulate.ts`, `md1Tier.ts`, `mdTemplates/`,
  `oneRmFromLogs.ts`, `structureBuilders.ts`. So "system reads MD + readiness and shapes the session" exists.
- **The gap:** these are **defaults / hardcoded rules**. There is no single coach-facing place to *own* them —
  to set which structure runs on each MD day, how readiness downgrades, the progression/autoreg scheme, and
  the season-phase emphasis — as the coach's model.

## Move 1 — one Strength Hub (consolidate the planning surfaces)
A tabbed hub (same pattern as the Load Intelligence hub + Coaching Library), the single home for strength
**planning**:
- **Today's session** — `/coach/strength` (daily per-player send, already readiness/MD-tuned).
- **Week planner** — the MD-periodised week (`?tab=week` / `training-programme` body).
- **Programme library** — `/coach/programme-library` (templates + Custom programmes from PT mode, respecting
  the team-vs-PT split).
- **Strength model (rules)** — the NEW coach-owned configuration surface (Move 2).
- **1RM / LV profile** — the ramp-test / load-setting tool (ELITE), as a tab.
- **Periodization link** — deep-link to `/coach/periodization-hub` (sets the season macro→meso block goal the
  week executes); don't duplicate it, link it.
- Reuse the existing page bodies as tabs (lazy-mount), like the other hubs; the standalone routes stay live
  for deep links. **Monitoring stays out** (Strength Monitoring + VBT/CMJ remain in the intelligence hubs —
  the Strength Hub is for *planning*, not monitoring; no duplication).
- Sidebar: collapse the scattered `strengthPlanningLinks` + PT strength entries into one "Strength" hub entry
  (keep PT-only tabs gated to admin/PT mode).

## Move 2 — the coach-owned "Strength Model" (the heart of the ask)
A configuration surface where the **strength coach authors the rules**, and the system reads readiness + MD
to apply them. Build it on the existing lib (don't replace the engine — expose + persist its choices):

1. **Structure per MD day.** For each MD day (MD-5…MD+1), the coach picks the structure from
   `STRUCTURES_ALLOWED_BY_MD` (the allowed set is the guardrail; the pick is the coach's). Default =
   `DEFAULT_STRUCTURE_BY_MD`, but the coach can change it and it sticks (per team).
2. **Readiness behaviour.** The coach sets how readiness modifies the plan — i.e. owns the `readinessDowngrade`
   policy (e.g. YELLOW → one structure softer / cap volume %, RED → recovery only). Expose the existing
   downgrade as editable rules with sensible defaults.
3. **Progression / autoregulation scheme.** The coach chooses the progression model (e.g. RPE autoreg via
   `rpeAutoregulate`, %1RM from `oneRmFromLogs`, linear/undulating), and its parameters. The system applies
   it; the coach set it.
4. **Season-phase emphasis.** Off/pre/in-season goal + microdose/traditional toggle + per-player pre-season
   emphasis (`seasonPhaseStrength` / `inSeasonStrengthMode` / `preseasonEmphasis`) — surfaced as coach
   choices, not fixed. (This is roadmap #5 `season-phase-strength-periodization`; the hub is its home.)
5. **Persist as a team-level "strength model".** Store the coach's choices (new `team_strength_model` table
   or JSON config) that the daily send + week planner read. Changing the model re-shapes future sessions;
   past sends are untouched.

**Division of labour (make this explicit in the UI copy):** the coach *authors the model* (structures,
readiness policy, progression, season phase); the system *reads today's readiness + the MD-day and renders
the session within the model*; the coach can *override any individual session* (logged, per the manifesto).
The system never changes the model or the plan on its own.

## Guardrails / boundary
- **Rules decide, coach owns; system reads & advises.** The system applies readiness + microcycle *within*
  the coach's model; it does not author or silently change the plan. Overrides are logged.
- **Boundary:** the readiness **colour** is unchanged — strength reads it as an input, never sets it.
- **Don't out-Bridge Bridge:** the hub's value is the readiness+microcycle binding and the coach-owned model,
  not a generic program builder. Keep scope to serving the club's decision + match week.
- Respect team-mode vs PT-mode split (PT strength tools stay admin/PT-gated).
- Reuse existing lib + page bodies; no second copy. Standalone routes stay for deep links.
- `npx eslint` on changed files; typecheck; any schema (strength model table) saved as a migration under
  `supabase/migrations/`.

## Why this is the right shape
It consolidates the scattered strength surfaces (same IA win as Library/Squad), and it turns the already-built
readiness+MD engine from *hardcoded defaults* into a *coach-owned model* — which is exactly the manifesto
("rules decide, coach owns") and exactly the wedge Bridge/PT-apps lack (readiness- and microcycle-bound
strength planning that the coach controls).
