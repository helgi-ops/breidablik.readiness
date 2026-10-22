# Code handoff — execute the roadmap

Directive for Claude Code to finish the MicroPulse roadmap. Full rationale + sequencing:
`implementation-roadmap.md`. Each step has a grounded brief (linked). Build in this order.

## Non-negotiables (every step)
- **Never write `readiness_entries.color` / `v_coach_readiness_today_v8.final_color`.** All new signals
  are descriptive/advisory, beside the colour, never it (CLAUDE.md principle #1).
- Every signal: verdict → 2–3 plain facts → confidence, with detail behind a click. Cite the paper.
- English default, IS toggle: `const [lang] = useLang(); const isEN = lang !== "IS";` (never object-
  destructure `useLang()`).
- Any DB change → also save the `.sql` under `supabase/migrations/` (timestamped). Stage specific files
  only; branch checkpoints are the user's.
- Before enabling any new flag squad-wide, run the flag-rate gate (harness in
  `readiness-flag-rate-validation-findings.md`). Tune for specificity.
- `npx eslint` touched files; don't add new lint errors.

## Already done this cycle (do NOT redo)
Rehab hub (5→1); Team Planning `?tab=` prune; readiness SD-floor (live in `mp_set_baseline_z_before_pi`);
Catapult api.ts param-request fix; fusion #2 movement-signature path; proactive delivery (cron digest +
weekly report + alerts + push) — all shipped.

## Execution order

### 1. `coach_signals` cache + first Today chip  ← START HERE
The linchpin. → `coach-signals-cache-and-today-chips-brief.md`
**Done when:** `coach_signals` table + nightly writer exist; `form_vs_state` surfaces as an exception-
gated chip inside the Today attention rows / DecisionSummaryCard; flag-rate validated on the 23-player
squad; zero colour writes in the diff.

### 2. Finish #5 robustness (as a coach_signals adapter)
→ `robustness-injury-early-warning-spec.md` (engine inputs already added).
**Done when:** `cmjFatigue` slope engine built; `robustnessWatch` emits a labelled trend-alert chip via
`coach_signals`; validation harness passes the flag-rate gate before enable.

### 3. Coaching-value signals (each a coach_signals adapter; parallel-able)
- RPE × MD-day (× match minutes) expectation flag + yesterday-RPE chip on Decision Summary →
  `rpe-md-day-expectation-flag-brief.md`
- HR Intelligence v2 — HRex submaximal test + match-intensity anchor + HRV recovery-trend chip →
  `heart-rate-intelligence-thresholds-brief.md`
- Check-in reliability signal (two-tailed variance) → `checkin-reliability-signal-brief.md`

### 4. IA consolidation (low-risk, mostly independent — do alongside)
Programme library (6→1), Performance Monitoring dissolution, Load Monitoring hub (8→1), Team Planning
full prune, retire `player-stats`. Target sidebar + per-page mapping:
`coach-pages-audit-background-vs-destination.md` (+ the individual consolidation briefs). Chip-dependent
moves land as step 1 ships.

### 5. Data feeds
Catapult re-sync/backfill so RHIE / running-symmetry / MII windows flow → `catapult-new-params-mapping.md`.
StatsBomb events (manual export, parked) → `statsbomb-events-manual-ingest.md`. Gate #2/#5 IMU cards for
`lite` (Vector Core) clubs → `vector-pro-vs-core-data-tiers.md`.

## The 80/20
Steps 1 + 2 deliver most of the value (adoption + the injury-prevention differentiator). Do them first;
3–5 are depth and polish.
