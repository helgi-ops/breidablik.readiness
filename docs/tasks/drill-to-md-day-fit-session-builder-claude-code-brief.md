# Claude Code brief — drill ↔ MD-day fit (which drills belong on MD-4, MD-3, … and why)

Goal: in the Session Builder, given today's MD day, **recommend the drills whose load character fits that
day's emphasis** — MD-4 = mechanical (force / accel-decel), MD-3 = locomotive (high-speed running peak),
MD-2 = speed/primer, MD-1 = activation — and flag drills that don't fit ("high-speed drill — heavy for an
MD-4 mechanical day"). **Descriptive planning aid the coach owns; never the readiness colour or the daily
decision.**

## ALREADY EXISTS — reuse, do NOT redefine (verified)

- **MD day → session type:** `plannedSessionLoad.ts` / `loadPlan/index.ts` already map the MD day to a
  `SessionLoadType` (`mechanical | locomotive | mixed`) — "MD-4 mechanical, MD-3 locomotive peak, MD-2
  primer". **Call it; don't re-derive the MD→type mapping.**
- **Per-type KPI emphasis:** `loadPlan/index.ts` `EMPHASIS` — mechanical `{accel 1.15, decel 1.15,
  efforts 1.15, hsr 0.85, sprint 0.8}`, locomotive `{hsr 1.15, sprint 1.2, ima 1.1, accel 0.9, decel 0.9}`.
- **Balance nudge:** `loadPlan` already computes a `lean` (recent mechanical vs locomotive) and a
  recommendation to rebalance — reuse it for the "what's best today" hint.
- **Drill classification (partial):** `drillExposureClassifier.ts` → exposure tags (MAX_SPEED, HIGH_DECEL,
  CONTACT, FIELD_MINUTES) + `estimateDrillIntensity` (LOW/MOD/HIGH). `drill_library` carries GPS metrics
  and **`area_per_player_m2`** (generated).
- **Constraint matcher:** `drillConstraintMatcher.ts` already flags which players skip/reduce a drill.

So the ONLY gap is: classify a drill by its **dominant load type** in loadPlan's vocabulary, and score
its **fit to the MD day**. Everything else is wiring.

## The periodization basis (defaults, configurable — a convention, not a hard law)

Tactical-periodization "horizontal alternation" (well supported, but a coaching convention → ship as
tunable defaults):
- **MD-4 → mechanical:** force / accel-decel / COD / strength-endurance; small pitch, small SSG (small
  area/player raises accel/decel + COD, lowers high-speed). Highest muscular/mechanical.
- **MD-3 → locomotive:** high-speed-running + sprint VOLUME peak; large pitch / position-specific runs.
- **MD-2 → speed/primer:** short, sharp max-velocity exposure, low volume.
- **MD-1 → activation:** low volume, priming, taper. **MD+1 → recovery.**
Cite: Owen 2017/2024, Martin-Garcia 2018 (already cited in `loadTargets`), Buchheit & Lacome, Stevens
2017, Oliva-Lozano; SSG pitch-size→load: Gaudino, Casamichana, Owen SSG work.

## New pure lib `src/lib/micropulse/load/drillMdFit.ts` (no I/O)

```ts
import type { Bi } from "./peakPeriod";
import type { SessionLoadType } from "@/lib/micropulse/plannedSessionLoad";

export type DrillLoadType = "mechanical" | "locomotive" | "speed" | "metabolic" | "balanced" | "low";

export interface DrillLoadSignal {
  category: string;
  player_load_per_min: number|null; distance_m: number|null; duration_min: number|null;
  vel_b5: number|null; vel_b6: number|null; hir_total: number|null; max_velocity: number|null;
  accel_b23: number|null; decel_b23: number|null;
  area_per_player_m2?: number|null;   // from drill_library (generated)
}

// Dominant load character from the GPS profile (best) or area-per-player (fallback for drills w/o GPS).
export function classifyDrillLoadType(d: DrillLoadSignal): { type: DrillLoadType; confidence: "high"|"moderate"|"low"; why: Bi };

export interface DrillMdFit {
  drillType: DrillLoadType; dayType: SessionLoadType | "primer" | "activation" | "recovery";
  fit: "ideal" | "ok" | "off";          // ideal = matches the day; off = wrong emphasis
  reason: Bi;                            // "locomotive drill on an MD-4 mechanical day — heavy/high-speed"
  score: number;                        // 0–100 for sorting the drill list
}
// Reuse plannedSessionLoad to get the day's target type — pass it in; do not re-derive.
export function drillFitForMdDay(drillType: DrillLoadType, dayTargetType: SessionLoadType, mdContext?: string): DrillMdFit;
```

