# Brief — post-screen orthopaedic assessment suggestions (clinician-referral layer)

**Goal:** after a movement screen (OHSA / SLDJ) flags a compensation, MicroPulse suggests the **relevant
orthopaedic special tests / regions a clinician would assess next**, each with a **plain-language
explanation** of what it screens for and why it's relevant — so the coach gets *ideas* and the *clinician*
does the assessment. Reference: Magee, *Orthopedic Physical Assessment* (the standard text). This is a
**referral/education layer**, not a diagnostic tool: MicroPulse suggests, a clinician tests and interprets.

Ties to: the movement-test framework + the King **Initial Ax** assessment schema (already has Thomas,
FABER, Hip IR/ER, adductor squeeze, etc.), Total Player Analysis, `clinical-reports` access-gating.

## Two hard rules

1. **Copyright.** Magee is a copyrighted textbook (the uploaded copy is a z-lib/unauthorised copy). **Cite
   it** as the reference/further-reading — but **do not reproduce its text, procedures or figures** in the
   product. MicroPulse writes its **own** short explanations (grounded in Magee + primary/open sources); for
   full test procedures, point the clinician to a legitimate copy of Magee or an open clinical source. The
   club should own a licensed copy.
2. **Medical boundary.** Orthopaedic special tests are **clinical assessment — performed and interpreted by
   a physiotherapist/doctor, never by a coach making a diagnosis.** Every suggestion is framed as "what a
   clinician would look at next / refer for," and any pain, red flag or suspected pathology → **refer to a
   clinician**. MicroPulse never outputs a diagnosis and never sets the readiness colour.

## The mapping — finding → region → suggested clinical tests (+ explanation)

A data-driven map (`assessment_suggestions`: `finding → region → [test]`), each test with a **MicroPulse-
authored plain explanation** (what it screens for, why it's relevant to this finding) and a **"clinician
performs/interprets"** tag. Seed set (test *names* only — standard, non-protectable; explanations are ours):

- **Medial knee displacement / dynamic valgus** → **hip/pelvis:** Trendelenburg (gluteus-medius/pelvic
  control), FADIR & FABER (hip impingement / joint mobility), Ober's (TFL/IT-band length), Thomas (hip-flexor
  length); **ankle:** weight-bearing dorsiflexion (knee-to-wall). *Explanation e.g.:* "Knees caving in on
  landing/squat can come from weak hip control or limited ankle dorsiflexion — a clinician checks hip
  abductor strength/control (Trendelenburg) and hip/ankle mobility."
- **Excessive forward trunk lean / limited squat depth** → **ankle:** knee-to-wall dorsiflexion; **hip:**
  Thomas, hip-flexion ROM. *"A forward-leaning squat often reflects restricted ankle dorsiflexion or hip
  mobility — a clinician measures these."*
- **Groin-pain-provoking findings (e.g. Anton Logi)** → **hip/groin:** adductor squeeze test (45°/0°), FADIR,
  hip ROM (IR/ER), palpation of the five clinical entities (adductor, iliopsoas, inguinal, pubic, hip) —
  within the Doha/HAGOS framework. *"Groin pain on hip loading needs a clinician's differential (Doha
  agreement) before loading."* → refer.
- **Single-leg instability / poor landing control** → **knee:** ligament integrity screen (a clinician's
  call — e.g. Lachman/pivot-shift if trauma history), + hip control tests as above. *Trauma/instability →
  refer, do not load.*

(Extend per region as the library grows; the region taxonomy follows Magee's joint chapters — foot/ankle,
knee, hip/pelvis, lumbar, thoracic, shoulder — which is factual structure, not reproduced content.)

## How it surfaces

- On a movement-screen result (in Total Player Analysis / the screen view), a **"Clinical assessment ideas"**
  panel lists the suggested tests for each flagged finding, each with its one-line explanation + a
  **"clinician performs & interprets — refer if painful / red flag"** note. Collapsible (Level-2 detail),
  never in the primary verdict.
- Suggestions **feed the assessment record** (the King **Initial Ax** schema — R/L, 0–5, pain-flag): the
  clinician records the actual test results there, which then feed Total Player Analysis (athlete-axis
  weaknesses) and gate the corrective/rehab program. So: screen flags → suggested tests → clinician assesses
  & records → drives the individualised program.
- **Explanations are the deliverable the coach asked for:** every suggested test carries a short, plain "what
  it screens for / why here" written in MicroPulse's voice (EN/IS), with **Magee cited as further reading**,
  not quoted.

## Acceptance

- A movement-screen finding shows a **"clinical assessment ideas"** list: relevant regions + named special
  tests, each with a MicroPulse-authored plain explanation and a **clinician-performs/refer** tag; Magee cited
  as reference, **no book text/figures reproduced**.
- Anything pain/red-flag routes to "refer to clinician"; MicroPulse outputs **no diagnosis** and never touches
  the readiness colour. Suggestions feed the Initial-Ax assessment record → Total Player Analysis.
- Copyright respected (cite, don't reproduce; licensed copy for full procedures). EN/IS. Lint + typecheck
  clean; manifesto five-question check passes.

Ref: Magee, *Orthopedic Physical Assessment* (citation/further-reading only — not reproduced);
`docs/tasks/movement-screen-video-to-tpa-and-strength-spec.md`,
`docs/tasks/enda-king-anton-logi-program-inventory.md` (the Initial-Ax assessment schema),
`docs/research/overhead-squat-assessment-evidence.md`, `TotalPlayerProfile.tsx`, `clinical-reports`
(access-gating). Prefer primary/open clinical sources (Doha agreement for groin; validated special-test
studies) for the explanations alongside Magee.
