# MicroPulse — Verified Science Audit (June 2026)

> Every coach-facing threshold, verdict, and injury claim — checked against the
> **code**, the **data**, and the **literature**. Where a claim didn't hold, it
> was corrected, not buried.

This is the verification record behind the explainability-first manifesto's
promise: *"rules decide, AI explains, and every signal carries a paper
citation."* It complements two existing documents — the public
[Methodology page](../src/app/methodology/page.tsx) (the buyer-facing list of
thresholds) and the broader [product audit](./micropulse-product-audit-2026-06.md)
(which this audit verifies and, in places, corrects).

The headline: **the science layer is honest and defensible.** Across ~25 displayed
numbers there were **0 citation mismatches**; AI surfaces had **0 labelling
gaps**; the canonical-verdict rule held on 14 of 15 surfaces (the 15th was fixed).
The over-claims that *were* found all shared one pattern — real signals dressed
with injury-risk multipliers the cited papers don't support — and every one was
reframed to honest language. Self-auditing to this standard *is* the moat.

---

## How it was verified

| Method | What it checks |
|---|---|
| **Code ↔ UI** | Every threshold shown to a coach cross-checked against the actual constant in the underlying lib (`file:line`, both sides). |
| **Canonical verdict** | Every read of the readiness colour traced to the one source of truth (`v_coach_readiness_today_v8.final_color`); the two "forbidden as colour" tables audited. |
| **Data calibration** | A tunable threshold checked against the real distribution (4,556 player-weeks) rather than guessed. |
| **Literature** | High-stakes injury claims read against the primary papers on PubMed (DOIs below). |
| **Adversarial** | Every flag raised by a sub-agent independently re-verified by hand before any change — agents neither over- nor under-flagged in the final pass. |

---

## 1. Verified solid — keep, and lean on it

| Signal | Basis | Verification |
|---|---|---|
| Estimated 1RM (Epley/Brzycki/Lombardi, RIR = 10−RPE, RPE ≥ 9 PR gate) | Epley 1985 · Brzycki 1993 · Lombardi 1989 · Zourdos 2016 | numbers match `oneRepMaxFormulas.ts` |
| Velocity-based 1RM (MVT bench 0.15 / DL 0.18 / squat 0.30 / SJ 1.30 m/s) | González-Badillo & Sánchez-Medina 2010 · Banyard 2017 | match `lvProfile/index.ts` |
| **Deceleration → injury** (braking force ≈ 2.7× acceleration → tissue damage) | McBurnie et al. 2021 · Harper, McBurnie et al. 2022 | **literature-confirmed** (DOIs below) |
| Confidence / baseline maturity (MIN_DAYS 8, full at 14) | manifesto principle | match `trainingRead/index.ts` |
| STEN = 2·Z + 5.5; low-Z bands −1.5 / −2.0 | Thornton 2019 / Robertson 2017 | match `mdComparison.ts` / `constants.ts` |
| Foster monotony & strain **formula** | Foster 1998 | formula correct; cutoff calibrated (§3) |
| ~25 other displayed thresholds / citations | various | **0 mismatches** across DailyBriefing, DecisionSummary, SessionBuilder, LoadVerdict, Quadrant, RecoveryWatch, MD Comparison, LoadPlan |

**AI surfaces (8) + verdict surfaces (5):** every AI output is labelled as AI and
cites its real input signals; the deterministic engine/coach decides, AI only
explains; every verdict shows confidence (coverage + baseline maturity + small-
sample warnings). **0 gaps.** (`movement-narrative` is correctly *not* labelled
AI — it is deterministic rule output.)

---

## 2. Over-claimed — and corrected

All of these were the same failure mode: a useful monitoring signal carrying an
**injury-risk multiplier the cited paper does not support.** Fixed to honest
framing.

| Claim (as shown) | Verified reality | Now reads | Commit |
|---|---|---|---|
| ACWR "sweet spot 0.8–1.3 = lowest injury risk; >1.5 = 2–4× risk" | Impellizzeri 2020: *"no evidence supporting ACWR … for reducing injury risk"*; mathematical-coupling artifact (Lolli 2017). The real driver is **unfamiliar load** (Gabbett & Hulin 2016). | "familiar load range / spike-size context, **not an injury predictor**; what matters is whether the spike is into unfamiliar territory" | `8259e8d`, `77146d7` |
| CoD/interlimb asymmetry ">15% = strongest predictor of non-contact injury (~3×)" | Bishop / Fort-Vanmeerhaeghe 2020 is **single-leg-jump** asymmetry *associated* with injury in **youth** (ANOVA p-values) — not CoD, not 3×, not "strongest" | "a risk factor, **not a validated predictor**" | `30da84e` |
| Sprint speed drop ">10% = 3–4× hamstring risk" | Edouard 2018 is a **mechanistic fatigue** study — no injury multiplier | "a **fatigue flag**, not a precise injury figure" | `30da84e` |
| Sprint exposure "<50% = 3× hamstring risk" | Malone 2017: the 3× (OR 3.02) is for rapid **increases** (spikes), and **lower-limb** broadly; moderate exposure is **protective** | "under-prepared; **spikes** are the strong signal" | `30da84e` |

