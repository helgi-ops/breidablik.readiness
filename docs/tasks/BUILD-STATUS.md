# BUILD-STATUS — what's shipped vs briefed (living index)

**Purpose.** Close the coordination gap between the planning side (writing briefs in `docs/tasks/`) and the
build side (Code). Twice now a brief has "discovered" something was already built (the strength-consumer of the
deficit ledger; the pose measurement layer). This file is the single place to check **what already exists**
before writing or building, so we start from ground truth instead of re-discovering.

**Protocol (both sides).**
- **Before writing a brief:** read this file first; confirm the feature (or its foundation) isn't already
  shipped. If it is, scope the brief as a *delta*, not a rebuild.
- **After shipping a brief:** Code adds/updates the row here — status, key files, and a one-line "already
  existed?" note. Keep it terse; this is an index, not documentation.
- **Source of truth is the code**, not this file — when in doubt, grep. This file points you at the right files
  fast; it doesn't replace reading them.

Last touched: 2026-09-10 (seeded from the movement-screen / individualisation work). Entries marked ✅ were
verified in code this session; ⏳ = briefed, not yet confirmed shipped.

## Shipped & wired (verified)

| Area | Status | Key files |
|---|---|---|
| **Deficit ledger** (unified individualisation) | ✅ | `supabase/migrations/…_player_deficits_ledger.sql`; `lib/micropulse/unifiedDeficits/{collect,reconcile,strengthPlan,quality,imaSignals,vbtSignals,loadFlags,clinicalAxSignals,rehabTrackSignals}.ts`; `api/coach/deficit-ledger`; `components/coach/UnifiedDeficitLedgerCard.tsx` |
| **Strength-consumer of the ledger** | ✅ | `strengthProgramming/loader.ts` (`fetchLedgerEmphases`), `adaptationRules.ts` (`applyLedgerEmphasisRules` — CONFIRM/ADD, MD-gating, acute-rules-win), tests `__tests__/ledgerEmphasis.test.ts` |
| **Strength engine** (readiness + MD) | ✅ | `strengthProgramming/index.ts` (`buildStrengthSession`); MD from `week_plans` (`fetchMdContext`), verdict from `athlete_decision_history`, wellness from `readiness_entries`; delivery `api/coach/team/send-strength-sessions` (one click, team-wide) |
| **VALD signals** → strength qualities | ✅ (CMJ) | `movementScreen/correctives/valdSignals.ts` — reads `vald_forcedecks_results` (CMJ rsi_mod/eccentric/asymmetry), ForceFrame, NordBord. **IMTP not read yet** (see pending) |
| **Movement screen + Claude vision** | ✅ | `api/coach/movement-analysis` (`analyzeMovementVision` — now advisory/explanation only, not persisted); `movement_screens` table (`findings`/`result`) |
| **Pose measurement layer** (BlazePose 2D) | ✅ | `movementScreen/pose/*` (`analyzePose`, `autoMeasure`), `movementScreen/measurement/index.ts` (`MeasurementProvider` + `mediapipe2dProvider`); `method` provenance on findings (`mediapipe_2d`/`vision_estimate`/`coach`/`onform`) + `measuredConfidence`; pose caps Claude-vision in `interpretScreen`; 102 movementScreen tests green |
| **Corrective library + mapping** | ✅ | `movementScreen/correctives/{registry,mapping,rehabTracks,orthopedicTests,tendonLoading,rehabProtocolLinks}.ts`; corrective send → `player_today_strength_override` (`api/coach/movement-screen/corrective`) |
| **Rehab tracks** (movement-quality) | ✅ | `movementScreen/correctives/rehabTracks.ts` — `acl_knee`, `athletic_groin`, `ankle`, `lumbar_spine`; phased, exit-criteria, stateless (see pending: phase progression) |
| **Low-back track** | ✅ | `ModuleRegion += lumbar` (`lib/rehab/stageTemplates.ts`), `rehabTracks.lumbar_spine`, `/coach/low-back` |
| **Staged-loading rehab modules** | ✅ | `lib/rehab/stageTemplates.ts` (patellar/achilles/adductor/ankle/hamstring, s1–s4, DB-backed, `/coach/<injury>` pages) |

## Pending / briefed, not confirmed shipped (⏳)

| Brief | What it does |
|---|---|
| `one-daily-session-merge-corrective-into-strength-brief.md` | Fix override collision: corrective + strength both upsert `player_today_strength_override` on `(player_id,entry_date)` → merge into one daily session (corrective = movement-prep block). Includes the **source-routing** note (VALD→strength, screen+IMA→corrective) |
| *(IMTP source — in the merge brief)* | Add IMTP peak-force + DSI (CMJ÷IMTP) as a `vald` strength signal → `force_deficit`/`velocity_deficit`; today F-V gap comes only from VBT |
| `rehab-track-phase-progression-brief.md` | Persist rehab-track phase (`rehab_track_progress` + `rehab_phase_events`); clinician-gated advance; re-screen re-anchors but never overwrites; updates ledger status |
| `corrective-isometrics-and-clinician-panel-grouping-brief.md` | Isometric activation options in the corrective library; group the 4 clinician cards under one "Clinician / S&C reference" header |
| `movement-screen-pose-estimation-mediapipe-brief.md` | ✅ **Shipped** (delta only — layer already existed). Deferred: vision→finding auto-convert, pose-math for poseMeasurable catalogue tests, CDN→npm for `@mediapipe/tasks-vision` |

## "Already existed" log (why this file exists)

- **Strength-consumer of the ledger** — briefed as "to build"; was already implemented (`applyLedgerEmphasisRules`).
  The brief was re-scoped to the real gap (override collision).
- **Pose measurement layer** — briefed as new; the BlazePose→autoMeasure path already existed. Code shipped only
  the thin interface + `method` provenance + confidence capping (a true delta).

Lesson: verify build-state (grep the relevant `lib/micropulse/...` dir) before writing "build X"; most core
plumbing exists — briefs should usually be *deltas*.
