# North-star — the unified player model: every surface a view onto one reconciled understanding

**Framing (read first):** this is *not* a greenfield "build data fusion" project. MicroPulse already does a lot
of cross-domain fusion. The north-star is **convergence + extension + closing the loops** on what exists — turning
four parallel per-player objects into one shared core, reaching the siloed surfaces, and feeding actuals back.
The deliberate performance / readiness / medical **walls are preserved** — unification means one shared data
substrate with *governed views*, never collapsing the safety boundaries.

## Where we are today (grounded — credit the real architecture)

There is **no single all-domain player entity**. There are **four parallel per-player objects**, each scoped to
one surface, each re-loading overlapping data, plus fusion lenses:

1. **Deficit ledger — `ReconciledDeficit[]`** (`unifiedDeficits/{collect,reconcile,quality,strengthPlan}.ts`).
   The only object literally designed as cross-source reconciliation: **9 sources** write to it (screening form,
   pose screen, region assessment, VALD, IMA/GPS, VBT, IMTP, clinical Ax, rehab track, + persisted/overrides).
   **Reaches only 2 consumers: strength + corrective.**
2. **`PlayerStrengthSnapshot`** (`strengthProgramming/{types,loader,adaptationRules}.ts`). The **widest fusion**
   (~12 domains: readiness verdict, GPS sprint/CoD/decel, VALD, wellness, injury, VBT, Foster load, congestion,
   ledger emphases, movement correctives). Drives the individualised strength session.
3. **`DailyAthleteSnapshot`** (`domain/snapshot/buildSnapshot.ts` → `domain/decision/buildDecision.ts`). Fuses
   subjective + recovery/autonomic (WHOOP) + load (ACWR) + external load + neuromuscular (CMJ/IMTP) + context,
   each with `sourceStatus` + `overallSnapshotConfidence`. Drives the readiness colour/verdict.
4. **`TotalPlayerAnalysis`** (`playerAnalysis/*`, `TotalPlayerProfile.tsx`). Performance-only two-axis hub
   (footballer StatsBomb × athlete GPS/VALD/VBT) with rule-based cross-links. **Deliberately walled** from
   readiness/load/medical.

Fusion lenses already shipped: `gamePlanFit` (role demand × opponent × capacity × readiness), `robustnessWatch`
(injury early-warning, rule-based, never a single probability), `decision/engine.ts`, `signalPack`
(the cited-counterfactual explainability spine).

## The real gaps (what "unified" actually requires)

1. **Four parallel objects, no shared core.** The ledger, `PlayerStrengthSnapshot`, `DailyAthleteSnapshot` and
   `TotalPlayerAnalysis` each re-load overlapping domain data for one surface. No canonical per-player entity
   they all derive from.
2. **The ledger reaches only strength + corrective.** Periodization, the pitch session, RTP and the readiness
   decision do not read it.
3. **The football/pitch session builder is fully siloed** (`autoSessionBuilder/*`, `sessionWorkflow/*`,
   `footballDrills/recommend.ts`, `api/team/training-sessions`): no reference to `unifiedDeficits`,
   `PlayerStrengthSnapshot` or `DailyAthleteSnapshot`. Yet drills are already load-quantified (`drill_library`
   carries measured distance/HSR/accel-decel/player-load/metabolic/IMA). Biggest single silo, and the easiest
   high-value win because the data is already there.
4. **Learning loops are open, not closed.** `loadPlan/plannedVsActual.ts` (plan vs actual GPS), `drillActuals/`,
   re-screen trend and `robustnessWatch` all *read* — but nothing feeds actuals back to recalibrate model
   confidence, thresholds, or deficit statuses over time.

## The north-star

**One canonical per-player context the four objects derive from, extended to every surface, with the safety
walls kept as access rules — not as reasons to duplicate data.**

