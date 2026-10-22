# Claude Code brief — drill recommender by playing STYLE and by WORST-CASE SCENARIO (WCS)

Goal: recommend on-pitch drills two complementary ways — (1) by the player's **playing style** (rehearse
or develop his movement archetype), and (2) by his **Worst-Case Scenario** (drills that reach or exceed
the intensity of his hardest match minutes). One recommender, a `target` mode: `style | wcs | both`.
**Descriptive/advisory — the coach picks; never the readiness colour.**

Related: `docs/tasks/drill-to-md-day-fit-session-builder-claude-code-brief.md` (WCS drills = the MD-3
high-intensity day).

## Reuse (verified — the STYLE path largely exists)

- **`footballDrills/recommend.ts` `recommendFootballDrills`** — each `drill_library` drill carries a
  measured demand profile (HSR `vel_b5/b6`, `accel_b23`, `decel_b23`, `player_load_per_min`); matches it
  to the player's movement profile → **GAP** (too little → drills high in it) or **STRENGTH** (rehearse
  his game). Surfaced via `team/gap-drills` (Train-like-you-play / Move 2).
- **`positionStyle.ts`** — the player's archetype (speed / agility / volume / aerial) from z-scored per-90
  movement. This IS the "playing style".
- **`drillExposureClassifier.ts`** — drill → exposure tags + intensity; `drill_library` has GPS metrics +
  `area_per_player_m2`.
- **WCS data already exists:** `player_peak_window` (peak 1/3/5-min: `hsr_m`, `vb5/vb6`, `player_load`,
  `ima_accel/ima_decel/ima_cod`, `window_min`, `hsr_threshold`) + the power curve — the hardest-minutes
  demand.

So the STYLE path = surface/extend the existing recommender; the WCS path is the new piece.

## Part 1 — STYLE target (reuse + surface)

Given the player's `positionStyle` archetype + the existing `recommendFootballDrills`:
- **Rehearse** (strength): drills that match his dominant style axis (e.g., a speed-archetype winger →
  high-HSR/sprint drills).
- **Develop** (gap): drills high in his weakest demanded axis vs his position (ties to
  `positionFitnessRequirements`).
Mostly wiring: pass the archetype + position demand into the recommender and label the reason
("rehearses his speed profile" / "develops his under-exposed accel/decel").

## Part 2 — WCS target (new)

WCS = the intensity of the hardest minutes, so a drill must **reach or exceed** it to prepare for it.

New pure lib `src/lib/micropulse/footballDrills/wcsDrillMatch.ts`:

```ts
import type { Bi } from "@/lib/micropulse/load/peakPeriod";

/** The player's (or position's) worst-case demand — per-minute at his most intense window. */
export interface WcsTarget {
  hsrPerMin: number|null;        // from player_peak_window hsr_m / window_min (shortest/most intense)
  accelDecelPerMin: number|null; // (ima_accel + ima_decel) / window_min
  codPerMin: number|null;        // ima_cod / window_min
  playerLoadPerMin: number|null; // player_load / window_min
  windowMin: number|null; source: "player" | "position";
}
export interface DrillWcsFit {
  drillId: string; label: string;
  reaches: { hsr: boolean; accelDecel: boolean; cod: boolean; playerLoad: boolean };
  overallPct: number;            // how close the drill's peak intensity is to WCS (0–100+, >100 = exceeds)
  verdict: "exceeds" | "meets" | "below";
  levers: Bi[];                  // intensity-raising suggestions when below
  reason: Bi;
}
export function matchDrillsToWcs(target: WcsTarget, drills: Array<{
  id: string; label: string; player_load_per_min: number|null; vel_b5: number|null; vel_b6: number|null;
  accel_b23: number|null; decel_b23: number|null; duration_min: number|null; area_per_player_m2: number|null;
}>): DrillWcsFit[];
```

- Compute each drill's **peak per-minute intensity** on the WCS qualities (HSR/min, accel+decel/min,
  PL/min; CoD where available) and compare to the target. `exceeds`/`meets`/`below`.
- **Intensity levers when below** (direction from SSG research — Gaudino/Casamichana/Owen): *smaller
  area-per-player* → more accel/decel + CoD; *larger area* → more HSR/sprint; *fewer players* → higher
  individual involvement; *higher tempo / add transitions* → raise PL/min. Surface the specific lever
  (e.g., "shrink to ~120 m²/player to lift accel/decel toward his WCS").
- Rank drills by `overallPct`; those that already exceed his WCS are the "worst-case ready" set.

WCS source: prefer the **player's own** peak window; fall back to the **position's** peak (from squad /
`positionFitnessRequirements`) when the player has too little peak data — labelled.

## Part 3 — TACTICAL layer (this is what makes it "playing style", not just load)

Physical intensity alone doesn't say *what game situation* produced the worst case. The tactical layer
adds it — so a drill rehearses the hardest minutes **in their game context**, which is the real playing
style, not just a load number.