### Classification logic (thresholds configurable, grounded in the metric ratio)
- **mechanical:** high `accel_b23 + decel_b23` and `player_load_per_min` **relative to** distance/HSR;
  and/or **small `area_per_player_m2`** (small SSG). (loadPlan mechanical = accel/decel emphasis.)
- **locomotive:** high `vel_b5 + vel_b6 + hir_total` and distance; and/or **large area/player**.
- **speed:** `max_velocity` near the player's MSS with short duration + low volume.
- **metabolic:** high distance + moderate PL/min, low sprint/accel (running/possession volume).
- **balanced:** no axis dominates; **low:** warm-up/technical (safe categories).
Return `low` confidence when GPS is absent and only area/player is used.

### Fit rule (reuse day type)
- mechanical drill on a mechanical day → `ideal`; locomotive drill on a mechanical day → `off` (heavy /
  wrong emphasis); speed drill on MD-2 → `ideal`; low/technical on MD-1 → `ideal`; etc. `mixed` day → most
  types `ok`.

## Session Builder wiring (surface)

- For **today's MD day** (from the existing MD context + `plannedSessionLoad` type), in the drill picker:
  1. **Badge each drill** with its `DrillLoadType` + a fit dot (ideal/ok/off) for today.
  2. **Sort/recommend** ideal-fit drills first; keep all drills selectable (coach owns).
  3. **Flag a mismatch** when the coach adds an `off` drill ("this is a locomotive/high-speed drill on an
     MD-4 mechanical day — expect high hamstring/HSR load").
  4. Show the day's "what's best today" line from loadPlan's existing emphasis + `lean` (reuse).
- Optional: a per-MD-day **"suggested mix"** (e.g., MD-4 = 1 mechanical SSG + 1 COD + strength; MD-3 = 1
  large-pitch locomotive + position runs) as an editable template — additive, low priority.

## Guardrails
- Pure `drillMdFit.ts`; no I/O; thresholds configurable; `low` confidence when only area/player is known.
- **Reuse** `plannedSessionLoad` (MD→type) and `loadPlan` EMPHASIS/lean — do not duplicate the microcycle
  model or the exposure classifier.
- Coach always owns the choice (recommend + flag, never block).
- **Boundary test:** fit output must not reach the readiness colour or the daily decision.

## Tests — `src/lib/micropulse/load/__tests__/drillMdFit.test.ts`
1. High accel_b23+decel_b23, small area, low HSR → `mechanical` (high confidence).
2. High vel_b5/b6 + distance, large area → `locomotive`.
3. GPS absent, small area only → `mechanical`, confidence `low`.
4. `drillFitForMdDay("locomotive","mechanical")` → `off` with a clear reason; `("mechanical","mechanical")` → `ideal`.
5. Boundary test: no readiness/decision import; no re-derivation of MD→type (imports plannedSessionLoad).

`npx eslint <changed files>` + tests; lint-clean.

## Acceptance
- [ ] `drillMdFit.ts` classifies drills into mechanical/locomotive/speed/metabolic/balanced/low from GPS
      (+ area/player fallback), with confidence.
- [ ] Fit uses the EXISTING `plannedSessionLoad` MD→type (no re-derivation); ideal/ok/off + reason + score.
- [ ] Session Builder badges + sorts + flags drills for today's MD day; "what's best today" reuses loadPlan.
- [ ] Descriptive-only boundary test passes; no duplication of loadPlan / exposure classifier; eslint + tests clean.

## Citations
Owen et al. 2017/2024; Martin-Garcia et al. 2018; Buchheit & Lacome (tactical-periodization microcycle);
Stevens 2017; Oliva-Lozano; Gaudino / Casamichana (SSG pitch size → accel/decel vs high-speed load).
Existing `loadPlan` already encodes MD-4 mechanical / MD-3 locomotive — this brief connects drills to it.
