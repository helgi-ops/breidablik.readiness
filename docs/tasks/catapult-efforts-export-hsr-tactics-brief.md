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
2. **Per-MINUTE HSR × tactics — AVAILABLE NOW from the CTR minute bins (the practical bridge).**
   Confirmed on the real Breiðablik–KA CTR (06/09/2026): the export contains fixed per-minute period
   rows ("Fyrri halfleikur - 15-16", …) for every STARTER, each carrying that minute's high-speed
   EFFORT COUNTS (HS Efforts, Sprint Efforts, Velocity B5+/B6+ # Efforts). Each minute bin has a
   DEFINITE clock position (its minute label → play-time window [m:00, m+1:00]), so it aligns to the
   Wyscout events in that minute at 1-minute resolution — no efforts export, no raw 10 Hz. This is a
   FIXED-bin timeline, not the rolling peak; it answers "what was he doing when he ran hard" directly.
   Limits: starters only (subs get halves); counts, not metres — add "HIR Distance" or "Velocity
   Band 5/6 Total Distance" to Reporting Parameters to also get per-minute HSR metres (optional).
3. **Per-SPRINT (sub-minute) via an efforts/raw export — future, finer.** Each individual effort with
   its own start time → align every sprint exactly. NOT a Reporting-Parameters change and NOT present
   in the CTR (verified: no per-effort row, no effort start-time column); needs an efforts export with
   timestamps or raw 10 Hz. Only worth it if minute resolution proves too coarse.

## Reporting Parameters will NOT produce this — why

Reporting Parameters control the **columns** on the period/session summaries (the CTR / Activity /
Bulk exports): one row per (athlete, period), each column an aggregate (HIR Distance, Velocity Band
5–6, MII Player Load interval, RHIE, …). Adding more parameters there only adds more *aggregate
columns* — it never produces one row per sprint, and there is **no peak-HSR MII interval parameter**
(OpenField computes MII peak windows for Distance and Player Load only — the reason peak-window HSR
is gated). So the per-half HSR we already surface is the ceiling of the Reporting-Parameters path.
Per-effort tactical alignment needs a fundamentally different export shape (rows = efforts, not
periods).

## What feed #2 needs (the ask to the club / OpenField)

An OpenField **efforts / velocity-effort export** — one row PER EFFORT (not per period). In OpenField
this is the "Efforts" / velocity-band-efforts breakdown (Activity view), distinct from the CTR
period summary; exact menu wording varies by OpenField version. The make-or-break field is a
per-effort **start time**. Required fields per effort:

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

## How to check it exists (before any code)

In OpenField Cloud, on a match activity:
1. Open the **Efforts** / velocity-efforts view for an athlete (the per-effort breakdown, not the
   period summary). Look for a table where each row is one sprint / high-speed effort.
2. Export it (CSV/Excel). Open the file and confirm each effort row has a **start time** column —
   a timestamp, or seconds from session start. This single column decides whether #2 is possible.
3. Confirm it also carries max velocity and/or distance per effort, and a band/threshold so we can
   keep only ≥ 19.8 km/h.

Questions for Catapult support / the club's OpenField admin (paste verbatim):
- "Can we export **individual velocity efforts** (one row per sprint), each with a **start time**,
  duration, max speed and distance — as CSV/Excel, without a raw 10 Hz export?"
- "Which report/view produces per-effort rows with timestamps on our licence?"
- "If per-effort timestamps aren't available short of raw 10 Hz, is raw the only path?"

Outcomes:
- **Efforts export WITH start times exists** → build feed #2 per the sketch below. Best case.
- **Only aggregate efforts (counts, no timestamps)** → not enough to align; stay on per-half.
- **Only raw 10 Hz has timestamps** → that's ladder step #3 (heavier; revisit if the club exports it).

## Boundaries (unchanged)

Descriptive load × tactical context — never the readiness colour, never the daily decision. Second-
half alignment stays flagged "approx" (half-time gap subtracted). HSR threshold recorded per account
(Ju 19.8 km/h), bands never relabelled when the account edge differs. Athlete matching via
`catapult_athlete_map` with the roster-name fallback.
