# Claude Code brief — individualised speed zones from a fitness test

Goal: give each player his **own** high-speed-running (HSR) and sprint thresholds, derived from his
MAS (any endurance test) + MSS (max sprint / GPS top speed), and report match HSR both in metres and
as **% of his personal capacity**. This is the running counterpart of `criticalSpeed.ts`. It is
**descriptive conditioning context only** and must NEVER feed the readiness colour, the load target,
or the daily decision (same rule as `peakPeriod.ts` / `criticalSpeed.ts`).

Read first: `docs/tasks/individualised-speed-zones-from-fitness-test-feasibility-brief.md` (settles
the honest scope — thresholds/capacity = yes, match-output prediction = no, max speed = measured not
estimated).

## REUSE — do not rebuild

The hard maths already exists in `src/lib/micropulse/load/criticalSpeed.ts`:

- **`computeAnaerobicSpeedReserve({ masKmh, mssKmh, squadAsr? }) → AnaerobicSpeedReserveRead | null`**
  — returns `{ masKmh, mssKmh, asrKmh, anchors: AsrAnchor[], percentile, profile, verdict, citation,
  caveat }`, where `anchors` are %ASR speeds at `[0, .25, .5, .75, 1.0]`. Returns `null` unless
  `MSS > MAS > 0`. **Use this for the ASR + validation.** Do not recompute ASR.
- MAS derivations: `src/lib/micropulse/load/fitnessTests.ts` → `deriveFitnessTest(type, result)`
  returns `{ masKmh, vo2maxEst }`.
- Field-test CS↔MAS constants live in `fitnessTestSignals.ts` (`CS_FROM_MAS = 0.875`,
  `MAS_FROM_VIFT = 0.86`) — reuse if you need a MAS fallback from CS or VIFT.
- Types `Bi`, `Confidence` from `src/lib/micropulse/load/peakPeriod.ts`.

Existing data (no new table needed):

- `player_fitness_test (player_id, team_id, test_date, test_type, result_value, mas_kmh)` — MAS + MSS
  (`test_type='sprint_max'` → `result_value` is MSS km/h).
- `player_running_test (player_id, team_id, test_date, distance_m, speed_m_per_min, …)` — 4-min max
  run → `MAS_kmh = speed_m_per_min * 0.06`.
- `player_external_load_daily.max_velocity` (km/h, clamped in `catapult/normalize.ts`) → season-best
  GPS MSS.

## The model

Given a player's `MAS_kmh` and `MSS_kmh`, `ASR = MSS − MAS`, then:

- **HSR floor** (high-speed running starts here): default `= MAS`. Config: `MAS + hsrPctAsr·ASR`
  (default `hsrPctAsr = 0`).
- **Sprint floor** (sprinting starts here): default `= MAS + 0.30·ASR` (`sprintPctAsr = 0.30`,
  Sandford 2019 tiering).

Compute the floors directly (`mas + pct*asr`) — do NOT snap to the 5 discrete `anchors` (0.30 isn't
one of them). Use `computeAnaerobicSpeedReserve` for the `asrKmh` value and its `null`-guard.

Worked sanity check: MAS 16.0, MSS 32.0 → ASR 16.0 → HSR floor 16.0 km/h, sprint floor
16.0 + 0.30·16.0 = **20.8 km/h**. (For a slower engine MAS 14.0 / MSS 30.0 → ASR 16.0 → sprint floor
18.8 km/h — the same league sprint line of 25.2 would misclassify both.)

## Files

### NEW `src/lib/micropulse/load/speedZones.ts` (pure, no I/O)

```ts
import type { Bi, Confidence } from "./peakPeriod";
import { computeAnaerobicSpeedReserve } from "./criticalSpeed";

export type MasSource = "vameval" | "msft" | "run_4min" | "vift_shrunk" | "cs_backcalc";
export type MssSource = "sprint_test" | "gps_season_max";

export interface SpeedZones {
  masKmh: number; mssKmh: number; asrKmh: number;
  hsrFloorKmh: number; sprintFloorKmh: number;
  hsrFloorMPerMin: number; sprintFloorMPerMin: number;   // × / 0.06 helpers for band maths
  masSource: MasSource; mssSource: MssSource;
  confidence: Confidence;   // measured MSS + direct MAS = high; VIFT/CS-backcalc or 1-session GPS max = low
  citation: string; caveat: Bi;
}

export function buildSpeedZones(opts: {
  masKmh: number | null | undefined; masSource: MasSource;
  mssKmh: number | null | undefined; mssSource: MssSource;
  hsrPctAsr?: number;   // default 0
  sprintPctAsr?: number; // default 0.30
  squadAsr?: Array<number | null>;
}): SpeedZones | null;
```

- Return `null` when `computeAnaerobicSpeedReserve` returns `null` (MSS ≤ MAS or missing).
- `confidence`: `high` when `mssSource==='sprint_test'` (or GPS max backed by ≥ N sessions) AND
  `masSource ∈ {vameval, msft, run_4min}`; `low` when `masSource ∈ {vift_shrunk, cs_backcalc}` or MSS
  from a single session; else `medium`.
