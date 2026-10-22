# Brief — IMA season graph (accel/decel density + directional balance over time)

**Goal:** a coach-facing season graph of a player's IMA load — how much accel/decel work he does and
**what shape** it has (forward / backward / lateral) — trended over the season. The data is already
synced automatically; this is a **surfacing** job, no ingest. Companion to the HSR season trend
(`season-hsr-ima-trend-brief.md`) — this brief is the IMA half in detail.

Confirmed present in `player_external_load_daily` for Breiðablik (2,400+ rows, Feb–Sep 2026, 25 players,
157 match-days): `ima_accel`, `ima_decel`, `accel_decel_efforts`, `accelerations`, `decelerations`,
`ima_clock_gen2` (jsonb), plus `ima_cod_*` (currently empty — omit).

## What to show
Two reads, side by side, per player, over the season (match-days; rolling last ~8–12 weeks band):

1. **IMA density trend** — accel + decel efforts per session (or per minute using session duration).
   A line over time with a rolling mean/band and trend arrow. This is the mechanical/repeat-effort
   load — the "how much braking and re-accelerating" signal.
2. **Directional balance** — from `ima_clock_gen2`. The value is a 12-direction clock, each with
   `{low, medium, high}` counts:
   ```
   {"1":{"low":9,"high":3,"medium":2}, "2":{...}, ... "12":{...}}
   ```
   Collapse the 12 clock positions into three tactical directions and show their share over the season
   (a stacked area or three lines):
   - **Forward** = positions 12, 1, 2 (attacking drive / pressing forward)
   - **Backward** = positions 6, 7, 8 (recovery running / dropping)
   - **Lateral** = positions 3, 4, 5 and 9, 10, 11 (covering / shuffling / cutting)
   Weight by intensity if wanted (e.g. medium + high only, or high-weighted) — reuse the existing
   `directionalSignature` / `peakMovementSignature` logic rather than re-deriving the clock mapping;
   they already classify this clock into forward/backward/lateral archetypes. Keep the mapping in one
   place.

## Read it together with HSR (the point)
On the same surface as the HSR trend: **HSR = how hard he ran; IMA density = how much braking/
re-accelerating; IMA direction = what kind of movement.** Forward-dominant + high HSR = attacking
output; backward-dominant + high accel/decel = defensive transition load (the Ju "Recovery Run /
Covering" peak-period signature, approximated from Catapult alone — no Wyscout needed, every match).

## Where
Extend the Power Curve / Load-Intelligence surface (`PeakPeriodCurveCard` area or a sibling
`ImaSeasonCard`). Chart.js (approved) or the repo chart component. Design tokens for colours; a
consistent colour per direction (e.g. forward = cobalt, backward = amber, lateral = muted).

## Explainability / house rules
- English default, Icelandic toggle (`const [lang] = useLang(); const isEN = lang !== "IS"`). Translate
  headings + the direction labels (Forward / Backward / Lateral = Fram / Aftur / Hlið).
- Layered read: verdict ("accel/decel load trending up; movement is forward-dominant this block") →
  2–3 facts → Show details for the raw series + the 12-position clock.
- Descriptive load context — never the readiness colour or any decision. No AI text.
- Gate gracefully: `ima_clock_gen2` is null on some rows (~30%) and `ima_cod_*` is empty — show the
  density trend even when the clock is missing; hide the directional panel for players/dates with no
  clock rather than drawing an empty chart.

## Acceptance
- Per-player IMA density trend renders from `ima_accel`/`ima_decel` with a rolling band.
- Directional balance (forward/backward/lateral share) renders from `ima_clock_gen2`, reusing the
  existing directional lib for the clock→direction mapping.
- Works for all 6 recent matches (10 Apr, 27 Apr, 27 Jul, 16 Aug, 24 Aug, 31 Aug — IMA confirmed
  present for each). EN/IS toggle works; no empty charts. Lint clean.

Ref: `player_external_load_daily` (ima_accel/decel, ima_clock_gen2), `directionalSignature`,
`peakMovementSignature/index.ts` (clock→forward/backward/lateral), `PeakPeriodCurveCard.tsx`,
`season-hsr-ima-trend-brief.md` (the HSR half), `contextualised-peak-periods-page.html` (the Ju
framework this operationalises automatically).
