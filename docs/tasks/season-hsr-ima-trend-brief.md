# Brief — surface season HSR + IMA trends (data is already synced)

**Goal:** show the coach a season-long HSR trend and an IMA (accel/decel + directional) read, per
player, on the Power Curve / Load-Intelligence surface. The data already flows in automatically — this
is a **surfacing** job, not an ingest. Confirmed for Breiðablik: `player_external_load_daily` holds
`velocity_band5_total_distance` (2493 rows), `velocity_band6_total_distance`, `hir_dist` (2473),
`high_speed_distance` (2494), `ima_accel` (2412), `ima_decel` (2406), `ima_clock_gen2` (1746),
across 25 players / 157 match-days (Feb–Sep 2026).

## Key distinction to keep honest
- **Session-level** (available, auto): total HSR and IMA per session/match. → a real **season load
  trend**. Build this.
- **Peak-window-level** HSR (hardest 1/3/5-min HSR rate — the Ju Table-2 curve): **NOT available** from
  the Catapult API or the CTR (OpenField exposes MII peak windows for Player Load / Distance / Meta
  Power only, never HSR — verified in the parameter catalog). Stays gated; do not fake a peak-window
  HSR curve. The Power Curve's peak-window track stays PL/Distance; HSR is added as a **session trend**,
  clearly labelled as session (per-match) totals, not a peak window.

## HSR — season trend
- Source: `player_external_load_daily`. Per-session HSR metres = `velocity_band5_total_distance +
  velocity_band6_total_distance` (the >19.8 km/h bands; matches the account's Band 5 edge = 5.50 m/s =
  19.8 km/h) — fall back to `hir_dist` / `high_speed_distance` if a band is null.
- Render: a line over the season per player, with a rolling (last ~8–12 weeks) mean/band and the trend
  arrow; optionally the Ju position reference (a centre-back's match HSR context). Match-days only
  (filter to match sessions, or show all and mark matches).
- Label: ">19.8 km/h, per session (not a peak window)". Descriptive — never the readiness colour.

## IMA — into the same view
IMA is the automatic, Catapult-only approximation of *what the load is made of* — the movement-signature
signal (already used per-session by `peakMovementSignature`). Surface it at season level:
- **Accel/decel density:** `accelerations`, `decelerations`, `accel_decel_efforts` (per minute) — the
  mechanical/repeat-effort load. A season trend + rolling band.
- **Directional balance** from `ima_clock_gen2` (the IMA directional clock): forward / backward /
  lateral share — the "shape" of high-intensity movement. Reuse the existing directional-signature lib
  (`directionalSignature` / `peakMovementSignature`) rather than re-deriving.
- Read it together with HSR: **HSR = how hard he ran; IMA direction = what kind of running** (forward
  attacking vs backward recovery vs multidirectional press). Together that is a season-level, Wyscout-
  free approximation of the Ju "contextualised peak" question — automatic on every match.
- `ima_cod` (change-of-direction L/R) is currently empty (param not enabled in OpenField) — omit or
  gate it; don't show an empty chart.

## Where
Extend the Power Curve / Load-Intelligence page (`PeakPeriodCurveCard` area or a sibling card). English
default + IS toggle. Explainability-first: verdict (e.g. "HSR trending up over the last 6 weeks;
movement is forward-dominant") → 2–3 facts → Show details for the raw series. No AI text.

## Acceptance
- Per-player season HSR trend renders from the synced band data, session-labelled, with a rolling band.
- IMA accel/decel density + directional balance render on the same surface, reusing the directional lib.
- No peak-window HSR is fabricated. Lint clean; EN/IS toggle works.

Ref: `player_external_load_daily` (synced HSR + IMA), `peakMovementSignature/index.ts`,
`directionalSignature`, `PeakPeriodCurveCard.tsx`, `match-day-data-workflow.md`,
`contextualised-peak-periods-page.html` (the Ju framework this operationalises automatically).
