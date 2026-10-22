# Claude Code task — CMJ phase metrics with CV-gated thresholds (follow-up to the RSI brief)

Paste to Claude Code (or `@docs/tasks/cmj-phase-metrics-cv-thresholds-claude-code-brief.md`).

**Do the RSI brief first** (`cmj-rsi-modified-claude-code-brief.md`). This task assumes RSI-modified
already flows through and surfaces. It adds the rest of the force-time story — but with a guardrail
that is the whole point of the task, so read the "Why the CV gate is mandatory" section before
writing anything.

## Why

Jump height and RSI-modified are the headline CMJ metrics, but the research is clear that the
*phase* metrics — how the jump was produced, not just the result — carry fatigue information the
outputs miss:

- **Marques & Buchheit 2026 ("Jump Height Lies")** — after matches, contraction time +0.55,
  concentric impulse 0–100 ms −0.42, concentric mean force −0.44, while jump height barely moved.
  [SPSR 293](https://sportperfsci.com)
- **Gathercole et al. 2015** — time- and eccentric-related variables stayed abnormal longest after
  fatigue (still changed at 72 h), well after jump height recovered.
  [10.1123/ijspp.2013-0413](https://doi.org/10.1123/ijspp.2013-0413)
- **Cormie et al. 2009** — training changes the *shape* of the force/velocity/power–time curves,
  not just the peaks; phase timing is where adaptation shows up.
  [10.1519/JSC.0b013e3181889324](https://doi.org/10.1519/JSC.0b013e3181889324)

## Why the CV gate is mandatory (do not skip this)

The same Gathercole paper that says phase metrics are fatigue-sensitive also measured their
**reliability**, and it is a warning, not a footnote. Table 2 reports intraday / interday CV per
variable. The pattern:

| Metric class | Example CVs (intraday / interday %) | Read |
|---|---|---|
| **Outputs** — jump height, peak power, flight time, peak velocity | JH 5.3/4.9, PP 2.3/2.7, FT 1.7/1.1, PV 2.7/2.5 | **CV < ~5% — reliable** |
| **Time / eccentric** — eccentric duration, time-to-peak-force, RFD, force–velocity AUC, mean ecc/con power | EccDur 6.2/8.0, TTPF 6.8/7.7, mRFD 16.0/16.2, FV-AUC 10.6/7.4, MEccConP 6.3/7.9 | **CV > 5% — sensitive but NOISY** |

The exact trap this system already fell into once: a metric with a large CV, shown against a small
personal SD, flags a one-off wobble as "declining." That is the over-sensitive-yellow bug from the
readiness engine, re-created on the jump plate. **Every phase metric must therefore only flag a
change that exceeds its own measurement noise** — the smallest worthwhile change gated by the
metric's CV — exactly as the readiness engine gates on baseline SD. A phase metric with CV 16%
(RFD) needs a much bigger move to mean anything than jump height with CV 5%. If you surface phase
metrics without this gate, you have built a prettier version of the bug, and the task has failed.

## Trial averaging first (Claudino)

**Claudino et al. 2017**, meta-analysis of 151 studies: the **mean of the trials** is more
fatigue-sensitive than the best trial (odds of catching the true change ~10:1), because averaging
shrinks measurement error. [10.1016/j.jsams.2016.08.011](https://doi.org/10.1016/j.jsams.2016.08.011)

`lib/integrations/vald/sync.ts` (~423) already stores **one row per trial** (3 per CMJ test). Today
the CMJ snapshot effectively reads a single value. Before any phase work, the per-test value used
for every metric should be the **mean of that test's valid trials**, not the best trial — with the
trial count carried through so confidence can reflect it. This one change improves jump height and
RSI as well, so it belongs at the front of this task.

## Where (verified 2026-07-21)

| Thing | Location | State |
|---|---|---|
| Results columns | table `vald_forcedecks_results` | `eccentric_duration_ms`, `concentric_duration_ms`, `concentric_impulse_n_s`, `peak_force_n` exist; all 0/731 populated |
| Metric mapper | `lib/integrations/vald/normalizers.ts` ~263–290 | Already reads ecc/con duration, concentric impulse, peak force when present |
| Raw payload | table `vald_raw_tests.payload` | `trials[].results[]` — currently ~4 metrics; richer set only arrives once the VALD profile outputs it |
| CMJ → coach | `lib/micropulse/vald/snapshot.ts` | Reads jump height; RSI added by prior brief |
| Alerts surface | `components/dashboard/ValdAlertsPanel.tsx` | Surface phase metrics here; do NOT build a new page |
| Baseline SD pattern to copy | the readiness trigger's 28-day SD gate (see CLAUDE.md canonical verdict note) | The CV gate mirrors this |

Same reality as the corrected RSI brief: the phase columns are 0-populated because the sync pulls a
thin result set, NOT because VALD lacks the metrics. Verified in VALD HUB (2026-07-21) — the CMJ
metric list already contains Eccentric Braking Impulse, Eccentric Braking RFD, Flight
Time:Contraction Time and the full impulse-at-{50..250}ms set. There is no VALD config change to
make. The RSI brief's endpoint fix (pull the full ForceDecks result set) is what makes these arrive;
this task makes them surface *correctly* once they do.

## Change

**1. Trial averaging.** Compute per-test metric values as the mean of valid trials; carry
`trial_count`. Apply to jump height, RSI, and all phase metrics uniformly. Pure, tested.

**2. Phase-metric read.** In `snapshot.ts`, read the phase columns beside jump height / RSI and build
the same 28-day personal-baseline comparison for each. Store the baseline **CV** per metric per
player (it's baseline SD ÷ mean — you already compute the SD).

**3. CV-gated change classification** — the core of the task. A pure module, e.g.
`lib/micropulse/vald/phaseChange.ts`:
   - For each metric, a change is only "real" if it exceeds `max(personal smallest-worthwhile-change,
     metricCV × k)` — i.e. it clears both the player's own noise floor and the metric's known
     measurement noise. Seed the metric CVs from Gathercole 2015 Table 2 (constants with the citation
     next to each), then let the player's own observed CV widen the floor once enough trials exist —
     never narrow it below the literature value.
   - Classify: `noise` / `worth-watching` / `real`. Only `real` drives a coach-facing flag; the rest
     are context behind the detail toggle.
   - Bilingual plain-language output per metric ("framleiddi kraftinn hægar en venjulega — en innan
     mæliskekkju" vs "…og það er umfram skekkju"), each with its `citation`.
   - Unit tests: a 16%-CV metric (RFD) must NOT flag a 10% move; a 5%-CV metric (jump height) must
     flag the same 10% move; empty/thin baselines return `insufficient`; every string exists EN + IS.

**4. Surface — layered, minimal.** In `ValdAlertsPanel.tsx`: headline = the one metric that is
`real` and worst, in plain language; the numbers, the CV, and the citation live behind the existing
detail toggle. If nothing clears its gate, say so ("CMJ innan eðlilegra marka") rather than listing
sub-threshold noise. Honest empty state when the phase columns are null, same as the RSI panel.

## Acceptance

- With today's data (phase columns null), the panel shows the honest empty state; no fabricated
  values.
- Given a synthetic test row on the basketball demo team `725b9cff-c7c9-4d0d-b16d-d3e086a766d6` with
  phase columns populated, a **large move in a low-CV metric flags** and an **equally large move in a
  high-CV metric does not** — this is the acceptance test that proves the gate works.
- Jump height and RSI behaviour unchanged except that both now use the trial mean.
- Any DB change has a timestamped `.sql` under `supabase/migrations/`.
- `npx eslint` clean on touched files; `npm test` passes. Stage specific files only.

## Do NOT

- Do not surface any phase metric without the CV gate. That is the task, not a nicety.
- Do not draw the force-time curve with shaded phases — that needs the raw 1000 Hz trace the VALD
  cloud API does not return. Out of scope, same as the RSI brief.
- Do not narrow a metric's noise floor below its Gathercole literature CV, even if a player's
  observed CV looks smaller — thin baselines under-estimate CV and would re-open the bug.
- Do not touch the readiness trigger or `v_coach_readiness_today_v8`.

## No VALD-side action needed

The phase metrics already exist in VALD (confirmed in Hub). Once the RSI brief's endpoint fix pulls
the full ForceDecks result set, these columns populate on their own. Until then the phase panel
shows the honest empty state — correct, not broken.