- `caveat` (Bi) must state: individualised thresholds from MAS+MSS; MSS measured not estimated;
  descriptive, never touches readiness. Cite Sandford 2019 · Mendez-Villanueva & Buchheit 2013 ·
  Abt & Lovell 2009 · Hunter 2015.

Also in this file (pure):

```ts
// Reclassify exported velocity-band distances into the player's OWN zones.
// Honest: only counts a band toward a zone when the band's LOWER edge ≥ the zone floor.
// (V5 lower edge and V6 lower edge come from the club's Catapult band config.)
export function classifyBandsToZones(
  bands: Array<{ lowerEdgeKmh: number; distanceM: number }>,
  zones: SpeedZones,
): { individualisedHsrM: number; individualisedSprintM: number; note: Bi };

// Match HSR as a share of the player's own ceiling (his season-best individualised HSR).
export function matchHsrVsCapacity(opts: {
  matchHsrM: number | null | undefined; seasonBestHsrM: number | null | undefined;
}): { pct: number | null };
```

### NEW `src/lib/micropulse/load/speedZonesData.ts` (server reads, I/O)

- `resolveMas(teamId) : Map<playerId, { masKmh, source: MasSource, date }>` — freshest of:
  `player_fitness_test` MAS (via `mas_kmh` or `deriveFitnessTest`), then `player_running_test`
  (`speed_m_per_min*0.06`), then VIFT·0.86, then CS-backcalc (`CS/0.875` from the distance curve).
- `resolveMss(teamId) : Map<playerId, { mssKmh, source: MssSource, date }>` —
  `max(freshest sprint_max result, season max of player_external_load_daily.max_velocity)`, record
  which won.
- `loadSpeedZones(teamId) : Map<playerId, SpeedZones>` — join the two, call `buildSpeedZones`, pass
  `squadAsr` (all players' ASR) for the percentile.

### EDIT the conditioning read/route

- Attach `SpeedZones` + the %-of-capacity figure per player to the existing conditioning read
  (`/api/coach/load/...` used by `/coach/conditioning` and the `CriticalSpeedCard` neighbourhood).
- Surface one line on the card, behind the standard read (verdict → facts → confidence → details):
  e.g. *"HSR line 16.0 km/h · sprint 20.8 km/h (MSFT L12.5 + GPS max 32.0) — last match 78% of his
  HSR capacity."* Show the source + confidence chip. Keep the fixed 19.8 km/h number visible too as
  the league-comparable threshold.

## Guardrails

- Pure libs: no I/O in `speedZones.ts`; all fetching in `speedZonesData.ts`.
- `null`/empty when MAS missing or MSS ≤ MAS — render "needs a max sprint + an endurance test", never
  a fabricated zone.
- Never estimate MSS from an endurance test. MSS is measured only (`sprint_max` or GPS max).
- **Boundary:** the output must not reach any readiness/decision code path.

## Tests

`src/lib/micropulse/load/__tests__/speedZones.test.ts`:

1. `buildSpeedZones` MAS 16 / MSS 32 → asr 16, hsrFloor 16.0, sprintFloor 20.8; confidence high with
   `vameval` + `sprint_test`.
2. `sprintPctAsr` override 0.50 → sprintFloor 24.0.
3. Returns `null` when MSS ≤ MAS (e.g. MAS 20 / MSS 19).
4. Confidence low when `masSource='vift_shrunk'` or `mssSource='gps_season_max'` single session.
5. `classifyBandsToZones`: a band whose lower edge < hsrFloor contributes 0; a band ≥ sprintFloor
   counts to both HSR and sprint per the rule; assert the `note` explains partial coverage.
6. `matchHsrVsCapacity`: 300/400 → 75%; null seasonBest → null.
7. **Boundary test:** importing `speedZones.ts` pulls in nothing from the decision/readiness modules
   (mirror the descriptive-only assertion used for `criticalSpeed`).

Run: `npx eslint <changed files>` and the new test file; keep new code lint-clean (CLAUDE.md).

## Acceptance checklist

- [ ] `speedZones.ts` pure; reuses `computeAnaerobicSpeedReserve`; no ASR re-implementation.
- [ ] `speedZonesData.ts` resolves MAS + MSS with provenance ranking; MSS never from an endurance test.
- [ ] Conditioning surface shows individualised HSR/sprint floors + %-of-capacity + confidence, with
      the fixed 19.8 km/h still shown for comparability.
- [ ] Nulls handled (no MAS, MSS ≤ MAS) with an honest empty state.
- [ ] All tests pass; boundary test proves no readiness coupling; eslint clean.
- [ ] Any DB migration (if a season-max view is added) saved under `supabase/migrations/` (CLAUDE.md).

## Citations

Sandford 2019; Buchheit & Mendez-Villanueva 2013; Abt & Lovell 2009; Hunter et al. 2015 (individualised
thresholds / %ASR); Krustrup 2003, Rampinini 2007 (aerobic ↔ match HIR, capacity); Gregson 2010,
Bradley 2013 (match HSR variability — why output isn't predicted); Pettitt 2016 (CS↔MAS); Buchheit 2008
(30-15 IFT).
