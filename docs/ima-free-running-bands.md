# IMA Free Running bands: what they are (Nov 2026)

**Verdict:** the 8 IMA Free Running bands are **bout-duration bands (seconds of continuous running)**, not speed or cadence bands. That means bands 5–8 are long continuous runs of 18 s or more, not sprints.

## Confirmed by Catapult (Nov 2026)

Catapult support confirmed the following in writing. IMA Free Running (also called "Cadence") is a detection algorithm that looks for a consistent time between peaks in PlayerLoad. Running efforts are then broken down into **effort-length bands in terms of duration (seconds)**. Their example: "x free running efforts less than 2.5 s (band 1)".

According to Catapult's support guide, cadence is computed from the vertical accelerometer as strides per minute. A frequency analysis finds the largest peaks, and the time between them is converted to cadence. The guide lists these outputs: number of events, time (s and %) spent free running, average stride rate, and event count across time intervals ("whether the free running events are generally short or longer in duration").

The guide says strides/sec, but our data (~84–93) shows stride rate is returned in strides per **minute**.

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

## Long-run load as a Today signal (Nov 2026; OFF since 10 Nov 2026)

**Off on Today** (`LONG_RUN_LOAD_ON_TODAY = false` in `signalLoad.ts`; the loader hands the derive an empty list,
so no team chip and no Decision Summary pill). Replay, Breiðablik 150 days to 2026-10-31, share of present
player-days:

| Measure | Ratio p10 · p50 · p90 | Spike ≥1.5 | Deficit ≤0.5 |
|---|---|---|---|
| All long-run time (what shipped) | 0.62 · 0.98 · 1.41 | 7.6% | 4.6% |
| Long-run time at match pace | 0.00 · 0.89 · 2.15 | 25.2% | 18.5% |
| … with a 30 s/day floor on the usual | | 22.4% | 15.0% |

All long-run time is steady only because jogs fill it, and its biggest days were jog days (5 Jul 2026). At match pace
almost all the time comes from matches, so the 7 ÷ 28-day ratio follows whether he played the last match in full,
which the coach already knows from minutes. Neither is a chip a coach should act on. The code stays (match-pace
measure, `basis` "matchPace" / "all", presence-based confidence) and the script replays it
(`--measure all|matchPace`, `--min-chronic`). The text below describes the chip as it was.


`long_run_load` is the 20th `coach_signals` adapter (`src/lib/micropulse/longRuns/signalLoad.ts`, derives in
`coachSignals/index.ts`, wired in `computeTeam.ts`). The measure is **time** in long continuous runs (bands 5–8,
runs of ≥18 s; at match pace since 10 Nov 2026, see "Pace: match pace vs jog"), acute 7 days ÷ chronic 28 days against the player's **own** base
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

## Band edges change: config per team and date (9 Nov 2026)

On Catapult's advice, Breiðablik changed its OpenField IMA Free Running edges on 9 Nov 2026:

- **Before:** 0-8-12-15-18-21-24-27-100 s.
- **After:** 0-2.5-5-8-12-18-24-30-1000 s. The bottom bands match Catapult's default 0-2.5 / 2.5-5 / 5+.

Catapult classifies bands **at processing time**. A stats query for 24 Oct, run after the change, still returned the old bands. That means the band number means different run lengths before and after the change.

How MicroPulse handles it:

- **`team_fr_band_config`** stores the edges per team with an `effective_from` date. Breiðablik's legacy edges apply from 2026-01-01 and the new ones from 2026-11-09. Since migration 20261109190000 this table is only the fallback; each row's own data decides first (see below). Teams without a row (HK, demos) get the legacy edges.
- **`player_external_load_daily.ima_fr_band_bounds`** holds the edges each row was classified with.
- **Tier columns `ima_fr_ge18_*` and `ima_fr_ge24_*`** count efforts of ≥18 s and ≥24 s. They are config-independent because 18 s and 24 s are edges in both configs. They are filled for all history.
- **`ima_fr_band58_total_distance`** still means "metres in runs ≥18 s".
- **Trigger `trg_ima_fr_fill_tiers`** stamps the bounds and computes the tiers on every write, whether from sync, CSV, manual entry or seeds.

The edges common to both configs are 0, 8, 12, 18 and 24 s, so readers use run-length ranges built from those:

| Range | Use |
|---|---|
| < 12 s | short bursts |
| 12–24 s | medium runs |
| ≥ 18 s | long runs |
| ≥ 24 s | longest runs |