Reuse the existing fusion (do NOT rebuild):
- **`peakPeriodContext/index.ts`** already fuses the physical peak window (WCS) with the time-stamped
  tactical events in that window and classifies the **Ju 2022 tactical action** (`run_in_behind`,
  `move_to_receive`, `support_play`, `run_with_ball`, `interception`, `recovery_run`, support, covering).
- **`wyscoutEvents/parseSportscode.ts` `labelsInWindow`** gives the **team style-of-play phase**
  overlapping a peak (attacking / defending / transition / press labels).
- Feed-agnostic `MatchEvent`: Wyscout SportsCode today; **StatsBomb events (with x,y) later** unlock Ju's
  remaining coordinate-based actions (push up pitch, break into box, over/underlap, press).

Use it so the WCS target carries its **tactical situation**, and map that to drill types:
- WCS in **defensive transition / recovery run** → transition drills (regain + counter) at that intensity.
- WCS in **run in behind / run with ball** → penetration / breakaway drills.
- WCS in **support play / move to receive** → possession + third-man combinations.
- `drill_library.category` (possession / ssg / transition / finishing / running) is the coarse tactical
  tag to match against; refine with the drill's format + area.

**Honest scope (carry it):** on-ball tactical context is reliable from event labels; **off-ball (recovery
run, covering) is only partial without tracking** — label those "needs tracking", never invent. So the
tactical recommendation shows its confidence, and is strongest when the fusion has a clocked event feed.

## Style = physical + tactical

"Playing style" in the recommender is now **both**: the physical movement archetype (`positionStyle`) AND
the recurring tactical situations of his hardest minutes (`peakPeriodContext`). Drills are recommended to
rehearse that combined style at worst-case intensity.

## Unify — `target: style | wcs | both`

- `style` → Part 1 (physical) + Part 3 (tactical). `wcs` → Part 2 (intensity) + Part 3 (its tactical
  situation). `both` → intersect: drills that **fit his style (physical + tactical) AND reach his WCS
  intensity** — rehearse his game, in its game situation, at worst-case intensity. The strongest recommendation.
- Ties to the MD day: WCS/high-intensity drills belong on **MD-3** (locomotive/high-intensity); flag if a
  WCS drill is dropped onto an MD-4 mechanical or MD-1 taper day (reuse the drill↔MD-day fit lib).

## Surface

- In the Session Builder / a "Drill ideas" panel: pick a player + target (Style / WCS / Both) → a ranked
  drill list with the reason, the reach dots (HSR/accel-decel/CoD/PL), and the intensity levers for
  below-WCS drills. Show the drill diagram (`diagram_url`) where present. Coach adds manually.

## Guardrails / tests

- Pure libs; no I/O in the match/score functions; null-safe (missing metric → that quality `null`, never
  fabricated); position fallback labelled; injured players excluded from team runs.
- Reuse `recommendFootballDrills`, `positionStyle`, `drillExposureClassifier`, `player_peak_window` — no
  duplicate engines. **Boundary test:** recommendations never reach the readiness colour or daily decision.
- Tests: WCS target from a peak window; a high-PL/min small-area drill `exceeds` accel/decel WCS; a
  low-intensity drill `below` with a "shrink area / raise tempo" lever; `both` intersects style+WCS;
  position fallback when player peak data is thin; boundary test.

`npx eslint <changed files>` + tests; lint-clean.

## Acceptance
- [ ] STYLE recommendations from the archetype (reuse `recommendFootballDrills`), labelled rehearse/develop.
- [ ] WCS target computed from `player_peak_window` (player, position fallback); drills scored reaches/meets/below.
- [ ] Intensity levers surfaced for below-WCS drills (area/player, player count, tempo, transitions), cited.
- [ ] Tactical layer via `peakPeriodContext` (+ `wyscoutEvents`): WCS carries its game situation, mapped
      to drill types; off-ball labelled "needs tracking"; StatsBomb-x/y actions ready for when that feed lands.
- [ ] `target: style | wcs | both` (style = physical + tactical); MD-day fit flag reused; diagrams shown; coach-owned.
- [ ] Descriptive-only boundary test passes; no engine duplication; eslint + tests clean.

## Data sources (answer to "are Wyscout/StatsBomb used?")

- **Physical intensity + physical style:** GPS/Catapult (`player_peak_window`, `positionStyle`,
  `drill_library` metrics) — Parts 1–2.
- **Tactical style + WCS situation:** **Wyscout** (SportsCode event labels, live now via
  `peakPeriodContext` + `wyscoutEvents`) and **StatsBomb** (events with x,y — unlocks Ju's
  coordinate-based actions when that feed lands) — Part 3.
So the recommender uses **all three feeds**: Catapult for how hard, Wyscout/StatsBomb for what tactically.

## Citations
Ju et al. 2022 (contextualised peak periods — the tactical-action taxonomy of the WCS window);
worst-case / peak-period demands: Martín-García/Casamichana, Owen 2017; SSG pitch-size → load: Gaudino,
Casamichana, Owen (smaller area = more accel/decel+CoD, larger = more HSR). Physical style grounded in
`positionStyle`; tactical fusion in `peakPeriodContext`.
