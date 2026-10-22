# Brief — Move 2: readiness / load / deficit-aware football session builder (pitch-session fusion)

North-star Move 2 (`unified-player-model-north-star.md`). The football/pitch session builder is the biggest
remaining silo: `autoSessionBuilder/*`, `sessionWorkflow/*`, `footballDrills/recommend.ts`,
`api/team/training-sessions` have **no** reference to `unifiedDeficits`, `PlayerStrengthSnapshot` or
`DailyAthleteSnapshot` — yet the drills are **already fully load-quantified** (`drill_library` carries measured
`distance_m`, `vel_b5/b6`, `hir_total`, `player_load(_per_min)`, `accel/decel_b23`, `metabolic_power_*`,
`hmld_m`, `high_ima`, `jump_count`, `ima_cod_total`). So making the pitch session data-aware is unusually
feasible — the data is there, it just isn't connected. This is also the most visible differentiator vs
monitoring/selection-only competitors: MicroPulse **shapes the actual training**, not just the dashboard.

Screening / training support — coach keeps the final word; descriptive; never the readiness colour; the
performance/readiness/medical walls stay as access rules; pain/red-flags → clinician.

## What to build (four slices, staged)

### Slice 1 — MD-target load matching (safe first slice; uses only existing data)
As the coach adds drills, **sum the planned session load** from `drill_library` (distance, HSR `vel_b5/b6`,
accel/decel, `player_load`, metabolic) and compare against the **day's target** for the team's MD context
(from `week_plans` / periodization + train-like-you-play match demands). Show, per KPI, "planned = 85% of the
MD-4 HSR target" with under/on/over bands. Pure computation over data already in the system; no new inputs.

### Slice 2 — per-player readiness caps
Pull each player's readiness verdict (`DailyAthleteSnapshot` / the canonical readiness view — read-only, never
re-derived). Yellow/red players get **per-player modifications** flagged on the team session: trim their
minutes, or swap a high-HSR/high-decel drill for a lower-load variant, using the drill load profiles to pick
the swap. One team session, per-player load caps — the on-pitch analogue of the individualised strength send.

### Slice 3 — deficit-aware warm-up
Inject each player's **corrective block** (from the reconciled deficit ledger — the same `planCompensations`
the corrective consumer already builds) into the session's warm-up/activation slot, so individualised prehab
rides the team warm-up. De-duplicate against what the session already trains (CONFIRM vs ADD, as the strength
engine does).

### Slice 4 — train-like-you-play → drill recommendation + close the loop
Use `train-like-you-play` (each player's under-exposure to a match demand) + the load-profiled drill library to
**recommend drills that close each player's specific gap** ("under-exposed to high decel → these 3 drills load
decel"). Extend `footballDrills/recommend.ts` to read the gap + deficit context. Then **close the loop**:
after the session, `loadPlan/plannedVsActual` compares the *planned* (drill-summed) load vs *actual* GPS →
recalibrate this team's drill load estimates over time (drills are averages; real exposure varies by team).

## Explainability + boundaries
- Every suggestion is traceable: a readiness cap cites the verdict + signals; a drill recommendation cites the
  train-like-you-play gap; a load-match cites the MD target. Coach can override any of it; overrides logged.
- **Never the readiness colour** (`v_coach_readiness_today_v8.final_color` stays canonical); the pitch builder
  *reads* readiness, never writes it. Performance/readiness/medical stay walled as read-only views.
- Injured players (injury/RTP status) are excluded from the team pitch load and routed to their rehab plan.
- Load estimates are averages, flagged as such (screening-grade), refined by the plan-vs-actual loop.

## Acceptance
- The pitch session builder (`SessionBuilderCard` / `autoSessionBuilder` / `api/team/training-sessions`) computes
  **planned session load from `drill_library`** and shows it against the MD-context target (per KPI, under/on/over).
- **Per-player readiness caps** appear on the team session for yellow/red players (trim minutes / swap high-load
  drills), read-only from the readiness view; injured players excluded and routed to rehab.
- **Deficit correctives** inject into the warm-up from the reconciled ledger (CONFIRM/ADD dedupe); **drill
  recommendations** close each player's train-like-you-play gap.
- **plannedVsActual** compares drill-summed planned load vs actual GPS and updates this team's drill load
  estimates. Every item traceable (readiness/deficit/target source); coach override wins; descriptive only —
  never the readiness colour; walls preserved. EN default / IS toggle. Lint + typecheck clean; five-question
  check passes. Slice 1 shippable independently.

Ref (real files): `drill_library` (load columns), `autoSessionBuilder/*`, `sessionWorkflow/*`,
`footballDrills/recommend.ts`, `components/coach/SessionBuilderCard.tsx`, `api/team/training-sessions/route.ts`,
`periodization/loader.ts` + `week_plans` (MD target), `train-like-you-play` (`app/coach/train-like-you-play`),
`domain/snapshot/buildSnapshot.ts` + `v_coach_readiness_today_v8` (readiness, read-only),
`unifiedDeficits/{collect,reconcile,strengthPlan}.ts` + `api/coach/movement-screen/corrective` (`planCompensations`),
`loadPlan/plannedVsActual.ts` + `drillActuals/*` (the loop). Parent: `unified-player-model-north-star.md`
(Move 2), `BUILD-STATUS.md`.