This aligns the whole app with Niklas Virtanen's framing: **ACWR shows the *size*
of a load spike and whether it is *unfamiliar* — it is not an injury predictor.**

---

## 3. Calibrated against real data

**Foster strain "watch" threshold** disagreed across surfaces (4000 vs 4500).
Rather than pick by gut, it was computed over **4,556 real player-weeks** (exactly
as the lib does: dense zero-padded 7-day window, population SD, guards):

| Threshold | % of weeks flagged | Watch-only band (below the 6000 "danger" both libs agree on) |
|---|---|---|
| 4500 | 6.5% | 1.6% — barely any early warning |
| **4000** ✓ | 8.5% | **3.6% — a genuine early-warning spread, still rare** |

Unified every surface to **4000** (`c84f885`). A "watch" tier exists to warn
*before* danger; 4000 does that, 4500 effectively didn't.

---

## 4. Canonical-verdict compliance

The rule: a player's readiness **colour** must come only from
`v_coach_readiness_today_v8.final_color`, never from the trajectory engine
(`athlete_decision_history.athlete_state`) or the training action
(`stage4_decisions.system_decision`).

- **14 of 15** audited reads were clean (trajectory/action used for their
  legitimate purposes, or prompt-keys populated *from* the canonical colour).
- **1 violation fixed** (`b991d42`): the player colour pill fell back to
  `system_decision` (a training action: RECOVERY/REDUCED/FULL → RED/YELLOW/GREEN)
  when the canonical colour was absent. Now: `final_flag → final_color →
  readiness_level`, never the action.

---

## Literature cited (PubMed)

Source: PubMed. DOIs:
- Impellizzeri FM et al. 2020, *Acute:Chronic Workload Ratio: Conceptual Issues and Fundamental Pitfalls* — https://doi.org/10.1123/ijspp.2019-0864
- Lolli L et al. 2017, *Mathematical coupling causes spurious correlation within the ACWR* — https://doi.org/10.1136/bjsports-2017-098110
- Gabbett TJ, Hulin BT et al. 2016, *High training workloads alone do not cause sports injuries: how you get there is the real issue* — https://doi.org/10.1136/bjsports-2015-095567
- Malone S et al. 2017, *High-speed running and sprinting as an injury risk factor in soccer* — https://doi.org/10.1016/j.jsams.2017.05.016
- Edouard P et al. 2018, *Sprint Acceleration Mechanics in Fatigue Conditions* — https://doi.org/10.3389/fphys.2018.01706
- Fort-Vanmeerhaeghe A, …, Bishop C 2020, *Higher Vertical Jumping Asymmetries … Injury Incidence in Youth* — https://doi.org/10.1519/JSC.0000000000003828
- McBurnie AJ et al. 2021, *Deceleration Training in Team Sports: Another Potential 'Vaccine' for Injury?* — https://doi.org/10.1007/s40279-021-01583-x
- Harper DJ, McBurnie AJ et al. 2022, *Biomechanical and Neuromuscular Performance Requirements of Horizontal Deceleration* — https://doi.org/10.1007/s40279-022-01693-0

---

## Audit trail (verified commits, June 2026)

**Credibility & safety (P0):**
`6f72669` Methodology page · `c1c7450` test runner + CI on the decision engine ·
`c81d749` centralised auth (no silent anon fallback) · `9cd7a2d` strip prod
`console.*`.

**Science / verdict corrections:**
`b991d42` canonical-verdict fix · `c84f885` Foster calibration · `8259e8d` +
`77146d7` ACWR reframe · `30da84e` injury-multiplier softening.

Every commit above is tsc-clean and passes the 221-test decision-engine suite.

---

*Maintained alongside the code. When a threshold, citation, or verdict source
changes, update this document and the [Methodology page](../src/app/methodology/page.tsx)
together — one source, one verdict, verifiable everywhere.*