Per-band readers go through `boundsOfRow`, `bandsBetween` and `sumBandsBetween` in `freeRunningBands.ts`. They never sum a band number across rows that were classified with different edges.

Re-check these after a few weeks of new data:

- the weekly-load stride tiles (now 12–18 / 18–24 / ≥24 s), their planned-volume exponents and their re-entry floors;
- the "tactical day" cut-off on IMA day profiles (short runs are now < 12 s);
- the GPS–IMA mix baseline (now ≥18 s, previously ≥15 s);
- any targets coaches entered by hand on the stride tiles.

## Edges read from each row's own data (9 Nov 2026)

Stamping edges by team and date turned out to be wrong in two ways:

- **Edges are per athlete in OpenField.** Two Breiðablik players, Dagur Örn Fjeldsted (80 of 80 sessions from
  11 Jun) and Þorleifur Úlfarsson (41 of 41 from 9 Aug), were on Catapult's 3-band default (0–2.5 · 2.5–5 · 5+ s)
  all season while the squad used the legacy edges. Their bands 4–8 were empty, so MicroPulse read them as
  "0 long runs".
- **Reprocessing changes old sessions.** Catapult is bulk-reprocessing Breiðablik's 2026 sessions with the new
  edges, so a June session can come back in the new config.

So the DB trigger `ima_fr_fill_tiers` (migration `20261109190000`) now decides each row's edges from its own data.
A single run always lies inside its band, so the mean run of a band (time ÷ runs) does too. The trigger tries
every known config (`ima_fr_presets()`: legacy, new, 3-band default, plus the team's `team_fr_band_config` rows)
and keeps the one the row fits. `ima_fr_bounds_source` records how:

| Source | When |
|---|---|
| `detected` | the row fits exactly one config |
| `player` | it fits several (too few runs to tell) or has no runs + time; the same player's nearest `detected` row decides |
| `config` | no such neighbour; the team config for the date |
| `unknown` | it fits no known config; tiers are null |
| `writer` | the writer set the edges itself (estimated rows, `estimatePod.ts`) |

The 3-band default is stored as `{0,2.5,5,1000,1000,1000,1000,1000,1000}`. It has no 12, 18 or 24 s edge, so every
run-length tier reads null ("no reading"), never 0. The Long runs card names those players; the Today signal and
"Did we do enough?" treat them as a data gap. The trigger re-decides on insert, when a writer sets
`ima_fr_band_bounds = null` (the Catapult sync always does), or when band values change on update. A re-sync after
Catapult reprocesses therefore relabels itself; nothing has to be set by hand.

Backfill result (9 Nov 2026): run counts, time and strides in runs ≥18 s are unchanged for every team; Breiðablik
rows reading "0 long runs" fell from 198 to 79; 121 Breiðablik rows (the two players) and their demo copies now read
"no reading". In the data no row fits none of the configs. HK is all legacy.

TypeScript mirrors the rule in `freeRunningBands.ts` (`boundsFit`, `fittingBounds`, `frReadingOf`); tests in
`src/lib/integrations/catapult/__tests__/freeRunningBands.test.ts`.

## Last band-number readers removed (9 Nov 2026, Lota 3)

Migration `20261109200000_ima_fr_stride_views_tiers.sql`:

- `player_stride_summary.hi_velocity_strides` = `ima_fr_ge18_stride_count` (was bands 5–8) and
  `high_intensity_player_load` = `ima_fr_ge18_total_player_load` (was bands 4–8 = runs ≥15 s, legacy edges only).
  Same for `player_indoor_stride_summary`. Names, order and types kept. null = no reading (3-band default, or no
  Free Running data at all), where it used to be 0.
- `refresh_stride_baselines()` body saved in git (it was DB-only) and re-run. `stride_gps_ima_decoupling` now uses
  ≥18 s like the TypeScript path; its mean moved about 0.01 (squad −0.029 → −0.018). The other three stride
  baselines did not change.
- `get_mcburnie_decel_status` still counts `v_b78_days` from bands 7+8, but nothing reads that variable. Left as is.

Code:

- `strideIntelligence`: `hiVelocityStrides` / `highIntensityPlayerLoad` are `number | null` from the ≥18 s tier; no
  band-number fallback. The GPS/IMA mix is null when the tier is null. Same rule in the stride-intel route.
- Player game report: the long-run key (`ima_hsr`; `ima_hir5..8` removed 11 Nov 2026) is averaged only over matches whose row is readable,
  so the two players on the 3-band default don't get a false 0 in their season average or percentile.
- Transfer report radar axes say "Runs <12 s / 12–18 s / 18–24 s / 24 s+" instead of B5–B8.
- Removed: `LONG_RUN_BANDS`, `ImaRunningLoad.dominantBand` (and `dominant_band` on the unused ima-run-distance route).
  `sumBands58` in sync stays as a provisional value; the trigger overwrites it.
- `scripts/backfill-ima-from-feb.sh` no longer carries a fallback secret; it needs `CATAPULT_CRON_SECRET` in the env.

## First reprocessed session: 24 Oct 2026 (10 Nov 2026)

Catapult reprocessed Breiðablik vs KR (24 Oct 2026) with every athlete on the new edges. Compared against a full copy
taken before (Catapult API payload + `archive.pled_20261024_before_reprocess`):

- Runs ≥18 s and ≥24 s (count, time, distance) identical for the 13 players who were on the legacy edges. Total runs
  and total run time identical, so nothing was lost above the old 100 s top edge.
- The two players who were on the 3-band default now read (8 and 5 runs ≥18 s) instead of "no reading".
- Everything else MicroPulse stores moved by 0.5% or less (session end re-trimmed by 1 s, HR zones +0.1 s). Raw keys
  MicroPulse does not read moved more (acceleration-band distance/duration, non-gen2 effort counts filled in).

Trigger fix (`20261110100000_ima_fr_upsert_redetect.sql`): on an upsert, Postgres runs the BEFORE INSERT half of the
trigger first, so the UPDATE half saw already-detected edges and labelled them `writer`. Edges were right, but
`writer` rows are never a player's reference row and an `unknown` row would have got tiers. Now an UPDATE that brings
new edges detects again from the row's data; it is `writer` only when the edges disagree with the data (estimate-pod).
A partial upsert that sends `ima_fr_band_bounds = null` without the band columns would still detect from too little
data in the INSERT half; the Catapult sync always sends every band column.

## Pace: match pace vs jog (10 Nov 2026)

The bands say how **long** a player ran without stopping, never how **fast**. Breiðablik, Jun–Oct 2026, rows on the
new edges (1,211 training player-days, 261 match player-days, 143 near-full):

| Runs of 18 s+ | Near-full match | Training day |
|---|---|---|
| Count | 15.5 | 5.6 |
| Average pace | 12.2 km/h | 9.0 km/h |
| Count at 11 km/h or faster | 14.1 (91%) | 0.7 (12%) |
| Time at 11 km/h or faster | 342 s of 373 | 34 s of 237 |

- Pace separates cleanly: 90% of training rows are slower than 10.4 km/h, 90% of match rows faster than 11.2 km/h.
  Players' own match pace is tight (11.5–12.8 km/h). Cadence does not separate (training 84, match 88 strides/min).
- Training long runs are mostly jogs: warm-up laps, jogging back between drills. The open top band (30–1000 s) holds
  69% of training long-run time (median run 50 s at 9 km/h) against 20% in a match (36 s at 12 km/h).
- The days with the most long-run time are jog days (5 Jul 2026: 523 s per player, none at match pace, 2.9 km in
  total). Against high-speed running per day: match-pace count r = 0.69, all long runs 0.52, long-run time 0.33.

**Rule:** a long run (one continuous run of 18 s+) counts as running **load** only when its band's average pace is at
match pace, 11 km/h or faster (`MATCH_PACE_FLOOR_KMH`; per team `team_settings.fr_match_pace_floor_kmh`). Jogs stay
visible, labelled as jogs, and never judge, set a target or raise an alarm. The rule needs no length cut, so it fixes
the open top band at the root and still credits real interval runs (52 training rows had 30 s+ runs at match pace,
average 160 s).

- **Storage:** `ima_fr_ge18_mp_{event_count,total_duration,total_distance,stride_count}`, filled by `ima_fr_fill_tiers()`
  (`20261110235000_ima_fr_match_pace.sql`, backfill `20261110235500`). Null = pace unknown (no GPS distance, e.g. HK's
  indoor sessions, or no long-run reading); 0 = GPS present and every long run was slower. Pace is per band (band
  distance ÷ band time), so one band mixing a fast and a slow run reads as their average.
- **Code:** `matchPaceOf(row, floor)` and `longRunsOf(row).matchPace` in `src/lib/micropulse/longRuns/index.ts`
  (columns first, the same rule from the row's own bands otherwise).
- **Backfill check:** every ≥18 s / ≥24 s tier, band58 distance, the edges and `updated_at` identical before and after;
  3,005 rows got a match-pace reading. Breiðablik near-full match 14.1 of 15.5, training 0.7 of 5.6; HK match 9.6 of
  10.6 (GPS rows only).
- **Unfamiliar load** (`movementSignature`, `/api/coach/unfamiliar-load`, the movement narrative): the two long-run
  components read match-pace metres (`imaMatchPaceDistance`; 0 is a real value, null = pace unknown → all long runs).
  Replay Breiðablik Jun–Oct 2026, 1,420 player-days: any drift 26.5% → 25.3%, a long-run component flagged
  14.4% → 12.7%, sharp jumps 2.7% → 2.0%. Same sensitivity, now about running at match pace instead of jogs.
- **"Did we do enough?"** (`sessionEnough`): long runs are never judged any more. Locomotive days are judged on
  high-speed running (velocity bands 5–6) and sprint distance (band 6) against his own match × 45%
  (`CAL_SHARE_HI.locomotive`, Stevens 2017, Martín-García 2018: the table the Week plan already plans with); Mixed,
  Activation and Top-up on accelerations, braking and changes of direction only. The card shows one line, "Long runs:
  6 per player, 1 at match pace. Shown, not judged". Indoors (no GPS) a Locomotive day says it can't be judged and why.
- **Long runs card** (IMA Intelligence): first line per player "Training: 10 long runs, 3 at match pace. Match: 15, 14
  at match pace"; an "At match pace" column (count and % of his match). The ACWR column and the red spike banner are
  gone, for the reason in the Today-signal section above.
- **Unchanged:** the match profile (game report, match movement, transfer report), stride quality (length, cadence,
  return-to-training) and indoor running volume keep reading all long runs.

## Plan targets and reviews read match pace too (11 Nov 2026, Lota 3)

One read for every surface that plans, targets, ramps or compares long runs: `longRunLoadMetres(row)` and
`longRunLoadStrides(row)` (`src/lib/micropulse/longRuns/index.ts`) = metres / strides in long runs at match pace,
all long runs only when the pace is unknown (null match-pace column, e.g. indoors). Both sides of every comparison
switch together, so a target and its actual never mix jogs with match-pace runs.

Breiðablik Jun–Oct 2026, % of a near-full match (119 matches: 1,194 m / 495 strides in all long runs, 1,024 m / 440
at match pace), mean per player-day:

| Day | Metres, all long runs | Metres, at match pace | Strides, all | Strides, at match pace |
|---|---|---|---|---|
| MD-4 | 66% | 15% | 83% | 15% |
| MD-3 | 98% | 4% | 126% | 4% |
| MD-2 | 50% | 11% | 64% | 11% |
| MD-1 | 45% | 8% | 58% | 8% |
| MD+1 | 50% | 10% | 63% | 10% |
| Match day (all who played) | 80% | 83% | 81% | 82% |

On all long runs MD-3 looked like a full match of long running (98%, strides 126%); at match pace it was 4%. A
1-match week of training was 2.6× a match on all long runs and 0.4× at match pace.

- **Periodization hub** (`periodization/loader.ts`): the match unit, training averages, Meso calendar cells and
  Player Demands read match pace (`imaFrDist`, `strideHi`); labels say "at match pace". Taper: strides 0.7 → 1.2, the
  same as metres. The flat 0.7 came from strides "staying ~60% of a match on MD-1", which was the jogs; at match pace
  strides and metres are the same runs and track each other within 1 point on every MD-day. Weekly target in a
  1-match week: 2.14× a match for both. No published standard exists for long continuous runs in training; the
  level stays a planning assumption.
- **Load plan / pre-session / post-training planned vs actual / progressive overload** (`loadPlan`, `postTraining`,
  `progressiveOverload`): the `ima` KPI = metres in long runs at match pace.
- **Build-up tracking**: the stride KPI = long-run strides at match pace.
- **IMA Intelligence headline + row colour** (`imaDayProfile`, `isLongRunSpike`): "far more long running than usual"
  compares long-run strides AT MATCH PACE with the player's own 14-day training norm, ≥150% AND at least 100 strides.
  Replay Breiðablik Jun–Oct 2026, 79 training days: a flag on 60 days on all long runs (17% of players a day), 25 at
  match pace (7%). The jog days (6 and 9 Jun: 8 flags each, ~0 strides at match pace) are gone; the flags left sit on
  running days (15–16 Jul, 6 Oct). The stride shares on the page (short / medium / longest runs) still read all runs:
  they describe the session's shape, not load.
- **Player app movement card**: the long-run tile reads metres at match pace and is named "Long runs at match pace"
  (it was labelled "High-speed running", which it never was).

## Game report radar: one long-run axis (11 Nov 2026)

The IMA ("Driver") radar in the Player Game Report, the player app's game report and the Transfer report had four
Free Running axes (metres in runs <12 / 12–18 / 18–24 / ≥24 s). In a match they say one thing: Breiðablik Apr–Oct
2026, 23 players, 18–24 s vs ≥24 s r = 0.89, each against runs ≥18 s 0.94 / 0.98. A player short of long runs
collapsed on half the chart.

Now one shared list, `DRIVER_AXES` (`src/lib/micropulse/playerGameReport/index.ts`), 8 axes: Acc · Hard acc · Dec ·
Hard dec · CoD · Sharp CoD · Jumps · Long runs. The hard axes are the top IMA band (`ima_band3_accel_count`,
`ima_band3_decel_count`, `ima_cod_left_high + ima_cod_right_high`); a row without the column is no reading, never
0. Hard vs all: accelerations r = 0.72, braking 0.54, turns 0.55 (83% of turns are gentle), so they add what the
totals hide. Long runs = metres in runs of 18 s or more, all long runs (in a match ~91% are at match pace; the
match-pace columns only exist from June 2026), independent of accelerations (r = 0.01) and turns (0.18).

## Player Match Movement: long runs as runs (11 Nov 2026)

The movement signature keeps its one long-run dimension (strides in runs of 18 s or more, per minute):
strides exist on every row, indoors and before the June re-sync too, and track metres, count and
seconds at r = 0.99–1.00 (Breiðablik matches Jun–Oct, 158 player-matches of 60+ min).

The S&C breakdown no longer shows strides in 12–18 / 18–24 / 24+ s runs (the 24+ s band was red and
labelled "high-intensity", which it is not: it says how long a run lasted, and one run more or less
swings it from 0 to ~60 strides). It now shows **Long runs (18 s or more)** as three rows, this match
against his usual, never red:

| Row | Column | Shown when |
|---|---|---|
| Long runs | `ima_fr_ge18_event_count` | the row has a count (re-synced rows) |
| …of which at match pace | `ima_fr_ge18_mp_event_count` | GPS speed present |
| Strides in long runs | `ima_fr_ge18_stride_count` | always |

A row with no reading on either side is hidden, not drawn as 0. The minutes behind each side
(this match vs his mean minutes over the norm's matches, `minutesAverages`) are stated on top,
because the counts are raw, not per minute. The AI narrative gets the same three keys and the
usual minutes. Red stays only on hard braking and sharp changes of direction.

## Match Movement: long runs are "different" only at 50% (11 Nov 2026)

One rule for the screen and the PDF, `significanceThreshold` in `matchMovement/types.ts`: long runs
(strides in runs of 18 s or more, per minute) count as different from usual at 50%, other rates at 20%,
left/right at 10 points. Long runs are a count of ~15 runs a match, so they swing far more between
matches by nature (median distance from own usual 30% Breiðablik / 23% HK, vs 8–14% for IMA load and
change of direction). At 20% they were "different" in 68% of Breiðablik player-matches and led the PDF
headline in 14 of 30 matches; at 50% it is 30% and 5 of 30.

The PDF's squad numbers come from `squadVsUsual` (`matchMovement/squadSummary.ts`): touchline warm-up
rows are left out of this match and of the squad's usual (as on screen), estimates out of the usual,
and the players left out are named. Under the squad table one plain line: long runs per 90 min this
match and at match pace, against the squad's usual (pooled: all runs ÷ all minutes × 90; hidden
without a run count).

Same day, Accel : Decel got its own line too: 30%. It is the ratio of two counts, so the noise of
both adds up (median distance from own usual 23% Breiðablik / 17% HK, 75th percentile 34% / 29%);
at 20% it was "different" in 53% / 42% of player-matches.
