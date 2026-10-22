# Claude Code brief — "does he meet his position's physical requirements?" (from fitness tests)

Goal: take a player's endurance/sprint test results (MAS, MSS, ASR, Critical Speed) and tell the coach,
per quality, whether he **meets the physical requirements of his playing position** — with a **squad/
league-relative pass/fail** and an **elite (literature) reference shown alongside** as an aspiration.
One-line verdict + per-quality "meets / below / above" + the gap. **Descriptive scouting/development
context only — it never touches the readiness colour, the load target, or the daily decision** (same
rule as `roleDemandFit.ts`).

Read first: `docs/tasks/individualised-speed-zones-claude-code-brief.md` (MAS/MSS/ASR + `speedZones.ts`)
and skim `src/lib/micropulse/roleDemandFit.ts` (the fusion engine this extends).

## Scope decision (settled with the founder)

Requirement source = **blend**: the **pass/fail** is squad/league-relative (a player "meets" a quality
when he is at/above a position-percentile floor); the **elite literature value** is shown next to it as
a reference, not as the pass/fail. Rationale: absolute elite norms are too high for the level and would
fail everyone; relative keeps it honest for an Icelandic squad, elite gives the aspiration.

## Honest boundary (must be in the card copy)

- This is **physical capacity vs the position's physical demands** — necessary, not sufficient. It does
  NOT say the player is tactically/technically right for the position. Copy: "meets the physical
  requirements", never "is right for the position".
- **Capacity ≠ match output.** Pair it with the existing RoleDemandFit Output read so "has the engine
  but doesn't produce it" is visible.
- Small Icelandic squads → few peers per position (`MIN_POSITION_POOL = 4`). When the pool is too small
  the pass/fail falls back to **squad**-relative (label it), and the **elite reference becomes the more
  meaningful anchor**. Confidence must reflect pool size + test freshness.

## REUSE — do not rebuild

- **`src/lib/micropulse/roleModel.ts`** — `resolveRoleFit(juGroup, subRole)` → `{ subRole, demand }`
  where `demand.weights: Partial<Record<QualityId, number>>` is **which physical qualities the position
  demands, and how much** (cited to papers). This is the list of requirements per position — use it.
- **`src/lib/micropulse/playerAnalysis/athleteProfile.ts`** — `AthleteProfile`, `QualityId`,
  `QUALITY_BY_ID`, per-quality **position percentile** (`benchmark: "position" | "squad"`),
  `MIN_POSITION_POOL = 4`, `STRENGTH_PCTL = 70`. The position percentile IS the relative pass/fail input.
- **`src/lib/micropulse/positionStyle.ts`** — `juPositionGroup(position)` → `JuGroup`, `JU_GROUP_LABEL`.
- **Fitness-test capacity:** `fitnessTests.ts` (MAS/MSS), `speedZones.ts` (MAS/MSS/ASR + floors),
  `criticalSpeed.ts` `computeAnaerobicSpeedReserve` (ASR) and CS/D′. `fitnessTestSignals.ts` already
  feeds `aerobic_endurance` into the profile — extend the same way for the other test qualities.

First task: confirm the fitness-derived qualities exist as `QualityId`s and are populated from tests:
`aerobic_endurance` (MAS/CS — exists), plus **top speed (MSS)**, **sprint reserve (ASR)**, **HSR
capacity**. Where one is missing, add it to the profile via the same signal-injection pattern as
`fitnessTestSignals.ts` (GPS-measured preferred, test-derived as fallback), so the position percentile
is computed for it.

## The model

For the player's position `juGroup` and its demanded qualities `weights`:

For each demanded quality `q` (weight `w`):
- `playerPctl` = the player's position percentile for `q` (from `AthleteProfile`; squad-fallback flagged).
- **meets** = `playerPctl >= MEETS_PCTL` (new constant, default **40**). Bands: `>= STRENGTH_PCTL (70)` →
  "above / strength"; `MEETS_PCTL..70` → "meets"; `< MEETS_PCTL` → "below".
- `eliteRef` = the literature value for `(juGroup, q)` from the ELITE_REFERENCE table below (null if none).
- `gapToMeet` = how far below the floor he sits, expressed in the quality's own unit where possible
  (e.g. km/h for MAS/MSS) via `speedZones`/`fitnessTests` values, else in percentile points.
- `gapToElite` = `eliteRef − playerValue` in the quality's unit (when both known).

Headline: `meets = count(meets) ; total = demanded qualities with data` →
"Meets his position's physical requirements on {meets}/{total} — below on {weakest demanded quality}."
Order the rows by demand weight (highest first), like `roleDemandFit`'s `demand[]`.

Confidence: `high` when position pool ≥ MIN_POSITION_POOL AND a fresh direct MAS + measured MSS exist;
`low` when squad-fallback or VIFT/CS-backcalc MAS or stale tests; else `moderate`.

## ELITE_REFERENCE table (provisional — S&C to tune; cite in the card)

Starter values, elite men's football, **approximate ranges to confirm**, not gospel. Store as
`Partial<Record<JuGroup, Partial<Record<QualityId, { value: number; unit: string }>>>>`.

| JuGroup | MSS (km/h) | MAS (km/h) | ASR (km/h) | notes |
|---|---|---|---|---|
| FB (full-/wing-back) | ~33–34 | ~16.5–17.5 | large | highest HSR + sprint demand (Di Salvo 2007) |
| Winger/AM | ~33–34 | ~16.5 | large | top sprint/MSS, vertical threat |
| CF (forward) | ~32–33 | ~16 | large | sprint + max speed |
| CM | ~31–32 | ~17–18 | moderate | highest aerobic/volume demand (Bradley 2009) |
| CB | ~31–32 | ~16 | smaller | least HSR/sprint |

