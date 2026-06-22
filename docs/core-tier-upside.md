# Spec — Core/Lite tier upside ("do more for GPS-only clubs")

> **Grounded in the real OpenField account of Þór Ak (Vector Core), 22 Jun 2026.**
> Read directly from their parameter picker via the logged-in browser. This is the
> definitive list of what the Core tier exposes — not assumptions.
>
> Goal: make the Core/Lengjudeild product meaningfully richer than "distance + HSR"
> by surfacing the effort/intensity/braking signals these clubs already have, in
> the framing OpenField already uses. No IMA Driver layer needed.

## What Core actually exposes (full parameter inventory, per category)

- **Acceleration (Gen 2):** Accel&Decel Efforts · Accel&Decel Efforts/min ·
  **Acceleration B1+ Efforts** · **Deceleration B1+ Efforts** · Max Acceleration ·
  Max Deceleration
- **Basic:** Avg Heart Rate · Avg HR (%Max) · Distance · **Duration** ·
  Max HR (%Max) · Max Vel (%Max) · Maximum Heart Rate · **Maximum Velocity** ·
  Meterage/min · **Player Load** · **Player Load Per Minute** ·
  **Velocity Work/Rest Ratio**
- **Heart Rate:** HR Band 1–6 Duration · HR Exertion · Red Zone
- **IMA:** **only** IMA Impacts Band 2 Count → effectively nothing; **no Driver layer**
- **Load Scores:** Intensity · Overall · Volume (the composite Volume/Intensity/Overall)
- **Metabolic Power:** Energy · High Metabolic Load Distance (HML)
- **Velocity:** HI Distance · High Speed Distance · High Speed Distance/min

OpenField also frames everything as **% of a match-day reference (MD comparison)** —
e.g. "this session was 32% of a match in Volume, 28% in Intensity" — via the
`compare-to=MD` URL param. Volume / Intensity / Overall is their native grouping.

## We already ingest these (verified coverage on Þór)

`total_distance` 94% · `high_speed_distance` 82% · `sprint_distance` 60% ·
`total_player_load` 100% · `player_load_per_minute` 100% ·
`high_metabolic_load_distance_m` 87% · `accel_decel_efforts` 87% ·
`max_acceleration` 92% · `velocity_band5_total_efforts_gen2` 81% ·
`velocity_band6_total_efforts_gen2` 53% · (`metabolic_energy_kj` 10%).

Columns we HAVE but show 0% on Þór (available in the picker → likely just not in
their export selection, not a tier block): `session_duration_minutes` ("Duration"),
`max_velocity` ("Maximum Velocity"), `decel_b2_3_tot_effs_gen2` /
`accel_b2_3_tot_effs_gen2` (the B1+ effort split), `avg_heart_rate` / HR zones
(needs HR belts), `hir_dist` ("HI Distance").

## The build — what to do better for Core

### 1. Surface the Acceleration (Gen 2) family — the "hard efforts" + braking dimension WITHOUT IMA
- `accel_decel_efforts` (combined) is a headline metric in their own OpenField; we
  barely use it. Surface it as the neuromuscular/effort signal.
- **Split braking from acceleration:** `decel_b2_3_tot_effs_gen2` = "Deceleration
  B1+ Efforts" → an **eccentric/braking** signal (hamstring-relevant) that works on
  Core. `accel_b2_3_tot_effs_gen2` = acceleration efforts. This is the Core
  substitute for the IMA braking story — confirm these columns populate (re-check
  export/ingest; they read 0% on Þór but the parameters exist).
- `max_acceleration` / `max_deceleration` → peak intensities.

### 2. Core-aware `loadVerdict` (extends docs/load-intelligence-explainability.md)
- When IMA is absent (Core/Lengjudeild), use **`accel_decel_efforts` / `decel`
  efforts** as the braking/mechanical proxy and **velocity band efforts** for
  sprint exposure — instead of the IMA-derived signals.
- Add **Player Load Per Minute** as the intensity axis (volume vs intensity).
- Confidence degrades honestly (lower coverage), per the existing confidence rule.

### 3. Adopt the OpenField framing coaches already read
- **MD comparison (% of a match):** express session/weekly load as % of the club's
  match demand (Volume / Intensity / Overall). We have match data → compute it.
  Coach-friendly, needs no extra parameters, and feels native because it mirrors
  OpenField.
- **Volume / Intensity language** in the verdict and tiles.

### 4. Sprint exposure for Core (hamstring-relevant, no IMA)
- `velocity_band5_total_efforts_gen2` + `band6` efforts + HSR distance → a "sprint
  exposure" metric (number of high-speed/sprint efforts + distance), the
  hamstring-relevant exposure signal. Ties to the hamstring/Anton work without IMA.

### 5. Ingestion fixes (parameters available but not landing)
- **Duration:** OpenField shows Total Time + m/min, but `session_duration_minutes`
  is 0% — we drop it on ingest. Capture it → unlocks all per-minute intensity
  properly.
- **Maximum Velocity:** available in Basic, 0% in our data → ensure it's in the
  export/parser.
- **Velocity Work/Rest Ratio** and **HI Distance:** available in the picker; we may
  have no column — evaluate adding them (work:rest is a useful conditioning metric).

### 6. Heart rate = an upsell, not a tier block
- HR Band Durations, HR Exertion, Red Zone, Avg/Max HR are all in the Core picker.
  0% everywhere (incl. Breiðablik) because **players don't wear HR belts**, not
  because the tier blocks it. Pitch: "want readiness from heart rate too? add HR
  belts and it lights up." Do NOT promise HR until belts are in use.

## What stays Pro S7-only (don't promise Core)
The IMA Driver layer (accel/decel/CoD/jumps from IMA, movement signature, the
directional/clock fingerprint). Core's IMA category is just "IMA Impacts Band 2
Count" — nothing usable.

## Order of work
1. Verify ingest of the Gen2 effort split (`accel/decel_b2_3_tot_effs_gen2`),
   `max_deceleration`, and fix `session_duration_minutes` / `max_velocity` capture.
2. Core-aware branch in `loadVerdict` (braking = decel efforts; sprint = velocity
   band efforts; intensity = PL/min) with confidence degradation.
3. MD-comparison (% of match) computation + Volume/Intensity framing in the verdict.
4. Sprint-exposure tile for Core.
Verify: `npx eslint` per file; sanity-check on Þór (Core) and Grindavík
(Lengjudeild) data; confirm verdicts read sensibly with the reduced signal set.
The user runs the dev server + git.
