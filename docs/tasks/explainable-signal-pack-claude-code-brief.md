# Claude Code task — Explainable Signal Pack: EWMA load, injury-recency, monotony, decel/HSR-ACWR triggers, sleep + CMJ in the "why"

Paste to Claude Code (or `@docs/tasks/explainable-signal-pack-claude-code-brief.md`).

## What this is (and the one-line why)

The injury-ML literature keeps surfacing the **same handful of signals** that actually associate with
injury in football — and every one of them is data MicroPulse *already collects*. This task adds them as
**named, cited, counterfactual "why" contributors** on the readiness and load surfaces. They are all
**simple per-player rolling calculations — no trained model** — which is exactly what the evidence says
works at a single-club (~25-player) scale.

The companion assessment (`docs/research/ai-ml-papers-assessment.md`) is decisive on *why not a model*:
at 25-player scale a trained injury classifier hits high "accuracy" but near-chance precision/recall
(Haller 2023: κ 0.14, precision 11%) and **over-flags**. So we take the *signals*, not the classifier.

## Status — additive "why" contributors, NOT a new verdict

- These are **supporting facts / trend flags** that enrich the existing layered read (verdict → plain
  why → S&C detail). They must **NOT** overwrite or shadow `v_coach_readiness_today_v8.final_color`, and
  must not touch the readiness trigger, `athlete_decision_history`, or `stage4_decisions` (CLAUDE.md:
  one source, one verdict).
- Surface them: (a) as ranked contributors inside a flagged player's "why" / "behind the numbers", and
  (b) as labelled context on Load Intelligence. Where a signal is genuinely a trend alert (e.g. a decel
  spike), surface it as a distinct labelled signal next to the colour — like the existing day-over-day
  delta — never as the colour.

## The evidence base (all read; cite each next to its signal)

| Signal to add | Paper | The number/point |
|---|---|---|
| **EWMA acute:chronic load** (less biased than rolling-average ACWR) | **Williams 2017** (BJSM) + **Majumdar 2022** (Sports Med Open) | EWMA weights recent load and reduces the rolling-average ACWR's known bias; previous-injury + load history are the recurring top predictors. |
| **Previous-injury recency** (decayed) | **Majumdar 2022; Rico-González 2023** | Prior injury is the strongest, most consistent non-modifiable risk factor across the football ML studies. |
| **Training monotony & strain vs own average** | **Rico-González 2023** (Rossi rule) | Human-readable rule: *"previous injury → new injury when HSR > 112 m/min AND total-distance monotony 2.5× the player's own average."* Monotony = weekly mean ÷ SD (Foster). |
| **Deceleration-ACWR & HSR-ACWR spikes** | **Saberisani 2025** (Front Sports Act Living) | Deceleration was the single best GPS flag: **AUC 0.91** (recall 87.5%); high+moderate-speed distance next best (AUC 0.88). |
| **Sleep quality + CMJ jump-height / asymmetry** in the primary "why" | **Haller 2023** (JSSM) | On the closest 25-player analogue, **sleep quality was the #1** injury-associated variable and **CMJ jump height top-3**. |
| **Do NOT build a classifier** (the guardrail) | **Leckey 2024** (BJSM); **Haller 2023** | At 25-player scale: inflated accuracy, near-chance precision/recall → over-flagging. Use signals as explainable reasons, not model inputs. |

## What already exists in the data (verify first)

- `player_external_load_daily` — GPS: total distance, HSR, **decelerations/accelerations**, sprints,
  PlayerLoad-type. (For decel-ACWR, HSR-ACWR, monotony/strain.)
- `session_rpe_entries` — `rpe`, `session_load`, `duration_minutes` (for internal-load EWMA, monotony,
  strain).
