# Brief — make the CTR parser accept OpenField's "Activity Report → CSV" export

**Why:** The peak-window feed (`player_peak_window`) that the contextualised-peak / fusion overlay
needs is loaded from a Catapult OpenField export via `/api/coach/load/peak-window/upload` →
`parseCatapultCtr`. The parser was written for the **Bulk Export CTR** column spellings. But the export
a coach reaches for first is **Reporting → Activity → (share) → Export to CSV** (the "Activity Report"),
and that file uses *different* column names — so the parser currently **rejects it outright**
("Not a CTR export — need … HIR Distance / Velocity Band 5"). Verified against a real export
(Breiðablik–Fram, 24 Aug 2026): the Activity-Report CSV parses to zero rows today.

This was worked around once by a **direct DB load** (that match is already in `player_peak_window`:
106 rows, 12 players, 72 peak windows with kickoff clock). This brief makes it **repeatable for
coaches** without a manual load.

## What the Activity-Report export actually contains (ground truth)
Preamble: `Date`, `Start Time`, `Unix Start Time`, `Duration`, `Num Players`, `Num Periods`,
`Num Parameters`. Header row starts `Player Name, Period Name, Period Number, …` (558 columns).

Present and usable (exact spellings):
- `Total Distance`, `Total Player Load`, `Total Duration` ✓ (already matched)
- `MII Distance Interval 1..3` + `… Start Time` / `… End Time` ✓ (the peak-window clock — matched)
- `MII Player Load Interval 1..3` + start/end ✓ (matched)
- `RHIE Total Bouts` ✓ (matched); `Footstrikes` ✓
- `Velocity Band 5 Average Distance (Session)`, `Velocity Band 6 Average Distance (Session)`

