# Claude Code brief — fitness retest trend (is his engine rising or falling?)

Goal: turn the fitness-test HISTORY MicroPulse already stores into a **trend** — is a player's MAS /
CS / VO₂ (per test type) rising or falling across retests — with an honest "meaningful change vs test
noise" flag and a sparkline. **Descriptive monitoring only** — never touches the readiness colour, the
load target, or the daily decision.

## What exists (reuse — the data + fetch are already there)

- **`player_fitness_test`** (`20260817180000`): `player_id, team_id, test_date, test_type,
  result_value, result_unit, stage, time_s, distance_m, mas_kmh, vo2max_est, source, notes`,
  `unique(player_id, test_date, test_type, source)`.
- **`/api/coach/fitness-test?player=<id>` GET** already returns the **full history, newest-first, all
  types**. `FitnessTestCard` already renders that history.
- `fitnessTests.ts` (`FITNESS_TESTS`, `deriveFitnessTest`) — the test registry + MAS/VO₂ derivations.

So this is a **pure computation over data already fetched** + a small read on the card. No new table, no
new fetch.

## The honest rules (bake into the copy)

- **Compare like with like.** Trend **within a single `test_type`** as the primary read (a Yo-Yo
  distance and a VAMEVAL MAS are not the same scale). Offer a **secondary MAS trend** across the
  MAS-yielding tests (`mas_vameval`, `mas_run_4min`, `msft_beep`, and VIFT→MAS) **only with a visible
  "different protocols — indicative" caveat**.
- **Meaningful vs noise.** Only flag a change beyond the test's typical error. Default **SWC ≈ ±3%** for
  MAS/CS, **±5%** for Yo-Yo distance (field-test reliability). A change inside the band = "stable
  (within test error)", not up/down. Make the threshold a named constant.
- **Interpretation is open.** A drop can mean detraining, incomplete illness/injury recovery, fatigue,
  OR measurement error — present it as "worth a retest / worth investigating", never a verdict.
- **Need ≥ 2 comparable tests.** One test → "baseline only, retest to trend."

## New pure lib — `src/lib/micropulse/load/fitnessTrend.ts` (no I/O)

```ts
import type { Bi } from "./peakPeriod";
export const SWC_MAS_PCT = 3;      // smallest worthwhile change, MAS/CS
export const SWC_FIELD_PCT = 5;    // Yo-Yo / beep distance
export type TrendDir = "up" | "down" | "stable" | "insufficient";

export interface FitnessTrendPoint { date: string; value: number; unit: string; testType: string; derivedMas?: number | null }
export interface FitnessTrendRead {
  metricLabel: Bi;                 // "MAS", "Yo-Yo IR1 distance", …
  points: FitnessTrendPoint[];     // oldest→newest, one test_type (or MAS-across-tests)
  latest: number | null; previous: number | null;
  deltaPct: number | null;         // latest vs previous
  seasonDeltaPct: number | null;   // latest vs first in window
  dir: TrendDir;                   // vs the SWC band
  swcPct: number;
  verdict: Bi;                     // "MAS 16.4→15.8 km/h over 3 tests since May (−3.7%) — retest to confirm"
  caveat: Bi;                      // like-with-like + open interpretation + descriptive
}

// Primary: trend within one test_type. Secondary: MAS across MAS-yielding tests (flagged).
export function buildFitnessTrends(history: Array<{
  test_date: string; test_type: string; result_value: number | null; result_unit: string | null; mas_kmh: number | null; vo2max_est: number | null;
}>): { byTestType: FitnessTrendRead[]; masAcross: FitnessTrendRead | null };
```

- `dir`: `deltaPct > +swc` → up; `< −swc` → down; else stable; `<2 points` → insufficient.
- Round, guard divide-by-zero, drop non-finite. Newest-first input → sort oldest→newest inside.
- `masAcross` uses `mas_kmh` where present, carries the "different protocols — indicative" caveat.

## Surface — a "Trend" strip on `FitnessTestCard` (and/or `CriticalSpeedCard`)

Layered read: (0) one-line verdict for the primary metric ("Engine stable — MAS within test error over
3 tests"); (1) latest ± delta% + a small **sparkline** of the values over dates; (2) the per-test-type
table + the SWC note + citation behind "Show details". Colour-neutral (this is monitoring, not a
verdict): use the existing dot/label style, and label a drop "investigate", not "bad".

## Guardrails
- Pure lib, no I/O; deterministic. `insufficient`/null with an honest empty state — never invent a trend.
- Boundary test: no readiness/decision import.

## Tests — `src/lib/micropulse/load/__tests__/fitnessTrend.test.ts`
1. 3 VAMEVAL MAS 16.4→16.1→15.8 → `down`, seasonDeltaPct ≈ −3.7%, dir down (beyond 3% SWC).
2. MAS 16.0→16.3 (+1.9%) → `stable` (inside SWC).
3. One test → `insufficient`, "baseline only".
4. Mixed test types → `byTestType` groups separately; `masAcross` set with the indicative caveat.
5. Yo-Yo distance uses `SWC_FIELD_PCT` (5%).
6. Boundary test: no readiness/decision import.

`npx eslint` + the new test; lint-clean.

## Acceptance
- [ ] Trend per test_type + optional MAS-across (flagged); SWC band; ≥2-test rule.
- [ ] Sparkline + neutral one-line verdict on the card; open-interpretation caveat visible.
- [ ] Descriptive-only boundary test passes; eslint + tests clean.

## Citations
Field-test reliability / SWC: Buchheit 2014 (30-15 IFT reliability), Bangsbo 2008 (Yo-Yo). Descriptive-
monitoring framing per the manifesto.
