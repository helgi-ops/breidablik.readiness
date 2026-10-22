# MicroPulse — implementation roadmap (gaps → sequence)

One prioritised plan tying together the briefs written this cycle. Sequenced by **dependency** and
**value**, so nothing is built out of order. Reconcile against current repo state before starting
(the repo is under active parallel development).

## Current state (verified this cycle)
- **Shipped & solid:** readiness decision layer, GPS load, VALD integration, fusion #1 (role-demand
  fit), #3 (signature), #4 (form-vs-state V2), #2 Catapult movement-signature path (engine + route +
  card), explainability framework, plan/data-tier gating, pilot contract v6 + founder pricing.
- **Briefed, not built:** everything below.
- **Not started / no brief yet:** proactive delivery (automated digest/alerts), a systematic
  verdict-accuracy validation pass.

## The cross-cutting discipline (applies to every phase)
Every new signal must clear the **flag-rate / smallest-worthwhile-change gate** before squad-wide
enable (the lesson behind the readiness over-sensitivity and task #16). Descriptive/advisory only;
**never touch `readiness_entries.color` / `v_coach_readiness_today_v8.final_color`**; confidence +
provenance on everything; English default, IS toggle.

---

## Phase 0 — Quick trust win — ✅ ALREADY RESOLVED (verified 31 Aug)
**Readiness low-variance over-sensitivity.** The colour engine `mp_set_baseline_z_before_pi` **already
has an SD floor of 1.5** (`z = (total − mean) / greatest(sd, 1.5)`) plus level bands (green > -0.5,
yellow > -1.0, else red), deployed ~30 Aug (only 83/2893 recent rows carry `baseline_sd_floor` yet).
And `mp_apply_performance_intelligence` already has the -3-point absolute floor on `pi_sustained_low`.
So Anton Logi's reds are pre-floor history (his rows have `baseline_sd_floor: null`); going forward
total 20 → z ≈ -0.81 → yellow, total 21 → green. **No code change needed.** Optional-only: a one-time
backfill/recompute of historical rows (user declined). The over-sensitivity brief is superseded.

## Phase 1 — The linchpin infrastructure
**`coach_signals` cache + first Today chip.** A small table + nightly writer + chip renderer inside the
existing Today surfaces (`TodayCommandCenter` / `DecisionSummaryCard` / attention list). This is the
single dependency under both remaining tracks — it turns analytical engines into background signals and
unlocks the whole IA consolidation. Ship the pipeline end-to-end with ONE already-built engine
(`form_vs_state`) as the proof.
→ `coach-signals-cache-and-today-chips-brief.md`

## Phase 2 — Finish the flagship direction (#5), now that Phase 1 exists
**Robustness / injury early-warning.** Engine inputs already added (running-asymmetry, RHIE, CMJ). Build
the `cmjFatigue` slope engine (Hader expected-recovery), assemble `robustnessWatch` as a `coach_signals`
adapter + chip (free, once Phase 1 is done), and run the validation harness (flag-rate gate) before
enabling.
→ `robustness-injury-early-warning-spec.md`

## Phase 3 — Coaching-value signals (parallel-able, each a coach_signals adapter)
- **RPE vs MD-day (× match minutes) expectation flag** + yesterday-RPE chip on Decision Summary —
  catches "intensity didn't land as planned" and missed top-ups for non-players.
  → `rpe-md-day-expectation-flag-brief.md`
- **HR Intelligence v2** — HRex submaximal fitness test (the real new value) + match-intensity anchor +
  HRV recovery-trend chip.
  → `heart-rate-intelligence-thresholds-brief.md`

## Phase 4 — IA / navigation simplification (mostly independent; do alongside)
Collapse 73 pages toward ~15 destinations. Lowest-risk first (pure IA, no logic):
1. Rehab hub (5→1) — **already shipped this cycle.**
2. Team Planning `?tab=` prune — **already shipped this cycle.**
3. Programme library (6→1) → `programme-library-consolidation-brief.md`
4. Performance Monitoring dissolution (→ Today/Player-hub/Assessments) → `performance-monitoring-dissolution-brief.md`
5. Team Planning full prune (availability→Monitoring; chips) → `team-planning-prune-brief.md`
6. Load Monitoring Intelligence hub (8→1) → `load-monitoring-intelligence-consolidation-brief.md`
7. Retire `player-stats`.
The chip-dependent moves (game-plan-fit, post-training, load/decel/etc.) land as Phase 1's `coach_signals`
ships. Full audit + target sidebar: `coach-pages-audit-background-vs-destination.md`.

## Phase 5 — Data feeds & depth (unblock when data/keys arrive)
- **Catapult re-sync/backfill** so the new params (RHIE, running-symmetry, MII windows) flow — api.ts
  request gap already fixed; needs a backfill run. → `catapult-new-params-mapping.md`
- **StatsBomb events** (manual export, no API key) → tactical peak-period layer. Parked.
  → `statsbomb-events-manual-ingest.md`
- Gate the movement-signature (#2) / #5 IMU cards for `lite` (Vector Core) clubs so they don't show
  empty — small polish. → `vector-pro-vs-core-data-tiers.md`

## Correction (verified 31 Aug) — proactive delivery is ALREADY BUILT
The automated layer exists and is scheduled: `/api/notifications/cron` (full Vercel cron) invokes
`runCoachMorningDigest`, `runThresholdAlerts`, `runWeeklyReports` (Friday ~15:00 email — deterministic
PRO rollup + AI narrative ELITE, via `sendTransactionalEmail`, opt-in, deduped), plus daily nudges +
push (`sendDailyNudge`, `push.ts`, `playerPush.ts`). So proactive delivery is NOT a gap. `coach_signals`
(Phase 1) remains valuable for the **on-Today chips + IA drill-down destinations**, not for push (which
already works).

## Genuinely still open
- **`coach_signals` cache + Today chips** (Phase 1) — for on-page surfacing + IA consolidation.
- **#5 robustness** — finish (`cmjFatigue`, `robustnessWatch`, validation harness).
- **IA consolidations** (programme-library, performance-monitoring, load-monitoring, team-planning full).
- **Data feeds** — Catapult backfill; StatsBomb events (parked).
- **Verdict-accuracy validation pass** — systematic flag-rate review across engines. Cross-cutting.

## Recommended order (if picking three)
1. **Phase 0** (readiness fix — trust, self-contained).
2. **Phase 1** (`coach_signals` — unlocks the most).
3. **Phase 2** (#5 on top of Phase 1).
IA (Phase 4 steps 3–7) can proceed in parallel since they're low-risk and mostly independent.

Ref: all briefs under `docs/tasks/`, `fusion-layer-strategy.md`, CLAUDE.md (canonical colour, migration
+ validation discipline).
