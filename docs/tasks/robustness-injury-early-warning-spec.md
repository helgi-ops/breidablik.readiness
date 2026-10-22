# Robustness / injury early-warning (#5) — grounded build spec

**Direction #5 of the fusion-layer strategy.** The highest-value, highest-discipline one. The research is
explicit (see `docs/research/ai-ml-papers-assessment.md`): at ~25-player scale a black-box injury classifier
**over-flags** (Haller 2023: recall 25%, precision 11%, κ=0.14; Leckey 2024: clinical relevance "questionable").
**So we never ship a single injury-probability number.** We surface the *signals* — personal-norm, cited,
confidence-rated, each with a counterfactual — as a **labelled "robustness watch" trend alert that sits NEXT TO
the readiness colour and never becomes it.**

This is mostly **composition, not greenfield.** The engines already exist. Scope = (1) add the new mechanical
inputs, (2) add a CMJ-slope / expected-recovery signal, (3) assemble a labelled surface, (4) validate against
over-flagging.

## Reuse (do not rebuild)
- **`src/lib/micropulse/injuryRisk/`** (`rules.ts` + `index.ts` `buildInjuryRiskDecision`) — the canonical,
  cited additive rule engine. Its `InjuryRiskInput` already models ACWR, z/Δz, volatility, decel-burden,
  accel:decel, HID decline, residual MLI/decel bands, global-fatigue, VALD hamstring/groin/neuromuscular flags,
  sleep/soreness personal-z + chronic-low. **This is the core of #5.**
  - **Deprecate the duplicate:** `src/lib/micropulse/risk/injury.ts` (legacy `buildInjuryRiskDecision`). Point
    its consumers (`performanceIntelligence/riskModel.ts`, `playerDecision/index.ts`) at `injuryRisk/`. Don't
    extend the legacy one.
- **`src/lib/micropulse/signalPack/`** (`computeSignalPack` + `loader.ts`) — the explainability spine: ranks
  per-player "why" contributors (load/decel/HSR ACWR via `ewmaAcwr.ts`, Foster `monotony.ts`, injury-recency,
  sleep, CMJ jump/asymmetry), each already bilingual why + counterfactual + citation + confidence. **Reuse its
  contributor shape for the watch card.**
- **`src/lib/micropulse/playerTrendForecast/`** — deterministic z-trend (slope, R², `sharply_declining`,
  3-day projection, confidence from R²; cites Hulin 2014). **The precedent for "trajectory signal, not a verdict
  modifier."** Fold its trend direction into the watch.
- **`src/lib/micropulse/robustness/`** (engine + catalog) — NOTE this is **capacity-building drill
  prescription** (the "what to do about it" side), NOT early-warning. Complementary; reuse its `codAsymmetry`
  math. Name the new surface distinctly (**"robustness watch" / early-warning**) to avoid collision.

## New inputs to add (the newly-ingested columns + CMJ slope)
Add to `InjuryRiskInput` (all optional, degrade gracefully — they are null until the Catapult re-sync lands the
new params; see `catapult-new-params-mapping.md` and the api.ts request fix of 24 Aug):

1. **Running mechanical asymmetry** — from `running_symmetry` / `running_imbalance` (+ `running_deviation`).
   - `runningAsymmetryPct?: number` and `runningAsymmetryZ?: number | null` (vs personal 28-day norm, via the
     existing `flagAgainstBaseline()` pattern). Rule: personal z beyond ~1.5σ **worsening** = mechanical-stress
     contributor (bilateral running asymmetry is an early tissue-overload / compensation signal). Confidence
     gated on baseline maturity (≥7 obs).
   - `footstrikesZ?: number | null` — footstrike **volume** spike vs own norm = impact-load contributor (a
     supporting, not headline, signal).
2. **RHIE (repeated-sprint load shape)** — `rhieBoutsZ?: number | null` (bouts vs own norm). A repeated-sprint
   spike is a load-*shape* signal (clustered high-intensity efforts), complementing the ACWR volume signal. Use
   as a modifier, not a standalone flag.
3. **CMJ neuromuscular fatigue slope** (the one genuinely new engine — see next section):
   `cmjSlopeZ?: number | null` (multi-day CMJ height/power trend) and `cmjRecoveryDeficit?: number | null`
   (observed vs personalised expected post-match recovery).

Guardrail: **never fabricate these from session totals.** Only populate when the per-session value exists;
otherwise leave null and let confidence drop. Record which inputs were present (`debug.missingInputs` already
exists).

## New engine: CMJ slope + expected-recovery (`src/lib/micropulse/cmjFatigue/`)
Grounded in `docs/research/cmj-neuromuscular-fatigue-assessment.md`:
- **Read the multi-day slope, not today's value** (Neyroud 2016: universal thresholds are an averaging
  artifact — personal-norm only). Source: `vald_forcedecks_results` (`jump_height_cm`, peak power, RSI-mod,
  `asymmetry_percent`, `test_timestamp`), keyed by `microplayer_id`. A `cmjRecovery/` module already exists —
  extend it, don't duplicate.
- **Expected post-match recovery curve personalised by match HSR** (Hader 2019: HSR >5.5 m/s drives post-match
  fatigue; +100 m HSR → CK +30% / CMJ peak power −0.5% at 24 h; **total distance is NOT predictive**; Silva 2018:
  jump still impaired at 72 h; Nédélec 2012: CK peaks 24–48 h). Compute an expected CMJ-recovery trajectory from
  the player's match HSR (already in the load table), compare to observed → `cmjRecoveryDeficit`.
