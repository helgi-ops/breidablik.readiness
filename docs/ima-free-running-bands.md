# IMA Free Running bands: what they are (Nov 2026)

**Verdict:** the 8 IMA Free Running bands are **bout-duration bands (seconds of continuous running)**, not speed or cadence bands. That means bands 5–8 are long continuous runs of 18 s or more, not sprints.

## Evidence

The evidence comes from the probe at `/api/integrations/catapult/debug-peak-period?date=2026-10-24&fr=1`, which covered 15 athletes. Breiðablik's OpenField thresholds are 0–8–12–15–18–21–24–27–100. Dividing time in each band by the number of bouts gives the mean bout length, and for one athlete it lands inside every band's bounds:

| Band | Bounds (s) | Mean bout (s) | Mean speed (km/h) | m/stride |
|---|---|---|---|---|
| 1 | 0–8 | 3.8 | 9.7 | 1.85 |
| 2 | 8–12 | 10.1 | 11.2 | 2.08 |
| 3 | 12–15 | 13.6 | 13.1 | 2.42 |
| 4 | 15–18 | 16.6 | 13.5 | 2.48 |
| 5 | 18–21 | 19.6 | 12.6 | 2.30 |
| 6 | 21–24 | 22.1 | 14.8 | 2.63 |
| 7 | 24–27 | 25.9 | 13.1 | 2.42 |
| 8 | 27+ | 30.0 | 13.6 | 2.56 |

Three other observations point the same way:

- **Speed is flat:** mean speed and stride rate (87–93 strides/min) barely change from band 4 to band 8.
- **Band 8 is not sprinting:** that athlete covered 567 m in band 8 but only 50 m in GPS velocity band 6.
- **Team totals agree:** band 8 distance is 2.4 km and team mean speed is about 12–13 km/h in bands 4–8.

## Catapult keys (V2 algorithm)

- **`imafreerunning_bandN_total_distance` / `_total_duration` / `_total_player_load`:** distance, time and load per band. Distance needs GPS, so it is stored as null indoors.
- **`ima_v2_free_run_bandN_total_strides` / `_average_stride_rate` / `_event_count`:** strides, stride rate and number of bouts per band.
- **`ima_v1_free_run_*`:** always 0 for our org. The parameter `Average Stride Rate 1.0` is rejected and is no longer requested.

## Ingestion changes (Nov 2026)

- **Parameters:** removed the 8 rejected `Average Stride Rate 1.0` parameters.
- **Stride count:** now reads V2 `total_strides` only. It used to fall back to `event_count`, which wrote bout counts into the stride column.
- **Stride rate and event count:** V2 only, so V1 and V2 values are never mixed.
- **Days with several sessions:** distance, time and bout count are now summed across sessions. Before this change only the first session's values were kept. Stride rate is averaged weighted by time in band, and `ima_fr_raw` keeps every session's payload.
- **New helper:** `src/lib/integrations/catapult/freeRunningBands.ts` derives per-band speed, m/stride and mean bout length, checks each band's consistency, and provides plain EN/IS band labels ("Runs of 8–12 s").

## Downstream correction (Nov 2026, done)

About 85 files described bands 5–8 as sprint, high-cadence or HSR running. All of them have been corrected:

- **Sprint exposure (card, Decision Summary chip, route):** now built on GPS `sprint_distance`, falling back to `velocity_band6_total_distance`. An indoor day reads as "no sprint reading" and is never estimated from IMA. The 50/80/180% cut-points were set on stride counts and must be re-checked against a few weeks of GPS data.
- **Return to training:** `strideTop` is no longer a hamstring/calf re-injury quality.
- **Weekly volume model (periodization):** the training-to-match ranges for stride bands 6–8 came from sprint research and were removed.
- **Movement signature:** the band 5–8 component had been shown as side-to-side running; it is now labelled long continuous runs.
- **Everywhere else:** labels, tutorials, PDFs and AI prompts say "long continuous runs (≥18 s)". Tiers are short bursts (<15 s), medium runs (15–24 s) and longest runs (≥24 s). The AI prompts forbid calling these numbers sprinting.
- **Unchanged on purpose:** DB columns, API JSON keys and exported names (e.g. `sprint_strides`, `hiCadencePerMin`, `ima_hsr`) stay as they were, with comments explaining what they now hold.

## Using the bands as time bands (Nov 2026, done)