### Move 1 — a shared player-context core (converge the four loaders)
Introduce one server-side `buildPlayerContext(playerId, date)` that loads each domain **once** (readiness,
external load, force-plate/VBT, movement/deficit ledger, injury/RTP, tactical/role, conditioning, HR) with
per-source `status` + `confidence`, and expose **governed views** onto it: `readinessView`, `strengthView`,
`performanceView`, `medicalView`. `PlayerStrengthSnapshot`, `DailyAthleteSnapshot` and TPA become **views**, not
independent re-loaders. The walls (performance ⊥ readiness ⊥ medical) become **view-access rules** on one
substrate, preserving the manifesto guarantee (never surface the ledger/medical as the readiness colour).

### Move 2 — reach the siloed surfaces (pitch session first)
Make the **football session builder** read the shared context: because `drill_library` is load-quantified and
periodization/MD sets the day's target, the builder can **sum planned session load vs the MD target**, apply
**per-player readiness caps** (yellow/red → trim minutes / swap high-HSR drills), inject the **deficit
corrective as the warm-up block**, and use `footballDrills/recommend` + the deficit ledger to **recommend drills
that close each player's train-like-you-play gap**. Then extend the ledger to periodization (block emphasis) and
surface it (read-only, labelled) in RTP.

### Move 3 — close the learning loops
Feed actuals back: `plannedVsActual` → recalibrate this club's **drill load estimates** and the load model;
re-screen results → promote/resolve **deficit-ledger statuses** (already specced in the rehab-phase-progression
brief); prediction vs outcome → tune `robustnessWatch` **confidence**, never a black-box probability. The model
gets measurably better per club — which is also the pilot's measurable-value story.

## Preserve (non-negotiable)
- Performance / readiness / medical stay **walled as views**; the ledger is descriptive and **never the
  readiness colour** (`v_coach_readiness_today_v8.final_color` remains canonical).
- Rules decide; AI explains; every fused item keeps **source + confidence + citation**; coach overrides logged.
- Pain / red flags → clinician; movement findings are hypotheses; no single injury probability.

## Why this is the differentiation + the R&D novelty
Competitors are single-source (Catapult=GPS, VALD=force plates), black-box predictors (Zone7), or enterprise
dashboards for staffed clubs. The hard, novel technical problem — and MicroPulse's moat — is **fusing
heterogeneous, variably-complete, multi-domain data into one reliable, explainable per-player model that every
product surface is a governed view onto.** This north-star *is* that thesis, made concrete; each move is a
citable R&D work-package (Sproti/Vöxtur) and each closed loop is measurable pilot evidence.

## Staging
1. `buildPlayerContext` core + refactor `PlayerStrengthSnapshot` / `DailyAthleteSnapshot` to views (no behaviour
   change — pure convergence, safe first step).
2. Pitch-session builder reads context: MD-target load matching + readiness caps + corrective warm-up +
   deficit-gap drill recommendations.
3. Extend ledger to periodization + RTP (read-only surfacing).
4. Close the loops: plannedVsActual → drill/load recalibration; re-screen → ledger status; robustness → confidence.

Ref (real files): `unifiedDeficits/{collect,reconcile,quality,strengthPlan}.ts`,
`strengthProgramming/{types,loader,adaptationRules}.ts`, `domain/snapshot/buildSnapshot.ts`,
`domain/decision/buildDecision.ts`, `decision/engine.ts`, `playerAnalysis/{athleteProfile,totalPlayerAnalysis}.ts`,
`components/coach/TotalPlayerProfile.tsx`, `api/coach/{total-player-analysis,deficit-ledger}/route.ts`,
`gamePlanFit/index.ts`, `robustnessWatch/index.ts`, `loadPlan/plannedVsActual.ts`, `drillActuals/*`,
`autoSessionBuilder/*`, `footballDrills/recommend.ts`, `api/team/training-sessions/route.ts`,
`periodization/loader.ts`, `drill_library` (load columns). Related briefs:
`unified-individualisation-engine-deficit-ledger-spec.md`, `one-daily-session-merge-corrective-into-strength-brief.md`,
`rehab-track-phase-progression-brief.md`, `BUILD-STATUS.md`.
