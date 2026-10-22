# Claude Code task — Readiness Outlook: an explainable next-microcycle wellness forecast

Paste to Claude Code (or `@docs/tasks/readiness-outlook-claude-code-brief.md`).

## What this is (and the one-line why)

MicroPulse readiness today is **reactive** — it compares each player's wellness *this morning* to his own
norm and colours him GREEN/AMBER/RED. This task adds the **forward-looking** half: given the load the
coach has *planned* for the rest of the microcycle, **which players are likely to dip, and on which day**
— surfaced early enough to change the plan. It's a forecast, not a verdict; it never overwrites the
canonical colour.

The research base says this is both real and doable **transparently** (not a black box) — see the
evidence table. The whole point is that a *simple, interpretable* model on data MicroPulse already
collects is as good as XGBoost here, and stays inside the manifesto.

## Status — this is a NEW surface, additive, and must not touch the canonical verdict

- **Do NOT modify** `v_coach_readiness_today_v8`, `readiness_entries.color`, or the readiness trigger.
  The Outlook is a **distinct, labelled signal** that lives *alongside* today's colour, never replaces
  it (CLAUDE.md: one source, one verdict). Think of it like the existing day-over-day delta / trend
  alert — a separate labelled thing, not the colour.
- Primary home: **Week Setup** (where the coach plans the microcycle — the forecast is actionable there).
  Secondary read-only glance on **Load Intelligence** and the coach Daily Briefing.

## The evidence base (all read; cite these in the methodology/caveats)

| What it justifies | Paper | The number/point to use |
|---|---|---|
| **The template** — next-day/next-week wellness is forecastable from load alone, *interpretably* | **Perri et al. 2021**, *Relationship Between Wellness Index and Internal TL in Soccer: a ML Model* (IJSPP) | **Ordinal regression** on **sRPE (7-day EWMA) + microcycle-day** only. Day-lag load→wellness **r = 0.72**; exact-class 38.6% but **~89% within ±1 wellness class**; n = 28 (our scale). Interpretable coefficients (their Table 2). Weekly autocorrelation (lag-7 r ≈ 0.47–0.51) is *what makes it forecastable*. |
| **Chronic load is the dominant driver** of tomorrow's wellness | **Rossi et al. 2022**, *Wellness Forecasting by External and Internal Workloads* (Front Physiol) | Of the top-15 predictive features, **10 are chronic (28-day EWMA) load**. SHAP gives per-signal "why". Real-scenario (retrain weekly) accuracy rises 0.63 → **0.87 by season end** — i.e. weak early, good once the club's own data matures. Team-specific. |
| **Use a simple model, not a black box** | **Rothschild et al. 2024**, *Predicting daily recovery … ML* (EJAP) | **LASSO/linear regression matched XGBoost/NNET**; a handful of features carry the signal; **per-individual models beat group models** (but RMSE varies >5× across people → per-player confidence needed). |
| **Invisible neuromuscular add-on (optional, phase 2)** | **Mandorino et al. 2023**, *Quantify Readiness through ML* (Appl Sci) | Locomotor Efficiency = actual − expected PlayerLoad, z-scored per player. RF predicts PlayerLoad to **MAPE 10%**. Needs **~23 weeks** to stabilise; **never validated vs a fatigue marker** — ship low-confidence only. |
| **Honesty ceiling: load isn't the whole story** | Perri 2021; **Sansone 2023** (review) | Wellness is also psychological/contextual/recovery-behaviour driven → a load-only forecast has a ceiling. Frame it as *readiness to execute*, **not** a performance predictor (Sansone: wellness relates to technical-tactical output, not physical/composite). |
| **Design is the evidence-based one** | Alkasasbeh 2026; Rothschild 2024 | Human-in-the-loop, probabilistic-not-deterministic, per-individual, transparent — exactly this design. |

## What already exists in the data (verify before building)

- `session_rpe_entries` — `rpe`, `session_load`, `duration_minutes` per player per session (the internal
  load / sRPE side — the primary input).
- `player_external_load_daily` — GPS external load (total distance, HSR, accel/decel, PlayerLoad-type
  metrics) for the chronic-load block and the optional LEI add-on.
- Wellness check-ins (sleep, soreness, mood, stress, energy) — the **target** (a per-player wellness
  index) and a same-day autoregressive input.
- `coach_week_setup` / the Week Setup planner — the **planned** future load and the microcycle-day
  labels (MD-6 … MD, MD+1) the forecast is conditioned on.
- The existing per-player baseline / confidence machinery (`MIN_MATURE_*`, coverage logic) — reuse it,
  don't reinvent it.

Confirm exact column/table names against the schema first; wire to what exists.

## The model (keep it small, interpretable, per-player-normalised)

