# Catapult CTR export → peak-window feed (unblocks #2 flagship)

Confirmed live in OpenField (eu.openfield, Breidablik, Timeline): the **CTR / Session-Summary export carries the
high-speed data and is time-based** — so the "MII only gives distance + player load" limitation is about the MII
*widget*, NOT the CTR export. This is the file that feeds the already-built `peakPeriodContext` alignment engine.

## What the CTR / period export contains (observed)

Per athlete, per **period** (periods are time-based, so each has a start/end): `Avg Dist (m)`, **`Vel B5 Avg
Dist (m)`**, **`Vel B6 Avg Dist (m)`** (high-speed bands), `Max Vel (km/h)`, `Max Vel (% Max)`,
**`HIR Dist (m)`** (high-intensity running distance), `Avg PL`, `Avg HR`, `Acc B2-3 Effs`, `Tot As`,
`Decel B2-3 Effs`, `Tot Ds`, `IMA A Hi`, … Example (this session): Ágúst — HIR 208 m, Vel B5 163, Vel B6 45,
Max Vel 29.2 km/h.

So both things #2 needed are in one file:
- **peak-HSR** = `HIR Dist` (and Vel B5/B6) for the peak window → the Ju-2022 Table-2 score.
- **window clock time** = the period's **start time** → event-time alignment.

## The one config choice (NOT changed — needs coach OK)

- **HSR threshold.** `HIR Dist` uses the account's configured high-speed threshold. Ju 2022 uses **19.8 km/h**.
  If the account threshold differs, set it in **Settings** (or add a custom band) so `HIR` = >19.8 km/h — a
  Settings change the coach makes; Code should **read the threshold from the export/metadata and record it**
  (provenance), and label the benchmark comparison with the threshold actually used.
- **Peak window as a period.** For the *rolling* peak (not just coaching periods), define a custom period at the
  peak window, OR use OpenField's MII/rolling period if present. Either way it appears as a period row with HIR
  + start time. (Coach-side config.)

## Ingest mapping (Code)

Map the CTR CSV → a per-(athlete, match, window) feed the engine consumes:

| CTR column | → peak-window feed field |
|---|---|
| athlete name/id | `player_id` (via `catapult_athlete_map`) |
| period name | `window_label` (e.g. peak-1min / peak-3min / peak-5min, or coaching period) |
| **period start time** | `window_start` (clock) — the alignment key |
| period duration | `window_seconds` |
| **HIR Dist (m)** | `hsr_m` (peak-HSR for the Ju score) |
| Vel B5 / Vel B6 dist | `vb5_m` / `vb6_m` |
| Max Vel (km/h) | `max_kmh` |
| Avg PL, distance | `player_load`, `distance_m` (already have via MII path) |

- New table (or extend `player_load_peak_period` with `window_start`, `hsr_m`, `vb5_m`, `vb6_m`, `hsr_threshold_kmh`).
  Store `source='catapult_ctr'`, threshold, export date (provenance). Idempotent on player+match+window.
- The existing **`peakPeriodContext`** engine already aligns windows to time-stamped events + classifies Ju
  tactical actions; it currently **locks and names the missing feeds**. This supplies feed (2) "window clock
  position". Feed (1) "time-stamped events" still comes from StatsBomb full events (separate brief).

## What each feed unlocks (either alone gives value)

- **This CTR file alone** → the **peak-HSR / Ju Table-2 score** + the peak-window shape with real HSR, and the
  window start times (so once events arrive, alignment is instant). Colours the peak card by position benchmark.
- **StatsBomb full events alone** → tactics-in-window even before peak-HSR (the engine uses coaching-period
  windows). Both together = the full flagship stacked bar (Recovery Run / Support Play / Run-in-behind …).

## Guardrails
- Descriptive/advisory — never touches the readiness colour or daily decision.
- Provenance: HSR threshold used, source, export date; if threshold ≠ 19.8, say so next to the Ju comparison.
- Do NOT change OpenField Settings from Code; the threshold/custom-period is a coach action, read at ingest.

## How to obtain the file (coach, in OpenField)
Timeline → (select the match session) → **Bulk Export CTRs** → downloads a per-period CSV to your computer.
(If it needs an athlete/period selection first, make it, then export.) Hand the CSV to the ingester.
Ref: `docs/tasks/peak-period-context-spec.md`, `docs/tasks/football-peak-period-context-vs-research.md`.
