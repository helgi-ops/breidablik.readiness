# Connecting HSR to tactics — the sprint/effort-export path (preparation brief)

**Goal:** give high-speed running (HSR) the same tactical alignment that distance / Player Load
already have in the peak-context fusion (`/coach/load-intelligence-hub?tab=powerCurve` →
"Peak-context — Wyscout events"), so a coach can read *what was happening tactically when a player
did his high-speed running*, not just how much.

## Why HSR isn't tactically aligned today (the honest blocker)

The fusion aligns each physical peak window to time-stamped Wyscout events using an in-match clock
(`player_peak_window.window_start_s_from_ko`). Only the **MII peak windows carry that clock**, and
OpenField computes MII intervals for **Distance and Player Load only** — never HSR. So:

- HSR peak windows (1/3/5-min fixed bins from the CTR feed) have **no `window_start_s_from_ko`**
  (verified: 0 of 36 HSR rows on 2026-08-24 carry a clock; the 72 clocked rows are all
  distance/Player-Load and carry no `hsr_m`).
- Therefore an HSR peak window can't be placed on the match timeline → can't be matched to events.
- Faking a clock (e.g. borrowing the peak-distance window's time) would misattribute HSR to a
  minute it didn't happen in. **Not acceptable** (never faked).

## Fidelity ladder (increasing tactical resolution)

1. **Per-half HSR × team phase — SHIPPED (interim).** The CTR carries HSR per period, so H1/H2 HSR
   is real. Paired with the team's per-half tactical phase (from the team-events XML) it gives a
   coarse but honest tie ("his HSR faded −21% in H2, when the team was mostly defending"). Half-level,
   not per-window. See `WyscoutFusionUpload` (`hsrByHalf` + `halfContext`).
2. **Sprint/effort export with timestamps — THIS BRIEF (the real bridge).** Each high-speed effort
   carries its own start time → align every sprint to the exact Wyscout event around it. Per-EFFORT
   resolution; needs only enabling the OpenField efforts report (NOT raw 10 Hz).
3. **Raw GPS / a peak-HIR MII interval — future.** True rolling-max HSR window + clock → drops
   straight into the existing window-level fusion beside distance/PL. Needs a higher feed the club
   doesn't have.

## What feed #2 needs (the ask to the club / OpenField)

An OpenField **efforts / velocity-effort export** (per-athlete, per-effort rows), typically available
as a Bulk or Activity export alongside the CTR. Required fields per effort:

- athlete name (matched via `catapult_athlete_map`, like the CTR ingest),
- effort **start time** (session-clock seconds, or a timestamp we can convert to kickoff-relative),
- effort duration / end,
- band / classification (so we keep only ≥ HSR threshold, Ju 19.8 km/h) — or a max-velocity per
  effort we can threshold,
- distance and/or max velocity of the effort.

If OpenField exposes only a "sprint count" summary with no per-effort timestamp, #2 is not possible
and we stay on #1 until #3.

## Implementation sketch (when the export is available)

- **Parser** `src/lib/micropulse/load/parseCatapultEfforts.ts` (pure): matrix → `EffortRow[]`
  `{ athlete, startSec, endSec, maxKmh, distanceM, band }`. Gate to the HSR threshold (reuse the
  CTR's `HSR_STD_KMH` / coach-confirmed edge; never mislabel when the band edge differs).
- **Table** `player_hsr_effort` (long): `player_id, team_id, match_date, source 'catapult_efforts',
  effort_idx, start_s_from_ko, duration_s, max_kmh, distance_m`. Unique on
  `(player_id, match_date, source, effort_idx)`. Save the migration under `supabase/migrations/`.
- **Ingest route** `POST /api/coach/load/hsr-efforts/upload` (coach-auth, preview→commit), mirroring
  the CTR peak-window uploader; needs the same kickoff-offset input to fill `start_s_from_ko`.
- **Fusion** in `peak-context/upload`: for each effort compute `startSec`/`endSec` in Wyscout
  play-time (same H1 exact / H2 −half-time-gap rule as the peak windows), then reuse
  `labelsInWindow(teamInstances, startSec, endSec)` + `computePeakPeriodContext` to attach the
  player's on-ball actions and the team phase around each sprint. Store per player as
  `hsrEfforts: [{ startSec, maxKmh, distanceM, story, teamLabels }]`.
- **UI** `WyscoutFusionUpload`: replace the "not tactically aligned" caveat with per-sprint story
  rows ("top-speed run 71:12 — a run in behind on a through-ball") once `hsrEfforts` is present;
  keep the per-half read as the fallback when no efforts feed exists.

## Boundaries (unchanged)

Descriptive load × tactical context — never the readiness colour, never the daily decision. Second-
half alignment stays flagged "approx" (half-time gap subtracted). HSR threshold recorded per account
(Ju 19.8 km/h), bands never relabelled when the account edge differs. Athlete matching via
`catapult_athlete_map` with the roster-name fallback.