**Target:** tomorrow's (and each remaining microcycle day's) **wellness index class** for each player —
the 5-item check-in composite binned into ordinal classes (mirror Perri's 5-class WELQUE, or reuse
MicroPulse's existing wellness-index bands if already defined).

**Features — deliberately few (Rossi/Rothschild: a handful dominate):**
1. **Chronic load** — 28-day EWMA of internal load (sRPE) [the strongest driver].
2. **Acute load** — 7-day EWMA of sRPE.
3. **Planned load for the target day** — from Week Setup (this is what makes it a *forecast*, not a
   nowcast).
4. **Microcycle-day label** (MD-6 … MD, MD+1).
5. **Current wellness index** (autoregressive; lag-1 and lag-7).

**Model:** start with **ordinal logistic regression (proportional-odds)** — coefficients *are* the
plain-language "why", no post-hoc explainer needed. Per-player normalisation (z-score inputs against the
player's own baseline). If a single pooled model underperforms, add a per-player random intercept; do
**not** jump to a 200-feature tree (Rossi/Rothschild show it overfits at n≈17–25 and isn't more
accurate). Keep an interpretable model as the shipped one; a tree with SHAP is only acceptable if it
demonstrably beats the linear model *and* still exposes ranked per-signal contributions.

**Training/validation:** walk-forward / "real scenario" (Rossi) — retrain as the season accrues; report
cumulative within-±1-class accuracy. Expect it to be weak until the club has enough of its own data
(~half a season / ~23 weeks per Mandorino & Rossi) — this drives the confidence gate below.

## Confidence gate (non-negotiable — the forecast must say when it doesn't know)

Every player's outlook carries a confidence from three things, reusing existing confidence logic:
1. **Baseline maturity** — weeks of that club's data (low until ~23 weeks; Rossi/Mandorino).
2. **Microcycle stability** — the weekly pattern must be repeatable for the lag-7 signal to hold; flag
   erratic schedules.
3. **Per-player predictability** — some players are inherently unpredictable (Rothschild: RMSE varies
   >5×). Track per-player holdout error; downgrade confidence for the noisy ones.

Below a maturity threshold → show the Outlook as **low confidence** or withhold it entirely ("not enough
history yet"). **Never a confident forecast on thin data. No-data ≠ a green outlook.**

## Explainability (the layered read — same as every MicroPulse surface)

- **(0) Verdict / glance:** "Outlook — MD-2: 3 players likely to dip" (labelled as a *forecast*, visibly
  distinct from today's colour).
- **(1) Plain why (no click):** the top contributing coefficient in plain words — e.g. "because the
  MD-3 you've planned is heavy and his 4-week load is already high."
- **Counterfactual (mandatory):** "reduce MD-3 volume ~15% → outlook returns to green." (Recompute the
  forecast at the reduced planned load.)
- **Confidence:** coverage + baseline maturity, stated plainly.
- **(2) Behind the numbers (toggle):** ranked per-signal contributions / coefficients, the ±1-class
  band, and the model + citation (Perri 2021, Rossi 2022, Rothschild 2024).
- **AI labelling:** it's a model output → label it as such, cite the signals; **rules/coach decide, the
  forecast explains.** The coach changes the *plan*, not the forecast.

## Presentation honesty

- Report a **±1-class band**, never a false-precision exact class or a single "readiness %".
- Call it an **outlook / forecast**, never a fact; state the load-only ceiling (wellness is also
  psychological/contextual — Perri, Sansone).
- **Never** forecast match performance from wellness (Alexandersen null result; Sansone: wellness ≠
  physical/composite output).

## Where (build layout)

- New pure, tested module under `lib/micropulse/` (e.g. `readinessOutlook/`) — feature build + the
  ordinal model + confidence; single source so Week Setup and Load Intelligence can't diverge.
- Surface on **Week Setup** (primary, actionable) + a read-only glance on **Load Intelligence** / Daily
  Briefing, behind the existing layered-read components (verdict → plain why → "behind the numbers").
- Extend `lib/methodologyCaveats.ts` with an `OUTLOOK_CAVEAT` (load-only ceiling; forecast-not-fact;
  team-specific + cold-start; ±1-class honesty; cites the papers).
- Any new column/table (e.g. cached per-day forecasts, per-player model params) saved as a
  **timestamped `.sql` under `supabase/migrations/`** (CLAUDE.md) as well as applied.
- **Bilingual EN/IS** throughout; English default. No jargon in the primary view (Perri's "WELQUE",
  "ordinal regression", "EWMA" live behind tooltips / "Show details").

## Acceptance

- For a player with a mature baseline, the Outlook predicts each remaining microcycle day's wellness
  class and is correct **within ±1 class** at a rate clearly beating a naive "same as today" baseline on
  a walk-forward holdout (Perri's ~89%-within-±1 is the reference bar; don't overfit to it).
- The counterfactual recomputes: lowering a planned day's load moves the outlook, and the shown number
  matches a re-run of the model at that load.
- Confidence is low / withheld before the maturity threshold; a player with erratic scheduling or high
  personal holdout error is downgraded. **No forecast is shown on thin data.**
- The canonical colour is untouched — `v_coach_readiness_today_v8.final_color` and today's readiness are
  byte-for-byte unchanged; the Outlook is visibly a separate, labelled signal.
- Every outlook exposes: plain why, counterfactual, confidence, and (in detail) ranked contributions +
  citation.
- `npx eslint` clean on touched files; unit tests for the feature build + model + confidence pass; stage
  specific files only; new SQL saved under `supabase/migrations/`.

## Do NOT

- Do **not** overwrite, shadow, or "improve" `v_coach_readiness_today_v8.final_color` /
  `readiness_entries.color`, and do not touch the readiness trigger or `athlete_decision_history` /
  `stage4_decisions`.
- Do **not** ship a black-box / 200-feature tree as the model — a simple interpretable model matches it
  here (Rossi, Rothschild) and the manifesto requires the "why".
- Do **not** present an exact class or a single readiness percentage — ±1-class band only.
- Do **not** forecast match performance, or imply the outlook measures physical capacity (Sansone,
  Alexandersen).
- Do **not** surface a confident forecast before the baseline is mature, and do **not** fabricate an
  outlook when inputs (planned load, wellness history) are missing — no-data, never a green.
- Do **not** auto-apply the counterfactual to the plan — it's a suggestion the coach accepts (human
  decides; forecast explains).

## Optional phase 2 (only after the above ships and matures)

Add the **Locomotor Efficiency** signal (Mandorino 2023) — actual − expected PlayerLoad residual,
z-scored per player — as a *separate* low-confidence neuromuscular-freshness read, and **validate it
against MicroPulse's own VALD CMJ data** (the validation the paper itself never did). Label it clearly
as experimental until that validation lands.
