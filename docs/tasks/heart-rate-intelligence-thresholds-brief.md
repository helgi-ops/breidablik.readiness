# Apply the HR evidence thresholds in `heart-rate-intelligence`

Grounds concrete additions in the evidence doc (`docs/research/heart-rate-football-evidence.md` +
`hr-source-notes/`). Descriptive load context only — HR signals sit BESIDE the readiness colour,
never become it.

## Already built (don't rebuild)
- `src/lib/micropulse/hrLoad/` (`index`, `loadForTeam`, `explain`, tests) + `/coach/heart-rate-intelligence`:
  belt HR × sRPE cross-check via **Edwards 1993 summated-HR-zone TRIMP** (adapted; Buchheit 2024),
  `hrLoadIndex` vs `srpeIndex` with `DIVERGENCE_GAP` (>25 = diverging), belt-coverage honesty gate,
  `MIN_MATURE_HR_SESSIONS` maturity gate, **8-band ordinal intensity distribution** (low 1–3 / mod 4–5
  / high 6–8), calibrated %HRmax when a player's `hr_max` is known. Columns present: `hr_max`,
  `avg_hr`, `max_hr`, `hr_zone`, `heart_rate`, `hrv`, `resting_hr`, `rmssd`, `TRIMP`.

So the sRPE↔HR divergence flag and intensity distribution already exist. The evidence doc adds three
things that are NOT yet built:

## Addition 1 — Submaximal HRex fitness test (the biggest gap; Buchheit framework)
The strongest missing capability. A standardized submaximal test tracks aerobic-fitness change without
a maximal test.
- **Protocol:** fixed submaximal run (e.g. 3–5 min at a fixed speed such as 9 km/h). Record
  **HRex = mean HR over the last 30–60 s**; optionally **HRR = HR drop over the first 60 s of a seated
  recovery** (measured across 5–15 s windows).
- **Thresholds (SWC, from the Frontiers 2018 framework note):** HRex **1%**, HRR **7%** (HRrest/HRVrest
  SWC = 0.5×SD of the first ~2 weeks). A change ≥ SWC = a meaningful fitness change; below = noise.
- **Interpretation:** ↓HRex and ↑HRR over weeks = improving aerobic fitness; the reverse = decline or
  accumulated fatigue. Use the **trend**, not one test.
- **Home:** a new `hrExTest` lib + storage (a small `submax_hr_test` table, or reuse the fitness-test
  store from `conditioning`/`criticalSpeed`). Surface on `conditioning` (energy-system profile) — it's
  a capacity read — and expose the HRex trend as a background signal later.
- **Directional ambiguity guardrail (Frontiers):** an HR change is ambiguous alone — always show HRex
  alongside the training phase/load context and wellness, never as a standalone verdict.

## Addition 2 — Match-intensity anchor read (Bangsbo reference values)
Turn the ordinal 8-band distribution into a plain match-relative read **when `hr_max` is calibrated**:
- Mean session HR ≈ **85% HRmax** = "hit match intensity"; **>98%** peaks are ceiling.
- Time **<65% HRmax** = genuinely low-intensity (rare in a real match — Bangsbo).
- Verdict examples: "this drill reached match intensity (mean 86% HRmax)" / "40% of the session sat
  below 65% HRmax — a low-intensity day". Keep the ordinal bands as the fallback when HRmax is unknown
  (as today); the %HRmax read only fires on calibrated players. Cite Bangsbo SSE #125.

## Addition 3 — HRV readiness as a trend signal (not a verdict)
Columns `hrv` / `rmssd` / `resting_hr` exist. Surface a **trend**, never the colour:
- **Morning RMSSD**, 7-day rolling mean vs the player's personal band; flag when it sits below-band for
  consecutive days. Single-day HRV is noisy — gate on the rolling trend (García-Ortega 2023 meta;
  Frontiers framework). Report as a labelled "recovery trend" chip beside the colour (feeds
  `coach_signals` later), never merged into readiness.
- Companion only to the parasympathetic picture; pair with sleep/soreness, don't headline HRV alone.

## Guardrails
- Never touch `v_coach_readiness_today_v8.final_color`. All three additions are descriptive/advisory.
- **HR understates peak demand** (lag on brief high-intensity efforts — Dellal) — never present HR load
  as the whole picture; always alongside GPS high-speed/sprint + sRPE. Keep `HR_CAVEAT`
  (`methodologyCaveats`) on every surface.
- Personal-norm + trend; cite method (Edwards TRIMP, HRex SWC, Bangsbo anchors) as provenance; label
  estimates; English default, IS on toggle (`const [lang] = useLang(); isEN = lang !== "IS"`).
- No new lint errors; unit-test the HRex SWC math and the %HRmax anchor read (null-safe when `hr_max`
  is missing).

## Suggested order
1. HRex submaximal test (lib + store + `conditioning` surface + SWC thresholds) — the real new value.
2. Match-intensity anchor read on the existing intensity distribution (small, high-clarity win).
3. HRV recovery-trend chip (ties into the `coach_signals` work).

Ref: `docs/research/heart-rate-football-evidence.md`, `hr-source-notes/` (Bangsbo, Frontiers 2018),
`src/lib/micropulse/hrLoad/*`, `/coach/heart-rate-intelligence`, `conditioning` / `criticalSpeed`
(fitness-test home), `coach-signals-cache-and-today-chips-brief.md` (where the trend chips land).
