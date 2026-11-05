# Scope — W′-balance preview for a prescribed team HSR drill

**Status:** scoped, NOT built. Candidate feature direction from
*Buchheit, Vassallo & Waldron (2021), "One box-to-box does not fit all — insights from running
energetics," SPSR 136.* Descriptive planning only — never reads/writes `readiness_entries.color` /
`v_coach_readiness_today_v8`, and makes no injury-prediction or tissue-load claim.

## The problem the paper names (and why it's ours)
A **fixed** team HSR drill (everyone runs the same box-to-box) produces very different *internal* cost
per player — the paper models W′-remaining from ~65% (Fit-Fast) down to ~27% (Less-Fit-Slow) on the
identical external drill. Individualising the run distance by locomotor profile homogenises it
(all ~40% W′-remaining). **HSR distance is not internal load** — the external numbers looked similar
while the internal divergence was large. This is the "manage the individual within the team / starters
vs subs" aim MicroPulse already pursues (substitute-compensation, MD+1 top-ups).

## What MicroPulse already has (reuse, don't rebuild)
- **Critical Speed / D′ engine** — `src/lib/micropulse/playerAnalysis/criticalSpeedSignals.ts`
  (CS/D′ per player from the Power Curve).
- **ASR / locomotor profile** — MAS/MSS → anaerobic speed reserve; V_IFT where available
  (`positionFitnessRequirements.ts`, `athleteProfile.ts`, Power Curve / player physical story).
- **HSR monitoring + Week-Setup HSR drills** — `/coach/hsr-intelligence`, Week Setup.
- **Substitute-compensation / MD+1 top-up logic** — the existing "bring <60′ players to the weekly
  target" path ([[md1-minutes-aware]], plannedSessionLoad/gameDensity).

So the modelling inputs (CS, D′/W′, MAS, MSS, ASR, V_IFT) are largely already derived — the feature is a
**preview that composes them for a prescribed drill**, not a new measurement pipeline.

## Proposed feature (MVP)
Given a coach-prescribed fixed team HSR drill (work distance/speed/reps × rest — e.g. a box-to-box or an
HIIT set in Week Setup), compute a **W′-balance preview per player**:
1. Model the drill's over-ground mechanical power demand from the prescribed speed (di Prampero / the
   paper's GPS→power approach already cited in-app for peak power).
2. Integrate W′ depletion/reconstitution across the reps from each player's CS/W′ (CP model, W′-BAL —
   Skiba integral), producing **W′-remaining % at drill end** per player.
3. **Flag** players the fixed drill will **over-load** (W′-remaining below a band, e.g. <~30%) or
   **under-load** (e.g. >~55% → not a real HIIT stimulus for him), and optionally **suggest an
   individualised distance** that lands each player near a target W′-remaining (~40%, the paper's
   homogenised figure — tunable, not hard-coded from the n=4 model).

### Explainability-first (per manifesto + `docs/explainability-first.md`)
- **(0)** one-line verdict: "This fixed drill over-loads 2, under-loads 3 — individualise or accept the spread."
- **(1)** 2–3 plain facts per flagged player: his CS/ASR tier, predicted W′-remaining, the suggested distance.
- **(2)** Show-details: the W′-BAL curve, CS/D′ inputs, the model + citation (Buchheit 2021; Skiba W′-BAL).
- Confidence gated on CS/D′ maturity (needs a real Power Curve); self-hides for players without a profile.
- Rules compute, AI only explains. Descriptive — **never** the readiness colour, **no** injury claim.

## Boundaries / honesty
- The paper is a **modelling case-study on 4 simulated profiles**, not measured outcomes; W′/energetics
  are **GPS-derived estimates, not lab-validated per player**. Frame the preview as an estimate/planning
  aid, cite the model, and never present a W′ number as measured truth.
- **Verification debt:** before any exact figure from the paper is shown, confirm against the PDF
  (Table 2 W′-BAL per profile per drill; Fig 1 drill prescriptions). See [[spsr-box-to-box-citation]].

## Out of scope (for this MVP)
- Live in-session W′ tracking / wearable streaming.
- Any injury-risk output.
- Auto-editing the prescribed drill (preview + suggestion only; coach decides).

## Likely files (when built)
- NEW `src/lib/micropulse/playerAnalysis/wprimeBalance.ts` (pure W′-BAL integral + drill power model;
  unit-tested, deterministic) reusing `criticalSpeedSignals`.
- NEW endpoint `src/app/api/coach/hsr-drill-preview/route.ts` (team-scoped, nodejs).
- NEW card on `/coach/hsr-intelligence` (and/or Week Setup HSR-drill) — picker for the prescribed drill +
  per-player W′ preview table + verdict.
- REUSE CS/D′, ASR, Power Curve, substitute-compensation; no new ingestion.