**Absent** (this is why it's rejected): `HIR Distance`, `Velocity Band 5 Total Distance`,
`Velocity Band 6/7/8 Total Distance`, `Running Symmetry/Deviation/Imbalance`, and the
`RHIE … (Mean)`/`… Mean` spellings (this file uses `RHIE Bout Recovery - Mean` with a hyphen).

**HSR is recoverable after all — sum the top velocity bands.** There is no single `HIR Distance`
column, but the six velocity-band columns are present, and (verified in Settings → Bands → Velocity,
in m/s) the band edges are:
`B1 0–2.22 · B2 2.22–3.31 · B3 3.31–4.00 · B4 4.00–5.50 · B5 5.50–7.00 · B6 7.00–15.00` m/s.
`5.50 m/s = 19.8 km/h` — **exactly the Ju-2022 HSR threshold** — and `7.00 m/s = 25.2 km/h` — the
sprint threshold. So **HSR (>19.8 km/h) = Velocity Band 5 + Velocity Band 6** and **sprint distance
(>25.2 km/h) = Velocity Band 6**, both at standard thresholds, for THIS account. Also verified: the
`Velocity Band N Average Distance (Session)` columns are the per-band **session totals** (they sum to
`Total Distance`), so summing them is metres, not an average of averages. This has already been
**backfilled onto the per-period rows** for the 24 Aug match (`hsr_m = V5+V6`, `vb5_m`, `vb6_m`,
`hsr_threshold_kmh = 19.8`): session avg HSR 623 m, first half 383 m, second half 304 m.

## Changes to `src/lib/micropulse/load/parseCatapultCtr.ts`
1. **Stop rejecting when a high-speed column is absent but MII peak windows exist.** Today:
   ```
   if (cAth < 0 || cPer < 0 || (cHir < 0 && cV5 < 0)) return { rows: [], … "Not a CTR export …" };
   ```
   Change the gate to: require `Player Name` + `Period Name` **AND (a high-speed column OR any MII
   interval column)**. i.e. accept the file when `cHir>=0 || cV5>=0 || miiDist.val.some(i=>i>=0) ||
   miiPl.val.some(i=>i>=0)`. Add a warning (not a rejection) when no HIR/high-speed column is present:
   "No HIR/high-speed column in this export — peak-window HSR (Ju-2022) stays gated; loaded distance +
   Player-Load peak windows and per-period load only." This is the load-bearing fix.
2. **RHIE hyphen spellings.** Extend the `idxAny(...)` candidates for the RHIE mean/max/min columns to
   include the `" - Mean"` / `" - Max"` / `" - Min"` forms, e.g. `"RHIE Bout Recovery - Mean"`,
   `"RHIE Effort Duration - Mean"`, `"RHIE Effort Recovery - Mean"`, `"RHIE Efforts Per Bout - Mean"`
   (and Max/Min). `RHIE Total Bouts` already matches.
3. **Map the velocity bands and derive HSR.** Add `Velocity Band 5 Average Distance (Session)` /
   `Velocity Band 6 …` as candidate spellings for `vb5_m` / `vb6_m` (verified: these are per-band
   session totals, they sum to `Total Distance` — not averages-of-averages, despite the name). Then
   **compute `hsr_m = vb5_m + vb6_m`** and set `hsr_threshold_kmh` from the account's band-5 lower edge
   **only when that edge equals the HSR threshold** (here 5.50 m/s = 19.8 km/h → `hsr_m = V5+V6`,
   threshold 19.8; also `sprint_m = V6` at 25.2 km/h if you want to store it). The band edges are NOT
   in the export — read them from the account's velocity-band setup, or take them as a route parameter
   (default 19.8) that the coach confirms once; if the band-5 edge does NOT equal the HSR threshold,
   store the bands but leave `hsr_m` null (never mislabel). This gives **per-period** HSR (session +
   each half) — a real load metric and a real Ju comparison at period resolution. It does **not** give
   per-peak-window HSR (the MII intervals carry Distance + Player Load only), so the peak-window Ju
   Table-2 score stays gated exactly as today.
4. Keep everything else (MII peak parsing, Total Distance/PL/Duration, name set) unchanged — it already
   works on this file.

## Upload route / UX (`/api/coach/load/peak-window/upload` + the page)
- **Name-matching is already solved** for Breiðablik: `catapult_athlete_map` holds all 12 abbreviated
  CTR names (a `"Dagur Orn F."` alias was added). No route change needed for matching, but for other
  clubs consider a surname-initial fallback in `nameToPlayer` (abbreviate roster `full_name` to
  "First Middle L." and also key the map on that) so first-time uploads match without hand-mapping.
- **Kickoff offset:** the peak-window clock is stored as seconds-from-kickoff only when
  `kickoff_offset_s` is supplied (seconds from the *activity* start to kickoff). For this match it is
  **631 s** (session start 19:03:07, kickoff 19:13:38). Add a field on the upload page: "kickoff time
  (or seconds from recording start to kickoff)"; without it, `window_start_s_from_ko` stays null (never
  faked) and only the raw epoch clock is stored. Also note: **second-half** windows need half-time-gap
  handling — the Catapult session clock is real elapsed (includes half-time) while Wyscout play-time
  removes it; first-half alignment is exact, second-half needs the half-time length subtracted.

## Honest scope (unchanged principles)
Descriptive load context only — none of this touches the readiness colour or the daily decision. The
Ju-2022 peak-HSR score stays gated (no HIR in this export). The value delivered is the **physical peak
windows with clock** — the missing feed for the contextualised-peak / fusion overlay.

## Acceptance
- `parseCatapultCtr` on the real Activity-Report CSV returns 34 period rows + the MII peak windows
  (not zero), with a warning about the missing HIR column.
- A preview upload of that file reports 12/12 athletes matched, ~106 upsert rows, 72 peak windows.
- Lint clean; a unit test with a trimmed Activity-Report fixture (3 athletes) asserts the above.

Ref: `parseCatapultCtr.ts`, `/api/coach/load/peak-window/upload/route.ts`, `loadPeakHirWindows.ts`,
`player_peak_window` migration, `docs/product/fusion-real-data-proof.md` (the match already loaded).