- Existing **rolling-average ACWR** logic (extend to an EWMA variant; don't rip out the old one).
- Wellness check-ins (sleep quality) — already collected; surface it *higher* in the "why".
- **VALD CMJ** (jump height + L/R asymmetry) — already ingested; add to the "why".
- Injury / RTP logs — for **previous-injury recency** (days since last time-loss injury, decayed).

Confirm exact tables/columns against the schema and wire to what exists; reuse the per-player baseline +
confidence machinery already in the readiness/load code.

## The signals (all simple per-player rolling calcs — no training)

1. **EWMA acute:chronic ratio.** Add an EWMA-weighted acute (≈7-day) : chronic (≈28-day) load ratio
   alongside the existing rolling-average ACWR, per player, for internal (sRPE) and key external
   (distance, HSR) load. Label clearly which is shown; EWMA is the less-biased default (Williams 2017).
2. **Previous-injury recency.** Days since last time-loss injury, as a decaying context flag on the
   player (recent return = elevated context, shown as a labelled note, never a colour).
3. **Monotony & strain vs own average.** Weekly monotony = mean ÷ SD of daily load (Foster); strain =
   weekly load × monotony; both expressed **relative to the player's own rolling average**, in Rossi's
   IF-THEN style.
4. **Decel-ACWR & HSR-ACWR spike triggers.** When a player's deceleration-load or high-speed-running
   ACWR (EWMA) exceeds his own threshold, surface a **named counterfactual trigger**: *"decel load ran
   1.6× his 3-week norm → flag; if it had been ≤1.3× → clear"* (Saberisani 2025). Partly already in the
   decel/IMA + HSR surfaces — make it an explicit, cited "why" contributor.
5. **Sleep + CMJ in the primary "why".** Promote sleep quality and CMJ jump-height/asymmetry into the
   first-read "why" for a flagged player (Haller 2023), each with its own counterfactual and citation.

## Explainability (every signal, non-negotiable — same manifesto)

- Each signal appears as a **ranked contributor** with a **plain-language line** (no jargon in the
  primary view — "monotony", "ACWR", "EWMA" live behind tooltips / "Show details").
- Each carries a **counterfactual** ("if X had been Y → clear") and its **paper citation**.
- **Confidence**: per-player baseline maturity + signal coverage; a signal on thin data is shown as low
  confidence, never a scold.
- **SHAP-style ranked attribution** behind "Show details" (Leckey 2024: interpretability is the field's
  biggest missing piece — only 18% of studies did it).
- **Rules decide; these signals explain.** They never auto-change the verdict or the plan.

## Honesty / methodology guardrails (encode these)

- **No-data ≠ zero**: no GPS / no CMJ / no wellness that day → no-data for that signal, never 0.
- **Per-player normalisation** — every signal is on the player's own norm, never squad-wide.
- **Same-day-injury leakage rule**: if any of this is ever used in retrospective/analytic views, exclude
  inputs from the day an injury occurred (Majumdar 2022).
- **EWMA is a lens, not a verdict** — present ratios/monotony as context that supports the colour, never
  as an independent "risk score" or a single number.
- Extend `lib/methodologyCaveats.ts` with a `SIGNAL_PACK_CAVEAT` (these are associations not predictions;
  own-norm; single-club evidence; cite the papers).

## Where (build layout)

- Pure, tested helpers under `lib/micropulse/` (e.g. `signalPack/`) for EWMA ACWR, monotony/strain,
  injury-recency, decel/HSR-ACWR triggers — single source so every surface agrees.
- Surface as ranked "why" contributors in the readiness drill-down + Load Intelligence "behind the
  numbers", behind the existing layered-read components.
- Any new cached column/table saved as a **timestamped `.sql` under `supabase/migrations/`** (CLAUDE.md).
- Bilingual EN/IS; English default; jargon behind tooltips.

## Acceptance

- For a player with a mature baseline, each signal computes on his own norm and renders as a plain
  "why" line with a counterfactual + citation; below the maturity threshold it shows low confidence /
  no-data, never a scold or a fabricated value.
- Decel-ACWR and HSR-ACWR triggers fire only when the player's own threshold is exceeded, and the shown
  counterfactual matches a recompute at the lower value.
- Sleep quality and CMJ appear in the flagged-player primary "why".
- The canonical colour is byte-for-byte unchanged; every new element is visibly a labelled supporting
  signal, not the verdict.
- `npx eslint` clean on touched files; unit tests for each helper pass (a within-threshold move does not
  flag; an over-threshold move does; thin baseline → low confidence); stage specific files only; new SQL
  saved under `supabase/migrations/`.

## Do NOT

- Do **not** build or ship a trained injury/risk classifier or a single "injury risk %" — the evidence
  says it over-flags at this scale (Leckey 2024, Haller 2023). Signals only.
- Do **not** overwrite/shadow `v_coach_readiness_today_v8.final_color` or touch the readiness trigger /
  `athlete_decision_history` / `stage4_decisions`.
- Do **not** normalise across the squad — per-player own-norm only.
- Do **not** fabricate a signal when its input (GPS, CMJ, wellness, injury history) is missing — no-data,
  never zero.
- Do **not** surface any signal without its plain "why", counterfactual, confidence, and citation.
