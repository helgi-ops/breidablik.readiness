# Brief — movement-quality / rehab exercise library (Enda King framework + folder EMG)

**Goal:** a **rehab / return-to-play exercise library** for MicroPulse, organised around **Enda King's
published framework** and with exercise **selection grounded in the club's own EMG/%MVIC research** — so it's
"in King's spirit" and evidence-ranked, without reproducing his paid course/book content. Extends
`corrective-exercise-library-and-mapping-brief.md`. Screening/training + rehab-support only — never a
diagnosis, never the readiness colour; pain/red-flags → clinician.

**Honest scope note:** King's *publications* are predominantly **biomechanics, diagnosis and RTP-criteria**
research — they establish *what* to target and *how to test*, not a named exercise cookbook (that lives in his
courses). So this library takes his **principles + criteria** from the papers and fills the exercise slots
from the **primary EMG/loading studies in the research folder** (Ebert, Macadam, Bolgla, Gmax reviews) +
established loading science. Cite the papers; do not reproduce course material. Full-text extraction of the
open rehab papers (King 2018 groin BJSM; Kotsifaki 2023 Aspetar ACL CPG; Forelli 2024 VBT) is pending — the
sources timed out on fetch; complete it when the PDFs are uploaded or fetch recovers, then firm up the exact
categories.

## King's framework (from the publications) → what the library must encode

1. **Movement quality / intersegmental control over isolated strength.** Groin-pain rehab targeting
   *intersegmental control* improved clinical + biomechanical outcomes across 205 patients (King et al. 2018,
   BJSM); **hip strength explained only ~11%** of the HAGOS improvement (Baida et al. 2021, AJSM). →
   correctives must train **trunk–pelvis–hip coordination during movement**, not just muscle strength.
2. **Biomechanics-led, asymmetry-targeted.** Biomechanical asymmetries persist ~9 months after ACLR across
   jump/land and change-of-direction (King et al. 2018/2019); **biomechanics — not strength or performance —
   differentiates re-injury** (King et al. 2021, AJSM). → target the movement strategy + limb symmetry, not
   the strength number alone.
3. **Movement-pattern clusters.** Change-of-direction in groin pain splits into distinct movement clusters
   (Franklyn-Miller et al. 2017, BJSM). → the library should offer *cluster/strategy-specific* correctives,
   not one-size-fits-all.
