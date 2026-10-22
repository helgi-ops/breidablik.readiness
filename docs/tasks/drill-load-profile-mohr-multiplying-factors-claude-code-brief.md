# Claude Code brief — four-category drill/session load profile (Mohr multiplying-factor model)

Goal: give a drill (and a whole session) a **load profile split by energy system** — aerobic,
anaerobic/high-speed, speed, and muscular/joint — using Magni Mohr's multiplying-factor model (FIFA
Fitness A). Today the Session Builder predicts ONE PlayerLoad number; this adds the **category balance** a
fitness coach actually plans against ("this session is speed-heavy, light aerobic"), and it works from
**GPS OR coach estimates**, so it serves non-GPS teams too.

**Descriptive, coach-owned planning aid.** The multiplying factors are Mohr's practitioner heuristic, NOT
a validated instrument — store them as **configurable, team-tunable constants**, present the output as
low-confidence category context, and **never touch the readiness colour, the load target, or the daily
decision** (same boundary as `sessionPlan.ts`).

## What exists (reuse)

- **`player_drill_load`** (`20260711120000`): per-drill GPS — `player_load`, `distance_m`, `hir_total`,
  `vel_b5` (19.8–25.2 km/h), `vel_b6` (>25.2), `max_velocity`, `accel_b23`/`decel_b23` (high-intensity
  counts), `accel_total`/`decel_total`, `hmld_m`, `metabolic_power_avg`, `duration_min`.
- **`sessionPlan.ts`** — Session Builder: `PlannedDrill { id, label, durationMin, targetPct }` →
  `predictSession(...)` (single PlayerLoad). Add the category profile beside it.
- **`drillExposureClassifier.ts`** — `DrillLike { category, vel_b5, vel_b6, accel_b23, decel_b23,
  player_load, player_load_per_min, duration_min, hir_total }`, and `drill_library` carries category +
  metric averages (the coach-estimate fallback source).
- No four-category energy-system split exists — this is the gap.

## The model — Mohr multiplying factors (slide 36; make all factors configurable)

Four load categories, each = Σ (measure × factor). Store factors in one config object (team-overridable):

**Aerobic load** — minutes in HR-exertion zone × factor:
`70–80% ×1 · 80–85% ×2 · 85–90% ×4 · 90–95% ×7 · 95–100% ×10`

**Anaerobic / high-speed load** — distance (per 100 m) in speed band × factor:
`10–14 km/h ×1 · 14–17 ×2 · 17–21 ×4 · 21–24 ×7 · >24 ×10`

**Speed load** — count of max-speed efforts by % of the player's max speed × factor:
`85–90% ×5 · 90–95% ×10 · 95–100% ×20`

**Muscular / joint stress** — counts × factor:
`accel/decel low ×5 · med ×10 · high ×20 · impacts low ×5 / med ×10 / high ×20 · turns (95–100%) ×20`

**Subjective (optional):** VAS-1 (breathing/cardio) and VAS-2 (legs/muscular), coach/player entered.

## GPS → model mapping (and the honest gap)

- **Anaerobic/high-speed:** map Catapult bands to the nearest Mohr band — `vel_b5` (~17–25) → the 17–21
  and 21–24 factors, `vel_b6` (>25) → the >24 factor; lower bands from `distance_m − hir_total` split by
  the coach-estimate or drill_library averages. Note the band-edge approximation in the caveat.
- **Speed:** `max_velocity` vs the player's MSS (from `speedZones`/fitness tests) → % band; use sprint-
  effort count if available, else 1 per drill that reaches the band.
- **Muscular/joint:** `accel_b23 + decel_b23` → the "high" factor; `accel_total/decel_total` minus the
  high counts → low/med; `ima_cod`/turns where present.
- **Aerobic — the weak axis:** `player_drill_load` has **no per-drill HR**. Order of preference: (1) per-
  drill HR-zone minutes if an HR source is joined; (2) a coach mean-%HRmax estimate per drill; (3) a
  speed-based aerobic-volume proxy (distance in 10–17 km/h bands). **Label which was used;** don't present
  a proxy aerobic value as measured.

For a **planned drill with no GPS**, the coach picks low/med/high per axis (or the model uses the
`drill_library` averages for that drill category) → same factor maths.

## New pure lib — `src/lib/micropulse/load/drillLoadProfile.ts` (no I/O)

