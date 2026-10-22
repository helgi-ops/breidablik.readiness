# Spec — Unified individualisation engine: all data → deficit ledger → one plan

**The capstone.** Every piece exists — movement-screen catalogue, rehab knowledge (King / Baar / Green /
Maffulli / folder-EMG), corrective library, per-player periodization, IMA variables, VALD, VBT, load monitor,
Total Player Analysis. What's missing is the **connective tissue**: a single **per-player deficit ledger**
that every data source writes to (with confidence + provenance), that gets **reconciled**, and that **both**
the corrective/prehab program **and** the strength/periodization block read from — producing **one
individualised plan** per player. Descriptive/advisory — never sets the readiness colour; rules recommend,
the coach (and clinician for medical) decide.

This spec defines the ledger, what each source writes, the reconciliation, the two consumers, and the
honesty rules. It is the hub the earlier briefs plug into (they define the *edges*; this defines the *centre*).

## 1. The deficit ledger — the core data model

A table `player_deficits` — the single source of "what's off with this player and how sure are we." One row =
one deficit/quality, from one source, at one time:

- `player_id`, `quality` (controlled vocabulary — e.g. `glute_med_ER_control`, `ankle_dorsiflexion_mobility`,
  `hamstring_capacity`, `landing_valgus`, `reactive_strength_RSI`, `hip_IR_mobility`, `adductor_capacity`,
  `patellar_tendon_load_tolerance`, `trunk_antirotation`, `intersegmental_control`, `decel_mechanics`), `region`,
  `side` (L/R/bilateral).
- `domain` — one of the **8**: pain · mobility/ROM · movement quality · motor control · balance/stability ·
  strength/capacity · left–right asymmetry · speed/power/reactive.
- `severity` (mild/moderate/severe or scaled) + `value` (cm/deg/%/RSI/LSI/count) where measured.
- `status` — **hypothesis** | **confirmed** | monitoring | resolved. (Movement-screen findings enter as
  *hypothesis*; a confirmation test or an instrumented measure promotes to *confirmed* — the
  screen→finding→hypothesis→confirmation rule, made data.)
- `confidence` — source reliability × data maturity × repeats × scorer (see §4).
- `provenance` — `source` (movement_screen | vald | vbt | ima | load | clinical_ax | rehab_track |
  total_player_analysis), the specific test/metric, date, scorer.
- `evidence_grade` — from the research notes (STRONG / MODERATE / EMERGING / EXPERIMENTAL).
- `lever` — how to address it (link to the corrective library / rehab track).
- `confirmationTestsOutstanding[]`, `linkedCorrectives[]`, `linkedStrengthTargets[]`.
- `coachOverride` (dismiss / adjust / confirm) + note.

## 2. What each source writes (the edges → the ledger)

| Source | Writes deficits in domain(s) | Examples | Status on entry |
|---|---|---|---|
| **Movement screen** (catalogue) | movement quality, mobility, motor control, balance, asymmetry | knee valgus, pelvic drop, forward lean, DF restriction | **hypothesis** (+ its confirmation tests) |
| **Clinical assessment** (King Initial-Ax) | mobility, strength/capacity, pain, asymmetry | hip abd 3/5 L, FABER reduced, groin-pain-provoking | **confirmed** (clinician) |
| **VALD** (force plate) | strength/capacity, speed/power/reactive, asymmetry | RSI deficit, DSI, force asymmetry, LSI | **confirmed** (instrumented) |
| **VBT** | strength/capacity, speed/power | force-velocity gap (strength- vs speed-deficit) | **confirmed** |
| **IMA / GPS** | speed/power/reactive, asymmetry, movement quality | accel/decel L/R asymmetry, directional (fwd/back/lat) deficit, HSR deficit, stride | **confirmed** (measured) but **contextual** |
| **Load monitor** | (risk flag, not a deficit) | spike / robustness / prior-injury risk | flags a **prehab priority**, not a quality deficit |
| **Total Player Analysis** | aggregator (reads the ledger) — its athlete-axis weaknesses ARE ledger deficits surfaced | — | — |

IMA is the piece the coach specifically wanted in: it writes **mechanical/directional** deficits (accel/decel
asymmetry, directional load gaps) that neither VALD nor the movement screen sees — feeding both prehab
(directional/decel mechanics) and strength (unilateral, deceleration emphasis).

## 3. Reconciliation — the heart (why "more data = better" is actually true)