- **Central vs peripheral labelling** (classifier from the research): CMJ height/power drop = peripheral-metabolic;
  soreness = peripheral-muscular; sleep/stress = central-autonomic. Surface the *type* of fatigue, not just a
  number. HRV only as a central-autonomic companion, never a headline (Thorpe/Saw 2016).
- Confidence gated on test cadence + baseline maturity; CV-gate reused from `vald/phaseChange.ts`.

## The composite (research-supported, already mostly modelled)
ACWR (load + **decel**, Saberisani 2025 decel AUC 0.91 — the single best GPS flag) + **HSR** ACWR ×
monotony/strain (Foster) × mechanical asymmetry (running_symmetry/imbalance + CoD L/R + CMJ asymmetry) ×
neuromuscular-fatigue CMJ slope/deficit × wellness (sleep, #1 associated variable — Haller 2023) ×
**injury-recency latency** (Majumdar 2022 — repeatedly the top predictor; previous injury × current spike).
Illness latency companion (Jones 2017: not-back-to-baseline within 7–21 d of load intensification → higher
illness risk).

Assemble as **ranked, cited, counterfactual contributors with mandatory confidence** — exactly what
`signalPack` already produces. #5 is the *labelled surface* over that, plus the new inputs.

## The surface: `robustnessWatch` (never the colour)
- New route `src/app/api/coach/player/[id]/robustness-watch/route.ts` (or extend the existing peak-demands/
  signal-pack route) returning:
  `{ level: "steady" | "watch" | "elevated", contributors: RankedContributor[], counterfactual, confidence,
    fatigueType?: "peripheral" | "central" | "mixed", trend: TrendDirection, citations, asOf }`.
  - **`level` is NOT a colour and NOT a training decision.** Words, not traffic lights. Never written to
    `readiness_entries` / `v_coach_readiness_today_v8.final_color`.
- New card `src/components/coach/RobustnessWatchCard.tsx`, layered read (manifesto):
  - **(0)** one-sentence verdict: *"Robustness steady"* / *"Watch: mechanical load asymmetry rising"* — bold,
    first, bilingual EN/IS.
  - **(1)** 2–3 plain contributors ("running asymmetry 1.8σ above his norm 3 days running"; "CMJ power −6% vs
    expected post-match recovery"; "decel ACWR 1.6×"). Each with a **counterfactual** ("if asymmetry were within
    1σ → steady").
  - **(2)** raw z-scores / ACWR values / thresholds / citations behind "Show details".
  - **Confidence** always (signal coverage + baseline maturity). Rendered as a **chip beside the readiness
    colour**, following the existing `DecisionSummaryCard` `trendState` / `sprint_drop` chip pattern.

## Guardrails (mandatory — this is the sensitive one)
- **Descriptive / advisory only.** Never touches the readiness colour, the load target, or the daily decision.
  Rules decide; if AI narrates, it's labelled AI and cites the signals.
- **No single injury score.** Signals + personal-norm + confidence + counterfactual, per the ML assessment.
- **Personal-norm, not population thresholds** (defended repeatedly in the research).
- **Confidence gating:** thin baselines (<7 obs) or missing feeds → low confidence, softer language, never a
  hard "elevated".
- **Provenance:** which inputs present, thresholds, as-of date, citations (Gabbett 2017, Majumdar 2022,
  McBurnie 2022, Saberisani 2025, Hader 2019, Foster, Hulin 2014).

## Validation plan (before shipping the card)
The research's over-flag warning is the acceptance gate:
1. Harness over the 23–25 real Breiðablik players (mirror `scripts/validate-role-demand-fit.ts`): run the
   composite across the season and measure **flag rate**. If "elevated" fires on >~15–20% of player-days, it's
   over-sensitive — recalibrate thresholds toward specificity (the yellow-oversensitivity lesson from task #16).
2. Face-validity: elevated flags should concentrate around known hard blocks / congestion / actual niggles, not
   scatter randomly. Spot-check against `injuries` history.
3. Confidence distribution: most players should have enough coverage for at least medium confidence; if not,
   surface the coverage gap honestly rather than guessing.
4. Confirm **zero** writes to the readiness colour path (grep the diff for `readiness_entries` / `final_color`).

## Build order
1. Deprecate legacy `risk/injury.ts`; point consumers at `injuryRisk/`.
2. Extend `InjuryRiskInput` + `rules.ts` with the running-asymmetry, footstrike, RHIE, CMJ-slope inputs (+ their
   rules, cited). Unit tests for each new rule (null-safe, personal-z gated).
3. Build `cmjFatigue/` (slope + Hader expected-recovery), extending `cmjRecovery/`.
4. Assemble `robustnessWatch` via `signalPack`'s contributor shape; new route.
5. `RobustnessWatchCard` — layered read, chip beside the colour.
6. Validation harness (flag-rate + face-validity + no-colour-write check). Only ship if it passes the flag-rate
   gate.

Ref: `docs/research/ai-ml-papers-assessment.md`, `docs/research/cmj-neuromuscular-fatigue-assessment.md`,
`fusion-layer-strategy.md` (#5), `catapult-new-params-mapping.md` (the new columns),
`peak-window-movement-proxy.md` (shares the RHIE axis).