4. **Criteria-based return-to-play.** Jump/CMJ/**single-leg drop jump** + limb-symmetry index + isokinetic
   strength gate progression (Kotsifaki et al. 2023 Aspetar ACL CPG; Crotty et al. 2022 SLDJ↔strength;
   ~9-month "sweet spot", Kotsifaki 2025). → each rehab track is **phased with exit criteria**, and the
   re-test is the loop-closer (ties to the movement-test framework).
5. **Progression: strength → plyometric/SSC → change-of-direction/cutting mechanics → sprint.** VBT to
   optimise return-to-sprint after ACLR (Forelli et al. 2024); cutting kinetics/kinematics change after
   successful rehab (Daniels et al. 2021). → the library is a *continuum*, not a flat list.

## Library structure — rehab tracks × phases (data-driven)

Extend the `corrective_exercises` library with **rehab tracks** (a `track` + `phase` + `exit_criteria` on
each entry), so a track is a phased continuum with symmetry/strength gates:

- **ACL / knee track** — phases: (1) impairment/isolated strength (quads/hamstring/glute), (2) bilateral →
  unilateral strength + **intersegmental control** (trunk-pelvis-hip during single-leg tasks), (3)
  **plyometric / SSC** progression (bilateral → unilateral, in-place → horizontal → change-of-direction), (4)
  **cutting/deceleration mechanics** + sprint (VBT). Exit gates = limb symmetry on SLDJ/CMJ + isokinetic
  thresholds (Kotsifaki 2023; King RTP work). Exercise slots filled from folder EMG (glute med/max ranking:
  Macadam, Ebert, Bolgla; hamstring: folder hamstring-activation papers; plyometric: folder plyometrics).
- **Athletic groin-pain track — the verified King/Baida 3-level programme** (confirmed from the full text of
  Baida/Gore et al. 2022, AJSM/OJSM; content published in King 2018 + Gore et al.). The programme "focuses on
  intersegmental control through **strength, linear running, and change-of-direction mechanics**" and runs in
  **3 criteria-gated levels**:
  - **Level 1 — Strength** (build capacity; intersegmental/gluteal control emphasis — reduced gluteal
    activation/strength is characteristic of AGP)
  - **Level 2 — Linear running movements** (incl. **plyometrics / SSC** — the programme improved eccentric
    RFD and shortened ground-contact time)
  - **Level 3 — Change-of-direction mechanics** (reactive cut re-training; movement-cluster-specific,
    Franklyn-Miller 2017)
  Progression is **individualised, gated by clinical milestones** (assessed by the treating PT, all required
  before RTP): **symmetrical hip flexion + internal-rotation ROM; pain-free squeeze test at 45° and 0° hip
  flexion; Thomas test; completed running programs.** Mean ~4.7 physio visits, RTP ~9.8 weeks.
  Emphasis is **intersegmental control + gluteal function** (pelvic/hip stability in the coronal + transverse
  planes), **not isolated hip strength** (Baida 2021: hip strength explained only ~11% of HAGOS improvement).
  Outcome/RTP tests: **continuous lateral hurdle hop** (10 side-to-side hops over a 15-cm hurdle on a force
  plate → GCT, peak vGRF, eccentric RFD, impulse), **single-leg squat** (control/loading insight, Marshall
  2015), reactive cut. Within-level exercise slots filled from folder EMG (adductor: Copenhagen adductor
  review + adductor EMG papers; gluteal: Macadam/Ebert/Bolgla); the exact per-level exercise list lives in
  King's supplemental material (pending).
- **Ankle track** — neuromuscular / proprioceptive training for chronic ankle instability (Lin, Delahunt &
  King 2012) + ankle-DF mobility (folder ankle-ROM papers) — also the ankle-DF driver of the OHSA valgus/lean.
- **Movement-screen correctives** — the OHSA/SLDJ findings (already specced) map into the same track/phase
  structure (e.g. Aron's valgus → the ACL/knee track's glute + intersegmental-control + plyometric phases).

Each entry keeps: NASM-free **phase** (activation → loading → plyometric/SSC → integration/mechanics),
target, dose, **%MVIC/evidence rank from the folder**, King-framework citation, confidence, optional video.

## Wire-in (same as the corrective brief)

Screen finding / rehab status → pull the track + current phase → write the block into the player's strength
programme (`custom-templates` / `programme-library`, VBT for the sprint phase) → surface in Total Player
Analysis → **re-test against the phase's exit criteria** (SLDJ/CMJ symmetry) to advance. Coach/clinician
overrides; nothing auto-advances a rehab phase.

## Acceptance

- The `corrective_exercises` library gains **rehab tracks + phases + exit criteria** (ACL/knee, groin, ankle)
  encoding King's principles (intersegmental control, biomechanics/asymmetry-led, criteria-based, strength→
  plyometric→cutting→sprint continuum), each cited to his papers.
- Exercise **selection within each phase is ranked by the folder's EMG/%MVIC evidence** (no NASM, no reproduced
  course content); phase advancement is gated by SLDJ/CMJ limb-symmetry + strength criteria and closes on
  re-test.
- Aron's screen findings map into the ACL/knee track phases. Everything coach/clinician-overridable;
  screening/training/rehab-support only, never the readiness colour or a diagnosis; pain/red-flags → clinician.
- EN/IS. Lint + typecheck clean; manifesto five-question check passes.
- **Pending:** full-text extraction of King 2018 (groin), Kotsifaki 2023 (Aspetar ACL CPG), Forelli 2024
  (VBT) to firm up exact phase categories + criteria thresholds — do when the PDFs are available.

Ref: Enda King publications (enda-king.com/publications) — King 2018 (BJSM, intersegmental groin rehab),
Baida 2021 (AJSM, hip strength only 11%), Franklyn-Miller 2017 (BJSM, CoD clusters), King 2018/2019/2021
(AJSM, ACLR asymmetry + re-injury biomechanics), Kotsifaki 2023 (BJSM, Aspetar ACL CPG), Forelli 2024 (IJSPT,
VBT return-to-sprint), Lin/Delahunt/King 2012 (ankle NMT); folder EMG (`research/...` — Ebert, Macadam,
Bolgla, Gmax reviews, adductor/Copenhagen, plyometrics); `docs/research/overhead-squat-assessment-evidence.md`;
`corrective-exercise-library-and-mapping-brief.md`; `movement-screen-video-to-tpa-and-strength-spec.md`.
