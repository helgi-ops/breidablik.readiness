# Build-next memo — Load intensity (post-ADI), grounded on what's already in Code

Purpose: after the Andrew Gray / ADI talk, this records **what is already built**, so nobody
re-does it, and names the **real remaining gaps** in priority order. Everything here is
descriptive load context — it never touches the readiness colour, the load target, or the
daily decision.

## Already in Code (do NOT rebuild)

- **Power curve + true peak period** — `src/lib/micropulse/load/peakPeriod.ts` computes the
  session power curve + the player's **season-best curve** per metric, benchmarked vs squad;
  backed by the **`player_load_peak_period`** table (`20260815120000…`, keyed
  `(player_id, date, source, window_min, metric)` = worst rolling window).
- **Ingestion is AUTOMATIC (live)** — the daily Catapult sync now populates the curve itself.
  `miiPeakPeriod.ts` (pure extractor: reads the MII snake_case keys per player, derives the
  window 1/3/5 min from the start/end timestamps, ignores 0-display names; 5 unit tests green on
  real Breiðablik values) → `storePeakPeriodRows()` in `sync.ts` runs on **every daily sync** and
  upserts into `player_load_peak_period`. **Best-effort** — every error is swallowed, never
  touches the readiness colour or the daily decision. Verified live: the 2026-08-15 sync wrote
  **108 rows** (18 players × {player_load, distance} × {1,3,5} min), all correct descending
  curves. Observable via `peakPeriodCount` in the sync result/log. The diagnostic route takes
  `?commit=1` to run/backfill a date in dev.
- **Manual upload path (secondary fallback)** — `parseCatapultPeakPeriod.ts` + the upload route
  `api/coach/load/peak-period/upload/route.ts` (preview/commit, athlete-mapping, idempotent
  upsert) still exist for one-off CSV imports, but are **no longer the primary source** — the sync
  covers the normal case. This account's OpenField tier does **not** produce a multi-window
  power-curve CSV anyway (confirmed: Averages = benchmark averages; Parameters = single Peak
  Player Load / Peak Meta Power only; Period Templates = named drills, no rolling-duration
  option), so the automatic MII path is the real answer, not a manual export.
- **Phase-1 proxy** — `peakIntensity.ts` (peak-intensity fingerprint from session summaries)
  is the honest stand-in until the interval feed lands.
- **Mechanical-load intensity** — `mechanicalPower.ts`: density of high-cost actions
  (high-tier IMA efforts + gen2 accel/decel per minute), personal-norm only; movement profile
  via `ima_clock_gen2` / decel narrative. Honestly labels that W/kg needs the metabolic export.
- **Athlete axis** — `playerAnalysis/athleteProfile.ts` (+ `athleteSignals.ts`,
  `developmentLevers.ts`): quality-based strengths/weaknesses with trend + confidence.
- **Surfaces** — `peak-demands` route + `MatchPeakDemandsCard.tsx`; `movementSignature`.
- **Basketball InStat** — advanced metrics / team match stats / `instat` source / opponent AI
  summary / film-clip-notes migrations already landed.

## What's actually left (data is flowing — one UI step)

The engine, the ingestion, AND the data are now live. Ingestion is no longer the blocker.

**A. Data source — SOLVED (automatic from sync).** ~~Verify the parser against a real export~~ —
superseded. The curve is populated directly from the daily MII sync (`miiPeakPeriod.ts` →
`storePeakPeriodRows()`), verified live (108 rows for 2026-08-15). No manual export, no parser
verification needed for the normal path. **Remaining data step: backfill history** so
`season-best` and the shape classifier have depth — run the diagnostic `?commit=1` per day for the
last ~4 weeks (in progress: 28-day backfill). `MIN_MATURE_PEAKPERIOD_SESSIONS = 4`, so players
with 4+ sessions in-window get "mature" confidence once the backfill lands.

**B. Wire the UI.** Progress:
- ✅ **Read route DONE** — `GET /api/coach/load/peak-period?player=<uuid>` returns
  `computePeakPeriod` output (latest session curves + season-best), team-scoped, eslint/tsc
  clean. Falls back to empty when the table has no rows (caller uses the peak-demands proxy).
- ▢ **Power-curve card** — render the read: session curve overlaid on the player's season-best,
  per metric (mirror `MatchPeakDemandsCard.tsx`); place on Total Player Analysis / the Load page.
  This is now the **only remaining build step** to make the curve visible to coaches.
- ~~Upload control~~ — no longer needed for the normal path (sync populates automatically); keep
  the manual route only for one-off backfills.

## Remaining gaps — priority order

1. **Wire the curve UI card** *(B above)* — the only thing between you and a coach-visible power
   curve. Data is already flowing from sync; no lib, no export — just a card that renders the read
   route. Backfill history in parallel for `season-best` depth.
2. **Explosive / Engine / Under-conditioned profile** — a curve-SHAPE classification on the
   athlete axis (short-burst 5–15 s power vs sustained >5 min). `curveShape.ts` exists and now has
   **real data** from the sync; it just needs the 28-day backfill for stable classification.
   Surface it on the athlete axis (`athleteProfile.ts` is still quality-based). High-value,
   coach-friendly.
3. **% of peak capacity + drill/period splits + Session Builder** — the "94 % effort" drill
   label and proactive planning. Needs (a) the curve *and* (b) **drill/period segmentation**,
   which the load ingest doesn't have (it stores session totals). Adding Catapult **period
   splits** is the blocker here — a real gap.
4. **Curved-sprint exposure in the hamstring RTP gate** — true arc/curve detection needs raw
   position streams (out of reach). Wire a **multidirectional-exposure proxy** (high-intensity
   IMA-COD + decel density from `mechanicalPower.ts`) into the RTP worst-case gate as a
   defensible "was he exposed to enough COD load before clearing?" check.
5. **W/kg mechanical/metabolic power** — needs the Catapult **metabolic export** + bodyweight;
   anthropometry is sparse (only in the physical-assessment battery). Gap for per-kg metrics.
6. **Positioning (non-code)** — the IMA-native multidirectional claim is under-sold. Say it
   plainly on the site and in social: *"IMA-native — we measure the multidirectional work that
   distance/speed systems miss"* (exactly Gray's argument, in your favour for small clubs).

## Out of scope (Hudl / ADI land — don't build)

Complete-acceleration / direction-change vectors, per-cut-angle profiling (45/90/135/180°),
curved-sprint wattage, and league-wide optical recruitment curves — all require raw
velocity/position streams (10 Hz GPS or optical) MicroPulse doesn't ingest, and are now
Hudl/ADI IP. Use IMA as the proxy; ingest their outputs where a club has them.

## Bottom line

The engine is built AND the data now flows automatically — the daily MII sync populates the
power curve on its own (verified live: 108 rows, 2026-08-15). No manual Catapult export exists at
this tier and none is needed. The **only remaining build step is the power-curve card** (render
the read route); everything else — backfill history, curve-shape profile, multidirectional-exposure
RTP gate, IMA-native positioning — sits on top of data that's already landing. Skip the raw-vector
layer (Hudl/ADI IP).