- **Long runs:** `src/lib/micropulse/longRuns/` reads bands 5–8 as what they are: `longRunsOf(row)` = number of
  runs of ≥18 s (event counts), time in them, mean run, longest band, strides, distance (GPS only, null indoors),
  stride length and stride rate (strides ÷ time). `bandsAreTimeBands(rows)` checks a club's bounds before the
  labels are trusted. "Did we do enough?" judges `longRuns` (bouts) beside the distance and strides, so an indoor
  session gets a locomotive verdict; the distance reads as missing indoors, not 0. The "Long runs" card on IMA
  Intelligence shows it per player with stride length in training as a share of the player's own match
  (Breiðablik 2026: about 77%).
- **Stride rate:** the stored per-band average is 0 for a band without a bout; weighted over all strides it read
  40–63 strides/min against 86–88 from strides ÷ time. `strideIntelligence` now computes from time in band when
  the sync has it, the view `player_stride_summary` weights over rated bands only, and the UI says strides/min,
  not Hz.
- **Decel:sprint coupling** (`get_mcburnie_decel_status`, migration 20261107110000): the denominator is GPS sprint
  efforts (`velocity_band6_total_efforts_gen2`) on outdoor days; indoor days are left out, not read as zero. The
  labels say "Decel : Sprint (GPS)" again.
- **Data:** Breiðablik's re-sync (Nov 2026) filled durations and event counts back to 2026-03-31. HK and the
  demo teams still carry only stride counts and band 5–8 distance; their sync needs the same parameters before
  bouts show for them.

## Long-run load as a Today signal (Nov 2026, done)

`long_run_load` is the 20th `coach_signals` adapter (`src/lib/micropulse/longRuns/signalLoad.ts`, derives in
`coachSignals/index.ts`, wired in `computeTeam.ts`). The measure is **time** in long continuous runs (bands 5–8,
runs of ≥18 s at ~11 km/h), acute 7 days ÷ chronic 28 days against the player's **own** base
(`computeImaRunningLoad`, rest days = 0, ≥14 run days in 28). Time comes from the inertial sensor, so the read
exists indoors too; the distance ratio on the Long runs card does not.

- **Spike:** per-player `elevated` chip at ≥1.5; 1.3–1.5 only counts toward the team cluster (≥3 → elevated,
  2 → watch). Mirrors `load_acwr`.
- **Deficit:** per-player `watch` chip at ≤0.5 when he was at training ≥2 of the 7 days, no data gap in the
  window (a session row without Free Running durations blocks it: missing data looks like little running) and
  the **squad is not itself light** (squad median ratio ≤0.6 = planned light week / off-season → one team line
  "the squad as a whole has run ×0.5 of its usual", no names). Team: ≥3 individual deficits → elevated, 2 → watch.
- **Surfaces:** Today team strip + attention-row pill (generic chip UI) and a "Running vs usual" pill in the
  Decision Summary row (`_long_run_load`, mapped from `perPlayerSignals` like `_last_session_enough`). Href
  `/coach/ima-intelligence`. Descriptive, never the readiness colour.
- **Calibration** (`scripts/validate-long-run-load-signal.ts`, real data): Breiðablik 120 days to 2026-10-24 →
  649 evaluable present player-days, strong spikes 8.6%, 1.3–1.5 climbs 9.6%, individual deficits 2.5%. HK 60
  days to 2026-11-06 (3 team days, off-season) → individual deficits 10.3%; 11 would-be deficits on one day were
  a squad-wide light week and became one team line. Demo Full 60 days → spikes 6.3%, deficits 0%.
- **Citations:** Gabbett 2016 (rolling-average ratio as a change-size descriptor), Impellizzeri 2020 (not an
  injury predictor), Buchheit & Laursen 2013 (continuous running at ~11 km/h = tempo / aerobic work, not HIIT or
  sprinting).

## Still open

- **`STRIDE_CADENCE_DROP`** compares the computed strides/min with the `stride_cadence_weighted` baseline from
  `refresh_stride_baselines()`, which lives only in the database and refreshes on its own schedule; until it has
  refreshed on the corrected view the z-score mixes scales. The tooltip's "0.5 Hz" rule was dropped from the text.
- **Other organisations:** they may have set up the bands differently in OpenField. Check
  `bandsAreTimeBands` / `deriveFreeRunningBands().boutLengthConsistent` before trusting the labels for a new club.