Cite: Di Salvo et al. 2007/2009 (positional match running); Bradley et al. 2009; Bush et al. 2015
(evolution of demands); positional MAS/MSS norms (Slimani & Nikolaidis 2019; Buchheit ASR work). Mark
every stored number `provisional: true` and surface a "reference, tune per level" note.

## New files

### NEW `src/lib/micropulse/positionFitnessRequirements.ts` (pure, no I/O)

```ts
import type { Bi, Confidence } from "@/lib/micropulse/load/peakPeriod";
import type { QualityId, AthleteProfile } from "@/lib/micropulse/playerAnalysis/athleteProfile";
import type { JuGroup } from "@/lib/micropulse/positionStyle";

export const MEETS_PCTL = 40;

export type RequirementBand = "above" | "meets" | "below" | "unknown";
export interface RequirementRow {
  quality: QualityId; label: Bi; weight: number;         // demand weight (from roleModel)
  playerPctl: number | null; band: RequirementBand;
  playerValue: number | null; unit: string | null;       // km/h etc. when a fitness value exists
  eliteRef: number | null; eliteProvisional: boolean;
  gapToMeetPctl: number | null;                          // points below MEETS_PCTL (0 if meets)
  gapToElite: number | null;                             // eliteRef − playerValue, quality unit
  benchmark: "position" | "squad";                       // which pool the percentile used
}
export interface PositionFitnessRead {
  playerId: string; name: string; juGroup: JuGroup | null; roleLabel: Bi;
  scored: boolean; verdict: Bi;                          // "meets 4/5 …"
  metCount: number; total: number;
  rows: RequirementRow[];                                // demand-weighted order
  confidence: Confidence; citation: string; caveat: Bi;  // physical-only boundary text
}

export function buildPositionFitnessRequirements(input: {
  playerId: string; name: string; position: string | null; subRole?: string | null;
  profile: AthleteProfile | null;
  fitnessValues: Partial<Record<QualityId, { value: number; unit: string }>>; // MAS/MSS/ASR from tests
}): PositionFitnessRead;
```

- GK / unknown / basketball → `scored: false` with an honest out-of-scope verdict (mirror
  `roleDemandFit`'s handling).
- Use `resolveRoleFit(juGroup, subRole).demand.weights` for the demanded qualities + weights.
- `caveat` states: physical capacity vs the position's physical demands; pass/fail is squad/league-
  relative, elite value is a reference; never touches readiness.

### NEW server read (I/O) — extend the RoleDemandFit route or add `positionFitnessData.ts`

Assemble `profile` (existing loader), `juGroup`, and `fitnessValues` from `fitnessTests` +
`speedZones` (`buildSpeedZones`) + `computeAnaerobicSpeedReserve`, then call
`buildPositionFitnessRequirements`. Prefer measured MSS (GPS season max) over test where both exist.

### Surface

Add a "Position fitness requirements" section to `RoleDemandFitCard` (it already owns the role-demand
context), below the Engine/Driver/Output tiles, behind the standard read:
- (0) verdict "Meets 4/5 physical requirements for FB — below on aerobic engine";
- (1) per-quality rows: quality · meets/below/above dot · his value · "vs squad floor" · "vs elite {ref}";
- (2) the demand-weight table + citations + the provisional-elite note behind "Show details".
Reuse the card's EN/IS + confidence pill. Keep the fixed-19.8 and squad-fallback labels honest.

## Guardrails

- Pure lib: no I/O in `positionFitnessRequirements.ts`.
- `unknown` band when a quality has no percentile/value — never invent a pass.
- Boundary test: the output must not reach any readiness/decision path.
- Squad-fallback and provisional-elite must be visibly labelled, not silent.

## Tests — `src/lib/micropulse/__tests__/positionFitnessRequirements.test.ts`

1. FB with MSS/ASR percentiles ≥ 40 and aerobic 30 → "meets 2/3, below on aerobic"; weakest = aerobic.
2. `MEETS_PCTL` boundary: pctl 40 → meets; 39 → below.
3. Elite gap: player MSS 31.0, eliteRef 33.5 → gapToElite 2.5 km/h, `eliteProvisional: true`.
4. Small pool → `benchmark: "squad"` on the rows and confidence not `high`.
5. GK / basketball → `scored: false`, honest verdict.
6. Boundary test: no readiness/decision import.

Run `npx eslint <changed files>` + the new test; keep new code lint-clean (CLAUDE.md).

## Acceptance checklist

- [ ] Fitness-test qualities (aerobic/MAS, MSS, ASR, HSR) exist as profile qualities, test-fed.
- [ ] Pure `positionFitnessRequirements.ts` reuses `roleModel` weights + `athleteProfile` percentiles;
      no re-implementation of demand weights.
- [ ] Per-quality meets/below/above vs the MEETS_PCTL floor, with elite reference + both gaps.
- [ ] Headline "meets N/M", demand-weighted order, confidence reflects pool + freshness.
- [ ] Card copy carries the physical-only boundary; squad-fallback + provisional-elite labelled.
- [ ] Tests pass; boundary test proves no readiness coupling; eslint clean.
- [ ] Any DB migration (if a new quality column/view is added) saved under `supabase/migrations/`.

## Citations

Di Salvo et al. 2007/2009; Bradley et al. 2009; Bush et al. 2015 (positional match demands);
Slimani & Nikolaidis 2019 (positional MAS/MSS); Buchheit & Mendez-Villanueva 2013, Sandford 2019 (ASR);
Pettitt 2016 (CS↔MAS). roleModel.ts already cites the per-position demand weights.