Raw rows are noisy and overlapping; the engine **reconciles** them into a per-player **deficit summary**
(don't just stack):

- **Aggregate the same quality across sources** → one deficit with **higher confidence**. Valgus on OHSA +
  SLDJ + step-down + confirmed by hip-ROM = one strong `glute_med_ER_control / ankle_dorsiflexion` target,
  not three weak flags. (This is the payoff of many inputs.)
- **Promote hypothesis → confirmed** when a confirmation test / instrument agrees; keep it a **hypothesis
  (hint)** until then.
- **Weight by confidence + maturity**: a force-plate LSI (10 reps) outweighs a 30-fps video RSI; a single
  screen < a repeated one.
- **Surface conflicts, don't silently pick**: if IMA says decel-asymmetry but VALD says symmetric, show both
  with confidences + a "needs a look" note — coach decides.
- **Priority for programming**: pain/clinical red-flag → clinician (out of the auto-plan) > confirmed
  high-severity > confirmed > high-confidence hypothesis > low-confidence hypothesis (= hint only).

Output: a ranked, de-duplicated **deficit summary** per player, each item with its aggregated confidence,
contributing sources, status, and outstanding confirmation tests.

## 4. Confidence model

`confidence = f(source reliability, data maturity, repeats, scorer experience, agreement across sources)`.
Movement-screen visual classifications get a reliability discount (per the measurement-property reviews);
instrumented (VALD/IMA) higher; agreement across sources raises it; small samples / single screens / thin
baseline lower it. Low-confidence deficits render as **hints**, never hard targets — the honest guardrail
against over-fitting.

## 5. The two consumers — one plan

Both read the reconciled deficit summary; nothing is a separate silo:

- **Corrective / prehab program** — pulls deficits in *mobility / movement-quality / motor-control /
  asymmetry* + the load-monitor prehab flags → the **corrective library** (folder-EMG %MVIC ranking + AFS 3D
  drivers) and the **rehab tracks** (King groin, Green calf, Maffulli/Baar Achilles, ACL) when clinical/injury
  deficits are present. Output: the player's corrective/prehab block.
- **Strength / periodization** — pulls *strength-capacity / speed-power / asymmetry* deficits → strength
  emphasis + **VBT force-velocity targeting** (where on the curve) + **load scaling / VALD cap / minutes
  trim** in the **per-player periodization block** (already built). Output: the individualised block.

These merge into **one plan** on the player's profile: prehab + corrective + strength emphasis + periodized
load, all traceable to the same ledger. Re-test (screen / VALD / IMA) updates the ledger → the plan adapts →
the loop closes.

## 6. Explainability + boundaries (manifesto)

- **Every plan item traces to its deficit(s) → source(s) → confidence → evidence grade → lever.** The coach
  sees *why* each corrective/strength target is there and can **override any deficit or plan item**.
- **Rules reconcile; the coach decides.** Nothing auto-applies to the readiness colour; the ledger is
  **descriptive** and separate from `v_coach_readiness_today_v8.final_color`.
- **Medical wall:** pain / red-flag / injury deficits route to the **clinician** and the rehab tracks, not the
  coach's auto-plan; movement classifications are **hypotheses**, never diagnoses.
- **Honesty:** low-confidence = hint; conflicts surfaced not hidden; evidence grades carried through; more
  data helps only via reconciliation + confidence, not blind stacking.

## 7. Staging

1. **Ledger + write from 2 sources** — `player_deficits` table; movement screen (hypothesis) + VALD
   (confirmed) write to it; Total Player Analysis reads it as the athlete-axis. Manual reconciliation view.
2. **Reconciler** — aggregate/dedupe/confidence/priority → the ranked deficit summary; hypothesis→confirmed
   promotion.
3. **Consumers wired** — corrective/prehab pulls from it; the per-player periodization block reads
   strength/asymmetry deficits (+ VBT/VALD caps). Add IMA + load + clinical-Ax + rehab-track writers.
4. **One plan + re-test loop** — merged plan on the profile; re-tests update the ledger; the plan adapts.

## Acceptance

- A `player_deficits` ledger exists; movement screen, VALD, VBT, IMA, clinical-Ax, load and rehab tracks
  write deficits with **domain, severity, status (hypothesis/confirmed), confidence, provenance, evidence
  grade, lever**.
- The **reconciler** produces a ranked, de-duplicated per-player deficit summary: **same finding across
  sources = one higher-confidence deficit**; conflicts surfaced; hypothesis→confirmed on agreement;
  low-confidence = hint.
- **Corrective/prehab** and **strength/periodization** both read the ledger → **one individualised plan** on
  the player profile, every item traceable to source+confidence+evidence+lever; re-tests update it.
- IMA mechanical/directional deficits demonstrably influence the plan (the coach's requirement). Coach can
  override any deficit/plan item. Descriptive only — never the readiness colour; pain/red-flags → clinician.
  EN/IS. Lint + typecheck clean; manifesto five-question check passes.

Ref (the edges this centre connects): `movement-screen-test-catalogue-brief.md` +
`movement-screen-video-to-tpa-and-strength-spec.md` (screen), `corrective-exercise-library-and-mapping-brief.md`,
`movement-quality-rehab-library-king-framework-brief.md`, `docs/research/{overhead-squat-assessment,
tendon-loading-nutrition-baar,calf-strain-rehab-green,achilles-tendinopathy-rehab}-evidence.md`,
`periodization-players-individualised-plan-brief.md`, `preseason-buildup-from-total-player-analysis-brief.md`,
`periodization-ima-variables-in-plan-and-pdf-brief.md`, `TotalPlayerProfile.tsx` + `playerAnalysis/*` (the
athlete-axis this generalises), VALD/VBT, the load monitor / robustness (#5), `docs/explainability-first.md`.
