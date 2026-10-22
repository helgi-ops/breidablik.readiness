# Map the newly-added Catapult reporting parameters → ingest

The coach added these to the OpenField **Reporting_Parameters** group (24 Aug). They flow into MicroPulse only
after a **re-export/re-sync** AND after Code **maps the new fields** in the parser. Some may already land in
`player_external_load_daily.raw_payload_json`, but the flagship-relevant ones need explicit columns.

## The mapping

### A) Peak-window clock position — the direct #2 unlock
- **`MII Player Load Interval 1 / 3 / 5 Start Time` + `End Time`** → `player_peak_window.window_start` /
  `window_end`, one row per window (1/3/5-min). This is the **clock position of the peak window** — feed (2) —
  now straight from MII (no custom CTR period needed). Prefer these over the CTR-derived start when both exist.
- Times are **session-clock** (from activity start). For alignment, also compute
  `window_start_s_from_ko = window_start_s − kickoff_offset_s` (store `kickoff_offset_s` per activity/match,
  coach-confirmable; needed to line up with match/event minute+second).

### B) Peak-window HSR — the Ju Table-2 score
- **`Velocity (Gen 2)` bands** (B5/B6…) at the interval level → `player_peak_window.hsr_m` / `vb5_m` / `vb6_m`
  for that window. Feeds `computePeakBenchmark` (HSR threshold provenance already handled). Confirms/《replaces》
  the CTR HIR value.

### C) Repeated-sprint signal — the movement-proxy classifier (#2) + robustness (#5)
- **`RHIE`** (Repeated High-Intensity Efforts): `RHIE Total Bouts`, `RHIE Efforts Per Bout (Max/Mean/Min)`,
  `RHIE Effort Duration (…)`, `RHIE Effort Recovery (…)`, `RHIE Bout Recovery (…)` → new columns
  (`rhie_bouts`, `rhie_efforts_per_bout_mean`, `rhie_effort_recovery_mean`, …) on the session row (and, if the
  export gives them per-window, on `player_peak_window`). RHIE is the key input for the **multidirectional /
  repeated-sprint archetype** in `peak-window-movement-proxy.md`, and a load-shape signal for #5.

### D) Mechanical / asymmetry — robustness (#5) + Driver axis (#1/#3)
- **`Running Symmetry`, `Running Deviation`, `Running Imbalance`, `Running Series Count`, `Footstrikes`** →
  columns (`running_symmetry`, `running_deviation`, `running_imbalance`, `running_series_count`, `footstrikes`).
  Left/right asymmetry + footstrike volume = an early mechanical-stress signal for the robustness trend alert,
  and sharpens the mechanical/Driver axis of role-demand fit and signature.
- **`Peak Meta Power`** → `metabolic_power_peak` if not already populated (dedupe; it likely maps to the
  existing column).

## Ingest work (Code)
1. **Migration:** add the new columns to `player_external_load_daily` (RHIE / symmetry / footstrikes /
   running_* ) and to `player_peak_window` (`window_end`, `hsr_m`/`vb5_m`/`vb6_m` if missing, per-window RHIE),
   plus `kickoff_offset_s`. Save the `.sql` under `supabase/migrations/`.
2. **Parser:** extend `parseCatapultCtr` (and the daily-load parser) to read the new headers when present;
   fall back to `raw_payload_json` extraction if a field isn't a mapped column yet. Idempotent.
3. **Backfill:** these appear only in *new* exports — to get history, the coach re-processes/re-exports past
   activities; the parser upserts (no dupes).
4. **Wire consumers:** `player_peak_window.window_start/end` → `peakPeriodContext` alignment; velocity bands →
   `computePeakBenchmark`; RHIE + symmetry → the movement-proxy classifier (#2) and the robustness signal (#5).

## Guardrails
- Descriptive only — none of this touches the readiness colour or daily decision.
- Provenance: record HSR threshold, `kickoff_offset_s`, and which params were present per activity.
- Don't fake per-window values from session totals; only populate per-window fields when the export gives them
  per interval.

Ref: `catapult-ctr-peak-window-ingest.md` (feed 2, shipped), `peak-window-movement-proxy.md` (the classifier
that consumes RHIE + bands + window times), `peak-period-context-spec.md`.