```ts
import type { Bi } from "./peakPeriod";

export type LoadCategory = "aerobic" | "anaerobic" | "speed" | "muscular";
export interface LoadFactors { /* the tables above, all editable */ }
export const DEFAULT_LOAD_FACTORS: LoadFactors;

export interface DrillLoadInputs {
  durationMin: number;
  hrZoneMinutes?: Partial<Record<"z1"|"z2"|"z3"|"z4"|"z5", number>>;   // aerobic
  meanPctHrMax?: number | null;                                        // aerobic fallback
  speedBandDistanceM?: Partial<Record<"b1"|"b2"|"b3"|"b4"|"b5", number>>; // anaerobic (Mohr bands)
  maxSpeedEffortsByBand?: Partial<Record<"s1"|"s2"|"s3", number>>;     // speed
  accelDecel?: { low: number; med: number; high: number };            // muscular
  impacts?: { low: number; med: number; high: number };
  turns?: number;
  vas1?: number | null; vas2?: number | null;                         // subjective
}
export interface DrillLoadProfile {
  byCategory: Record<LoadCategory, number>;
  total: number;                       // Σ categories (for a coarse single number)
  dominant: LoadCategory;              // the heaviest system
  aerobicSource: "hr_zones" | "mean_hr" | "speed_proxy" | "none";
  vas1: number | null; vas2: number | null;
  note: Bi;                            // "speed-dominant · aerobic from a speed proxy"; heuristic caveat
}
export function computeDrillLoadProfile(inp: DrillLoadInputs, factors?: LoadFactors): DrillLoadProfile;

// From a completed GPS drill row (player_drill_load) + the player's MSS.
export function profileFromDrillLoadRow(row: {
  duration_min: number|null; distance_m: number|null; hir_total: number|null;
  vel_b5: number|null; vel_b6: number|null; max_velocity: number|null;
  accel_b23: number|null; decel_b23: number|null; accel_total: number|null; decel_total: number|null;
}, mssKmh: number|null, factors?: LoadFactors): DrillLoadProfile;

// Roll a session up: Σ per category over drills + the balance read.
export function sessionLoadProfile(drills: DrillLoadProfile[]): {
  byCategory: Record<LoadCategory, number>; dominant: LoadCategory; balance: Bi;
};
```

- Pure; guard divide-by-zero and non-finite; missing axis → 0 for that category (never fabricated).
- `note`/`balance` carry: heuristic model (Mohr, FIFA Fitness A), configurable factors, descriptive-only.

## Surface

- **Session Builder (`SessionBuilder` / `PlannedSessionLoadCard`):** beside the predicted PlayerLoad, a
  small **four-bar category profile** for the planned session + a one-line balance ("speed-heavy — add
  aerobic volume if this is MD-4"). Per-drill toggle: enter low/med/high per axis when no GPS.
- **Load-intelligence (completed sessions):** compute `profileFromDrillLoadRow` per drill from
  `player_drill_load` and show the delivered category balance vs the planned one ("planned aerobic-heavy,
  delivered speed-heavy").
- A **team settings** panel to edit the factors (they're a coaching philosophy, not a constant).

## Guardrails
- Pure lib; factors configurable; output descriptive/low-confidence, coach-owned.
- Aerobic proxy always labelled; band-mapping approximation stated.
- **Boundary test:** the profile must not reach the readiness colour, the load target, or the daily decision.

## Tests — `src/lib/micropulse/load/__tests__/drillLoadProfile.test.ts`
1. Known inputs → each category = Σ(measure×factor) exactly (hand-checked).
2. `dominant` picks the largest category; `sessionLoadProfile` sums across drills.
3. Aerobic falls back hr_zones → mean_hr → speed_proxy and sets `aerobicSource` accordingly.
4. `profileFromDrillLoadRow`: vel_b6 → >24 factor; accel_b23+decel_b23 → high muscular factor.
5. Missing axis → 0, never fabricated; editable factors change the result.
6. Boundary test: no readiness/decision import.

`npx eslint <changed files>` + tests; lint-clean.

## Acceptance
- [ ] `drillLoadProfile.ts` pure; four categories via configurable Mohr factors; GPS + coach-estimate paths.
- [ ] Session Builder shows the planned category balance; load-intelligence shows planned-vs-delivered.
- [ ] Factors editable per team; aerobic-source + heuristic caveats visible.
- [ ] Descriptive-only boundary test passes; eslint + tests clean.

## Citation
Mohr M. *The Fitness Coach* — training-load assessment via multiplying factors (FIFA Fitness A course,
2025). Category framework consistent with Bangsbo/Mohr football-physiology training taxonomy. Treat the
factors as a coaching heuristic, tunable per team.
