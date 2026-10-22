# Individualised speed zones from a fitness test — feasibility brief

**Goal:** turn a player's endurance/sprint test results into his **own** speed thresholds — so
"high-speed running" and "sprint" are measured against *his* capacity, not one league number for
everyone — and express his match high-speed running (HSR) both in metres and as a share of his
personal capacity. This is the running counterpart of what `criticalSpeed.ts` already does for the
distance curve, and it reuses machinery we already have.

**One-line answer to the question that prompted this** ("can a fitness test estimate a player's
in-game HSR and max speed?"): **HSR — yes as *capacity* and as individualised *thresholds*, no as a
match-by-match *prediction*. Max speed — no; it is measured, never estimated from an endurance
test.** The sections below make that split precise and buildable.

---

## What we already have (don't rebuild)

- **`src/lib/micropulse/load/fitnessTests.ts`** — the test registry with honest MAS derivations:
  - `mas_vameval` → MAS directly; `mas_run_4min` → MAS = (dist/4)·0.06; `msft_beep` → MAS = 8 + 0.5·(L−1);
  - `yo_yo_ir1/ir2` → VO₂max only (no clean MAS); `ift_30_15` → VIFT (result itself); `sprint_max` → **MSS** (result).
  - Table: `player_fitness_test (player_id, team_id, test_date, test_type, result_value, mas_kmh, …)`.
- **`src/lib/micropulse/playerAnalysis/fitnessTestSignals.ts`** — already converts MAS→CS
  (`CS_FROM_MAS = 0.875`, Pettitt 2016) and VIFT→MAS-equivalent (`MAS_FROM_VIFT = 0.86`, Buchheit 2008).
- **`src/lib/micropulse/load/criticalSpeed.ts`** — fits CS/D′ from the distance power curve **and
  already computes the Anaerobic Speed Reserve**: `ASR = MSS − MAS` with %ASR anchors
  `[0, 0.25, 0.5, 0.75, 1.0]` (Sandford 2019, Buchheit 2013). So the ASR maths is done.
- **GPS max velocity is already stored**: `player_external_load_daily.max_velocity` (written by
  `catapult/sync.ts`, clamped to a credible ceiling in `catapult/normalize.ts::clampMaxVelocityKmh`).
  → a player's **season-best measured MSS** is one aggregate query away.
- **Current HSR threshold is fixed** at 19.8 km/h (Ju 2022) in the CTR/peak-window path. That number
  stays — as the *league/squad-comparable* threshold — and the individualised threshold runs
  **alongside** it, never replacing the comparable one.

So the missing piece is small: a pure lib that assembles MAS + MSS → individualised thresholds, and
a read that reclassifies a player's GPS distance into *his* zones and reports match HSR as % of his
capacity.

---

## The honest three-way split

| Question | Verdict | Why |
|---|---|---|
| Individualised HSR / sprint **thresholds** from a test | **Robust — build it** | MAS + MSS give personal zones; strong literature (Mendez-Villanueva & Buchheit 2013; Hunter 2015; Abt & Lovell 2009). |
| A player's HSR **capacity / ceiling** | **Rough — build, but label as a band** | Aerobic fitness correlates *moderately* with match high-intensity running (Krustrup 2003 r≈0.7; Rampinini 2007). A normative band, not a point value. |
| The HSR he will **actually run in a given match** | **Not possible from a test** | Match HSR is dominated by tactical role, position, game state, opposition, minutes, pacing; high between-match variability (Gregson 2010; Bradley 2013). |
| **Max speed (MSS)** | **Measured, not estimated** | Endurance tests do not predict Vmax. Use a flying max sprint or the GPS season max (both already available). |

The manifesto rule holds throughout: **descriptive conditioning context only — this never feeds the
readiness colour, the load target, or the daily decision** (same boundary as `criticalSpeed.ts` /
`peakPeriod.ts`).

---

## The algorithm

### Inputs (per player, freshest first, with provenance)

- `MAS_kmh` — from the freshest test that yields MAS (`fitnessTests.ts::deriveFitnessTest`), else
  VIFT·0.86, else CS/0.875 back-calc from the GPS distance curve. Provenance-ranked (see below).
- `MSS_kmh` — **prefer the measured value**: `max(sprint_max result, season max of
  player_external_load_daily.max_velocity)`. Test and GPS agree closely for a true flying sprint;
  take the higher of the two credible values and record which won.
- `ASR_kmh = MSS − MAS` (guarded: only when `MSS > MAS > 0`) — reuse the existing ASR routine.

### Individualised thresholds (the core output)

Two boundaries, both configurable, with defensible defaults:

- **HSR floor (high-speed running starts here):** default `= MAS`. Rationale: MAS is the classic
  aerobic/anaerobic transition boundary used to individualise the high-intensity zone (Abt & Lovell
  2009; Hunter 2015). Config option: a fraction of ASR above MAS (e.g. MAS + 0.15·ASR) for a
  stricter floor.
- **Sprint floor (sprinting starts here):** default `= MAS + 0.30·ASR` (Sandford 2019 tiering).
  Config option: an absolute (e.g. 25.2 km/h) for league comparability.

Everything is duration-free — these are speed thresholds, applied to the raw/binned GPS speed trace
or to velocity-band distances already exported (V5/V6 in the CTR).

### Outputs

1. **Individualised HSR distance / sprint distance** — reclassify a session's distance above the
   player's own floors (in addition to the fixed-19.8 number, never instead of it).
2. **Match HSR as % of capacity** — `matchHSR / capacityCeiling`, where the ceiling is the player's
   season-best individualised HSR (his own observed max), *not* a fitness-predicted number. This is
   the honest "how close to his ceiling did he run" read, mirroring the Power-Curve latest-vs-best line.
3. **A capacity band (optional, clearly labelled)** — a normative HSR-capacity range from MAS/Yo-Yo,
   shown as a wide band with its correlation caveat, never as a target.
4. **Conditioning prescription anchors** — %MAS (tempo/aerobic), %ASR (supra-threshold/sprint),
   %VIFT (HIIT) — these are already the literature-standard prescriptions and pair naturally here.

---

## Confidence & provenance ladder (surface it, per the manifesto)

- **MSS:** measured flying sprint ≈ GPS season max > single-session GPS max (needs enough exposure).
- **MAS:** direct incremental test (VAMEVAL/UMTT, 4-min, MSFT) > VIFT-shrunk (·0.86) > CS-back-calc
  (÷0.875 from the distance curve).
- Every derived threshold shows: which test, its date, and the derivation used ("MSFT L12.5 → MAS
  16.0 → HSR floor"). Stale test (> N months) drops confidence, same pattern as the readiness
  outlook confidence.

---

## Data requirements

- **Present:** `player_fitness_test` (MAS/MSS via existing derivations); `player_external_load_daily.max_velocity`
  (GPS MSS); the distance power curve (CS back-calc); CTR velocity-band distances (V5/V6) for
  reclassification; `criticalSpeed.ts` ASR routine.
- **To confirm / add:**
  - a per-player **season-max velocity** read (simple aggregate over `player_external_load_daily`);
  - if reclassifying below V5, the raw/binned speed trace is only in the CTR/efforts export — for V5/V6
    it's already there, finer zones would need the efforts export (same limit noted in
    `catapult-efforts-export-hsr-tactics-brief.md`);
  - optional `players.position` for positional capacity norms.

---

## Proposed implementation (small, pure, descriptive)

- **`src/lib/micropulse/load/speedZones.ts`** (new, pure, no I/O): `buildSpeedZones({ masKmh, mssKmh })`
  → `{ hsrFloorKmh, sprintFloorKmh, asrKmh, source, confidence }`; plus `classifyDistanceToZones(...)`
  and `matchHsrVsCapacity(...)`. Reuses `fitnessTests.ts` + the ASR helper from `criticalSpeed.ts`.
- **Read/route:** extend the existing conditioning/peak-period read to attach individualised zones and
  the %-of-capacity figure per player.
- **Surface:** on `/coach/conditioning` (energy-system layer) and as an optional line on the Power
  Curve card — "his HSR floor 16.0 km/h · sprint 24.8 km/h (from MSFT + GPS max); last match 78% of
  his HSR capacity." Behind the same explainability read (verdict → facts → confidence → details).
- **Boundary test:** a unit test asserting the zone lib output never flows into any readiness/decision
  path (mirror the `criticalSpeed` descriptive-only tests).

---

## What to tell a coach (plain language)

- "A fitness test lets MicroPulse set *your* high-speed and sprint lines instead of one number for
  the whole league, and show each match's high-speed running as a share of your own ceiling."
- "It estimates your *capacity* — how much high-speed running you're built for — not how much you'll
  do in a specific game; that depends on tactics and role."
- "Top speed isn't guessed from a fitness test — it's measured from a max sprint or your fastest GPS
  reading, both of which the system already keeps."

---

## Citations

- Mendez-Villanueva & Buchheit 2013; Buchheit & Mendez-Villanueva 2013 — anaerobic speed reserve,
  individualised supra-MAS running.
- Sandford et al. 2019 — ASR tiering / %ASR anchors.
- Abt & Lovell 2009; Hunter et al. 2015 — individualised speed thresholds vs fixed.
- Krustrup et al. 2003; Rampinini et al. 2007; Bangsbo, Iaia & Krustrup 2008 — aerobic fitness ↔
  match high-intensity running (capacity, moderate correlation).
- Gregson et al. 2010; Bradley et al. 2013 — high between-match variability of high-speed running
  (why match output isn't predictable from a test).
- Pettitt 2016 — CS ↔ MAS; Buchheit 2008 — 30-15 IFT / VIFT.

**Status:** feasibility only. Most inputs already exist (`fitnessTests.ts`, ASR in
`criticalSpeed.ts`, GPS `max_velocity`); the new work is one pure `speedZones.ts` lib + a descriptive
surface. No readiness/decision coupling.
