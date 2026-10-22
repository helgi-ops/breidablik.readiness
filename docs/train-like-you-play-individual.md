# Spec — "How to train this player" (individual training-emphasis engine)

> Deepens **Train like you Play** from position-focus into a per-player
> *development-emphasis* read: combines the team **game model** with **how the
> player actually moves** to output a detailed, cited "best way to train him."
> Decision-support, not drills. **Rules decide which qualities; AI only phrases.**
> Must work on **both Pro and Lite** — capability-driven, never tier-hardcoded.

## What it is (and isn't)

IS: a ranked set of 2–3 **physical development emphases** per player, each with a
plain-language *why*, the signal in his own data that triggered it, a paper
citation, and (optionally) a **method family** to train it. Plus an honest
"not assessable at your tier" note and a confidence chip.

IS NOT: a drill generator, a medical/return-to-play tool, or AI free-styling
training advice. The coach still designs sessions and can override every emphasis
(logged with a reason).

This is distinct from **unfamiliar load** (that flags an acute spike vs own norm).
This answers the slower question: *given how he moves and how we play, what should
his physical development prioritise?*

## Three inputs the engine blends

1. **Game model (coach-set, the only non-data input).** A team-level enum, optional
   per-position override. Each maps to a *demand profile* — which qualities the
   model taxes most. Suggested set:
   - `high_press` → repeated high-accel + recovery-sprint capacity, decel volume.
   - `possession` → short accel/decel density, change-of-direction, repeated efforts.
   - `direct_transition` → max-velocity sprint, sprint-resilience (hamstring).
   - `low_block_counter` → max-velocity + repeated-sprint, high decel on regains.
   - `balanced` → even weighting.
   Store on `team_settings` (e.g. `game_model text`, `game_model_by_position jsonb`).

2. **Position / role norm.** Reuse the existing Train-like-you-Play position focus
   + role-norm context (`trainingPrescriptions`, `TlypTrainingFocus`, the group/
   role-norm work from movementSignature Phase 3).

3. **How the player moves (data), vs own + position norm.** See the capability
   table below. Compare with `flagAgainstBaseline()` (`src/lib/micropulse/baselines`)
   over a mature window (min 8 training days).

## Quality catalogue (fixed, paper-cited — rules, not AI)

A closed list of development qualities. Each has: trigger rules, the signals it
*can* use (Pro-rich → Lite-proxy), a rationale template, a citation, and a
confidence contribution. Starting set:

| Quality | Triggered by (high vs norm + game-model demand) | Citation |
|---|---|---|
| Max-velocity sprint maintenance | high sprint-stride / HSR share; high `max_velocity` | Haugen, Buchheit |
| Repeated-sprint / repeated-effort capacity | many HSR efforts + short recovery; press model | Buchheit 2024 |
| Acceleration mechanics & output | high accel efforts/`max_acceleration`; press/possession | Morin, di Prampero 2015 |
| Deceleration / braking tolerance | high decel efforts/`max_deceleration`; HML | Harper, McBurnie 2022 |
| Change-of-direction & multidirectional | high CoD volume (Pro IMA) | McBurnie 2022 |
| L/R asymmetry correction | L/R CoD or braking imbalance (Pro IMA only) | Robertson 2017 |
| Hamstring eccentric / sprint-resilience | high sprint-stride/HSR exposure | Gabbett 2017, Nédélec |
| Aerobic / repeated-effort base | high total volume + density (`player_load_per_minute`) | Buchheit |

## Capability mapping (Pro vs Lite) — the part that makes it tier-fair

Each quality lists the best available evidence per tier. Branch on **signals
present** (the capability engine, `docs/interpretation-architecture.md`), not tier
name. Example mappings (table `player_external_load_daily`):

- **Max-velocity / hamstring-resilience**
  - Pro: `ima_fr_band5..8_*` (sprint-stride share), `max_vel`, HSR.
  - Lite: `high_speed_distance`/`sprint_distance` share, `max_velocity`.
  - Same emphasis; Lite confidence lower (no stride-band granularity).
