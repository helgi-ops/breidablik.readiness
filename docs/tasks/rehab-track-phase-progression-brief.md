# Brief — persisted phase progression for the movement-quality rehab tracks

**Goal:** make the rehab tracks (`rehabTracks.ts` — ACL/knee, groin, ankle, low-back) actually **walk a player
forward** between screens, instead of only re-computing an entry phase from the latest movement screen. Today
`rehabTrackForCompensations()` is a **stateless pure function**: a new screen re-anchors where the player would
*enter*, but there is nowhere that records "this player is in Phase 3, cleared the Phase 2 gate on <date>." The
exit criteria are displayed for the clinician to judge, but meeting one advances nothing. This adds a **persisted,
clinician-gated, logged** progression layer over the existing (unchanged) track definitions.

Rehab-support / training only — **never a diagnosis, never a clearance, never the readiness colour**. Nothing
auto-advances; the treating clinician gates every step and clears return-to-play. Pain / red flags → clinician.

## The gap (precisely)

- `rehabTrackForCompensations(compKeys)` recomputes track + entry phase + which phases are "indicated" from the
  screen's anchor compensations. Pure module, no DB (per its header).
- Consumed in exactly one place: `src/app/api/coach/movement-screen/corrective/route.ts:210`.
- `current_phase` persistence exists **only** for the strength programmes (pt-explosive, explosive-power,
  starter-templates) — **not** for these movement-quality tracks.
- Result: within-track progression (Phase 2 → 3 → 4 as gates are met) lives only in the clinician's head; a
  re-screen re-anchors the entry and would silently discard any progression.

## Data model (new — persisted state + audit log)

**`rehab_track_progress`** — one active row per player × track:

- `id`, `team_id` (FK), `player_id` (FK), `track_key` (`acl_knee | athletic_groin | ankle | lumbar_spine`),
- `current_phase_key` (matches a `RehabPhase.key` in `rehabTracks.ts`),
- `status` (`active | paused | completed | discharged`),
- `entered_current_phase_at` (date), `started_at`, `updated_at`,
- `note`, `created_by` (FK profiles). RLS: same `coach_team_ids() or is_staff()` pattern as `player_deficits`.
- One active track per player enforced app-side (a player can complete one and start another).

**`rehab_phase_events`** — the audit trail (manifesto: overrides/advances logged with a reason):

- `id`, `progress_id` (FK), `player_id`, `track_key`, `from_phase_key`, `to_phase_key`,
- `action` (`enter | advance | regress | criterion_met | discharge | pause | resume`),
- `criteria_met` (text[] — which `ExitCriterion` labels were judged met), `reason` (text, required for
  advance/regress/discharge), `decided_by` (FK profiles — the clinician/coach), `event_date`, `created_at`.

Migration saved as `supabase/migrations/<timestamp>_rehab_track_progress.sql` (per CLAUDE.md).

## Behaviour

**Advance / regress (clinician-gated).** On the rehab-track card, the current phase shows its exit criteria as
checkable gates. When the clinician judges them met, an **"Advance to <next phase>"** action writes a
`rehab_phase_events` row (`advance`, the criteria ticked, a required reason) and updates
`rehab_track_progress.current_phase_key`. **Nothing auto-advances** — the button is the only path, criteria are
never auto-evaluated as "met." Regress works the same way (e.g. a flare-up). Discharge closes the track.

**Re-screen reconciliation (the important rule).** A new movement screen still recomputes the *recommended*
entry phase, but it **must not overwrite** the tracked `current_phase_key`. Instead, when they diverge, surface
it as a labelled flag on the card: e.g. *"Latest screen suggests Phase 2; player is tracked at Phase 3 — review."*
The clinician reconciles (accept the screen's re-anchor, or keep the tracked phase). This protects real
progression from being wiped by a routine re-screen, while still using the screen as fresh evidence.

**View layer.** Extend `RehabTrackView` / `rehabTrackForCompensations()` to *overlay* persisted state without
changing the definitions: add `trackedPhaseKey`, `trackedStatus`, `screenRecommendedPhaseKey`,
`divergesFromScreen: boolean`, and per phase a `reached: boolean` + `isCurrent: boolean` (alongside the existing
`indicated` / `isEntry`). If no progress row exists yet, the screen's entry phase seeds the first `enter` event
(clinician confirms) — that's the hand-off from stateless recommendation to tracked progression.

## Ties to the deficit ledger (close the loop)

- Entering / advancing a track's phase is a **provenance event** for the unified engine: when a phase gate is
  judged met (`criterion_met` / `advance`), the corresponding ledger deficit can move `hypothesis → confirmed`
  or, on `discharge` of a resolved deficit, `→ resolved` — written from `rehab_track` as the source, with the
  clinician as scorer. (Per the deficit-ledger spec's source table, `rehab_track` is already a listed source.)
- The rehab-track progression thus becomes the mechanism that *updates* the ledger over time, not just a
  read-out of a single screen — the re-test/adapt loop the unified spec describes.

## Explainability (five-question check)

- **Verdict at a glance:** the card leads with the current phase + status (e.g. "Phase 3 · Plyometric / SSC —
  active"), then the 2–3 gates remaining to advance, then detail behind a toggle.
- **Why + confidence:** each phase shows its King-principle focus and the exit criteria with citations
  (`pending` flags preserved for un-extracted CPG thresholds).
- **Override + audit:** advance/regress/discharge are clinician actions, logged with a reason
  (`rehab_phase_events`) — the manifesto's audit trail.
- **Never the colour:** progression is descriptive and separate from `v_coach_readiness_today_v8.final_color`.
- Divergence between screen recommendation and tracked phase is shown, never silently resolved.

## Acceptance

- `rehab_track_progress` + `rehab_phase_events` tables exist (migration saved under `supabase/migrations/`),
  RLS matching `player_deficits`.
- A player can be **entered** into a track (seeded from the screen recommendation, clinician-confirmed) and
  **advanced / regressed / discharged** only via explicit clinician actions, each writing a logged event with a
  reason. **Nothing auto-advances**; criteria are never auto-evaluated as met.
- A **new screen re-anchors the recommendation but never overwrites** the tracked phase; divergence is surfaced
  as a review flag.
- The rehab-track card shows current phase + status, gates-to-advance, reached/current phase markers, and the
  screen-vs-tracked divergence; `rehabTrackForCompensations()` overlays state without changing the track
  definitions in `rehabTracks.ts`.
- Advancing/discharging updates the linked **deficit-ledger** row (`hypothesis → confirmed → resolved`, source
  `rehab_track`, clinician scorer). Descriptive only — never the readiness colour; pain / red flags → clinician;
  the low-back red-flag gate remains prominent. EN default / IS toggle. Lint + typecheck clean; five-question
  check passes.

Ref: `src/lib/micropulse/movementScreen/correctives/rehabTracks.ts` (REHAB_TRACKS, `rehabTrackForCompensations`,
ExitCriterion, RehabTrackView), `src/app/api/coach/movement-screen/corrective/route.ts` (the one caller),
`src/components/movement/RehabTrackCard.tsx`, `unified-individualisation-engine-deficit-ledger-spec.md`
(rehab_track as a ledger source; the re-test/adapt loop), `player_deficits` migration (RLS pattern),
`docs/explainability-first.md`. Contrast: the strength-programme `current_phase` persistence
(pt-explosive/starter-templates) and the DB-backed staged-loading modules (`stageTemplates.ts`, s1–s4) — this
brief gives the movement-quality tracks their own, lighter, clinician-gated progression state.
