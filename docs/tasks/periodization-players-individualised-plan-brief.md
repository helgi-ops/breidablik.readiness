# Brief — Players tab: per-player individualised plan, computed from the Meso Cycle

**The coach's ask:** the Players tab (Periodization Hub) should show an **individualised plan for the
player, computed from the Meso Cycle**. **Yes — it's possible, and most of the engine already exists.** This
brief says how to wire it. Descriptive planning — never sets the readiness colour. Rules recommend; the
coach decides and overrides.

File: `src/app/coach/periodization-hub/page.tsx` (Players tab + the Meso planner state). Logic:
`src/lib/micropulse/periodization/index.ts`.

## The core idea — one skeleton, individual numbers

The **Meso Cycle** tab already produces a block **skeleton**: start date, number of weeks, goal, the match
days, forced off/on days, and the overload ramp (`buildCalendarBlock({ unit, startDate, numWeeks,
scopeName, scopePos, matchDates, offDays, onDays, baseOverloadPct, stepPct })`). Today it's run once for the
**team** unit.

The Players tab should run the **same skeleton** through `buildCalendarBlock` **per player**, swapping in
that player's own match unit and applying player-specific adjustments. So the *shape* (weeks, match days,
day-types, deload, ≤3-in-a-row) is inherited from the Meso Cycle exactly; only the *numbers and caps*
individualise. That is literally "computed from the Meso Cycle" — change the block there, every player's
plan updates.

**Make the skeleton shared state.** Lift the planner's skeleton (dates, weeks, goal, `matchDates`,
`offDays`, `onDays`, base/step overload) into state the Players tab also reads. The Players tab does **not**
get its own calendar editor — it consumes the Meso one.

## What already exists (reuse — don't rebuild)

- `buildCalendarBlock(...)` — builds the whole block from a `unit`; already accepts `scopeName/scopePos`
  and the coach skeleton (`matchDates/offDays/onDays`). Runs per player as-is.
- `computeMatchUnit(rows)` — a player's own match unit (median = typical, p90 = peak) from his ≥80-min
  matches, with confidence + fallback. This is the per-player `unit`.
- The planner already has **Scope = Team | player** and notes "Match unit from the player selected in the
  Players tab" — the plumbing is half there.
- `HubPlayerRow` (name, position, masKmh, matchUnitLoad, matchUnitHsr, nNearFull, valdCap, gaps) and
  `ValdCap` (status green/yellow/red, capPct, note) — the individualisation inputs.
- `downloadPeriodizationBlockPdf({ scope: { kind: "player" }, ... })` — the per-player PDF export exists.

## The individualisation layers (on top of the shared skeleton)

Apply in this order when building a player's block:

1. **Own match unit.** Use `computeMatchUnit(playerRows)` as the `unit`. If `nNearFull < minSample`, fall
   back to the team unit and mark confidence **low** ("few full matches — using squad baseline"). Never
   silently pretend.
2. **Position emphasis.** Nudge the day-type shares by position from the squad demands (winger → more HSR on
   Locomotive days; centre-back → more mechanical/accel-decel), within the same day-types. Keep it a small
   bias, cite Figueiredo (positional match-relative demands). If position is unknown, use team shares.
3. **Readiness-to-load cap (VALD).** Cap the overload multiplier by the player's `valdCap`: green → full ramp;
   yellow → cap the peak week (e.g. ≤ ×1.15); red → hold at maintenance and flag. This is the adjustment that
   matters most — don't push a flagged player to the team's peak. Show the cap as a line, not a silent change.
4. **Minutes-based load (in-season).** Read the player's recent match minutes: high-minute starters carry
   most of their load from matches, so **add less** training load (trim the multiplier); low-minute players
   get the **top-up** days pushed toward the weekly target (the `topup` day-type already exists for this).
   This is the coach's own earlier point — in-season, players who play a lot need less added load. Ground:
   Teixeira 2021 (~80% training / 20% match), Oliveira 2019.
5. **Confidence.** One chip per player = min(match-unit confidence, VALD data recency, baseline maturity).

## How it surfaces (explainability-first — verdict → why → confidence → override)

Per selected player, under the Players tab:

- **Level 0 — verdict** (bold, first): one line on how this player's plan differs from the team default.
  *e.g. "Óli Valur's block runs ~8% lighter than the squad plan — he's a high-minute starter, and his HSR
  targets sit above the team on Locomotive days (winger)."*
- **Level 1 — 2–3 facts** naming the driver: own match unit vs team; the position tilt; any readiness cap or
  minutes trim.
- **Level 2 — the individualised block**, same layout as the Meso planner's "system computes" list (week
  banners + day rows + weekly %), but with this player's numbers, plus **Export this player's block (PDF)**
  (reuse `downloadPeriodizationBlockPdf`, scope player).
- Every adjustment is **visible and overridable** — the coach can drop back to the team unit or lift a cap;
  nothing auto-applies to the readiness verdict.

Optional (nice for scanning): a small **squad table** — each player × the block's weekly target vs the team,
so the coach sees at a glance who's being loaded lighter/heavier and why.

## House rules

- Reads the **shared Meso skeleton** — the Players tab never edits the calendar, it individualises it.
- EN/IS throughout. Descriptive only — **never** sets or reads the readiness colour
  (`v_coach_readiness_today_v8.final_color`); VALD cap here is a *planning* input, surfaced as its own line.
- Targets are a data-anchored starting point, not a norm to obey (Little & Buchheit). Rules recommend; the
  coach decides.

## Acceptance

- Selecting a player in the Players tab renders his **individualised block off the current Meso skeleton**:
  same weeks/match days/day-types/deload, but numbers from his own match unit, with the position tilt,
  VALD cap, and minutes trim applied and each shown as a plain line.
- Editing the Meso Cycle block (dates, weeks, goal, off/on days, overload) updates every player's plan —
  proving it's computed *from* the Meso Cycle, not a separate plan.
- A player with `nNearFull < minSample` falls back to the squad unit with a visible low-confidence note.
- A yellow/red VALD player's peak is capped and flagged; a high-minute starter's added load is trimmed vs a
  fringe player who gets top-ups toward the weekly target.
- **Export this player's block (PDF)** produces the demo-style PDF scoped to the player. EN/IS works. Lint +
  typecheck clean. Manifesto five-question check passes (provenance ✓, glance verdict ✓, why ✓, override ✓,
  rules-only ✓).

Ref: `src/lib/micropulse/periodization/index.ts` (`buildCalendarBlock`, `computeMatchUnit`, `ValdCap`,
day-type shares), `src/app/coach/periodization-hub/page.tsx` (Players tab ~line 611, planner scope toggle,
`calBlock` skeleton), `src/components/coach/PeriodizationBlockPdf.tsx` (per-player export),
`docs/research/football-periodization-evidence.md`, `docs/explainability-first.md`.