- **Acceleration / deceleration mechanics**
  - Pro: `ima_band*_accel_count`/`decel_count`, `accel_b2_3_tot_effs_gen2`,
    `decel_b2_3_tot_effs_gen2`, `decel_b3_plus_tot_effs_gen2`, `max_acceleration`,
    `max_deceleration`.
  - Lite: `accel_decel_efforts`, `max_acceleration`, `max_deceleration`. (Present
    ~100% on Core — verified.)
- **Change-of-direction & multidirectional / L/R asymmetry**
  - Pro: `ima_cod`, `ima_cod_left/right_high|medium|low`, clock fingerprint
    (`directionalSignature`).
  - Lite: **NOT assessable** (no IMA). Mark "Pro-only — your tier can't see
    change-of-direction load; closest proxy is total accel/decel efforts (low
    confidence)." Honest upsell, never guessed.
- **Aerobic / density**
  - Pro & Lite: `player_load_per_minute` + derived `session_duration_minutes`
    (see HANDOFF thread #7) + `high_metabolic_load_distance_m`.

So on **Pro** a player gets a rich, multi-quality read incl. CoD/asymmetry; on
**Lite** the same engine returns the qualities GPS can support, explicitly lists
what Pro would add, and shows lower confidence. One engine, two honest depths.

## Output shape (per player)

```
type TrainingEmphasis = {
  quality: string;                 // from the catalogue
  headline: { EN; IS };            // one line: what to prioritise
  why: { EN; IS };                 // rationale, plain language
  evidence: string;                // the signal in HIS data that triggered it
  citation: string;                // paper
  methodFamily?: string;           // optional: e.g. 'max-velocity', 'eccentric'
  confidence: 'high'|'moderate'|'low';
};
type PlayerTrainingRead = {
  player_id; position; gameModel;
  emphases: TrainingEmphasis[];    // top 2–3, ranked
  notAssessable: string[];         // qualities this tier can't see + what unlocks them
  confidence: { level; coverage; baselineDays };
};
```

UI: a per-player panel/section ("How to develop him") inside the existing
Train like you Play surface — headline + 2–3 emphases (each expandable to the why +
evidence + citation), the "not assessable at your tier" note, and the confidence
chip. Default surface = head-coach readable in seconds; detail on expand.

## Endpoint

`/api/coach/training-read` (coach-auth like `ksi-report`): for a player (and/or
whole squad), returns `PlayerTrainingRead` by calling the existing aggregates +
`flagAgainstBaseline` server-side. Lib `src/lib/micropulse/trainingRead/` —
deterministic synthesis, no recompute of load.

## Explainability guardrails (CLAUDE.md)

- Rules pick the qualities from the fixed catalogue; **AI only phrases** the
  headline/why and is labelled AI. Never let AI invent a quality or a number.
- Every emphasis carries provenance (the triggering signal + window) and a
  citation; counterfactual where sensible ("if his L/R braking were balanced →
  asymmetry emphasis would drop off").
- Confidence DEGRADES on low coverage (Lite < Pro on the same logic). Never fake.
- This is a development read, NOT the readiness color — keep
  `v_coach_readiness_today_v8.final_color` canonical and untouched; surface this as
  a distinct labelled signal.
- Coach override logged with a reason (audit trail). Decision-support, not gospel.

## Order of work

1. `team_settings.game_model` (+ optional per-position) + a tiny coach setting UI.
2. Quality catalogue as a typed, cited fixed lookup (no AI in the decision).
3. `trainingRead` lib — capability-driven trigger rules + ranking + confidence;
   reuse `flagAgainstBaseline`, position/role norms, `directionalSignature`,
   `imaRunningLoad`. Unit-test on real Pro (Breiðablik, IMA) AND real Lite
   (Þór/Grindavík, GPS-only) rows — assert the Lite read omits CoD/asymmetry,
   lists them under `notAssessable`, and reports lower confidence.
4. `/api/coach/training-read` endpoint.
5. UI panel in Train like you Play; AI phrasing labelled; tooltips for jargon.

Verify: `npx eslint` per file; Lite vs Pro reads differ correctly on the same
player-logic; reads in 5 s for a non-S&C coach; no new lint; migrations saved with
timestamp prefix per CLAUDE.md.
