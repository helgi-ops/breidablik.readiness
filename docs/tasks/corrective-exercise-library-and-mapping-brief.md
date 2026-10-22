# Brief — corrective-exercise library + movement-screen → strength mapping

**Goal:** close the loop from the movement screen to training. A screen finding (e.g. Aron Bjarnason's
**dynamic knee valgus** + **forward trunk lean** from `MicroPulse-MovementScreen-Aron-Bjarnason-2026-09-06`)
should auto-generate a **corrective-exercise prescription** that lands in the player's strength programme and
in Total Player Analysis, then re-screens to confirm it closed. Screening/training only — never a diagnosis,
never the readiness colour. Rules recommend; the coach decides and overrides.

Files: the movement-test framework (`docs/tasks/movement-screen-video-to-tpa-and-strength-spec.md`), OHSA
evidence (`docs/research/overhead-squat-assessment-evidence.md`), the strength system
(`src/app/coach/custom-templates`, `programme-library`, VBT), `TotalPlayerProfile.tsx`.

## 1 — Corrective-exercise library (new)

A table `corrective_exercises` (+ typed config) — the counterpart to the movement-test registry. Each entry:

- **identity** — id/slug, name (EN/IS), a short cue, optional **video URL** (e.g. the YouTube link the coach
  supplies — pending identification), category.
- **corrective phase** — NASM continuum: `inhibit` (SMR/foam-roll) / `lengthen` (static stretch) /
  `activate` (isolated strengthening) / `integrate` (dynamic pattern). This is the ordering that makes a
  prescription coherent.
- **target** — muscle/quality (e.g. glute medius, gastroc/soleus, ankle dorsiflexion, erector spinae) and
  whether it's a **release** (overactive) or **strengthen/mobilise** (underactive/restricted) target.
- **dose** — sets × reps or time (e.g. foam-roll 30–60 s; static stretch 2×30 s; activation 2–3×10–15;
  integration 2–3×10), and frequency (2–3×/wk or daily warm-up primer).
- **evidence + citation**, and a **confidence/grade**.

## 2 — The mapping (finding → correctives)

A `compensation → corrective set` map (data, not code) so a screen finding pulls the right exercises across
the four phases. Ground it in the OHSA evidence note. The two Aron findings, as the seed mappings:

Exercise **selection + ordering is grounded in the research folder's primary EMG/%MVIC studies** (not NASM):
the correctives are chosen by measured gluteal activation and progressed by load, so the library is
evidence-ranked rather than convention-based.

**Dynamic knee valgus (MKD)** — *(weak glute med/max + ER; ± restricted ankle dorsiflexion — Bell 2008/2012;
Padua 2012; Macrum 2012; trainable, Bell 2013)*. Progress glute-med/max load by %MVIC (Ebert et al.,
systematic review: low 0–20 → moderate 21–40 → high 41–60 → very-high >61):
- **activation (low %MVIC):** bilateral bridge, prone/quadruped hip extension, side-lying hip abduction (Ebert)
- **loading (high Gmed, 81–103 %MVIC — Macadam et al.):** side-lying hip abduction, **standing hip abduction
  with elastic resistance at the ankle**, side bridge with hip abduction
- **functional / unilateral (high Gmax, 79–113 %MVIC — Macadam; Bolgla five-WB):** lateral step-up, cross-over
  step-up, rotational single-leg squat; single-leg squat > single-leg stance
- **ankle-DF mobility:** knee-to-wall / banded ankle mobilisation + calf work (restricted DF drives valgus —
  Macrum 2012; ankle-ROM in football — folder)
- **integrate:** goblet/ball squat with knee-tracking cue → the unilateral step-ups above

**Excessive forward trunk lean** — *(underactive glutes / posterior chain; ± ankle-DF restriction)*:
- **glute max (highest activation — folder Gmax systematic reviews):** barbell hip thrust, back squat, split
  squat elicit high Gmax; add bridges as activation
- **posterior chain:** hip-hinge patterning, back extension
- **ankle-DF + hip-flexor mobility** (as above)
- **integrate:** goblet squat (counterbalance keeps the torso upright) → box squat to depth

**Shared priority note:** where two findings share a root cause (Aron = ankle-DF restriction + weak glutes),
the mapping should **de-duplicate** and surface a combined priority (ankle-DF mobility + glute med/max) rather
than two overlapping lists — one efficient bundle.

## 3 — Wire into the strength programme + Total Player Analysis

- The screen produces a **corrective block** (the ordered inhibit→lengthen→activate→integrate set) that is
  written into the player's strength programme in the existing system (`custom-templates` / `programme-library`)
  — as a warm-up primer or a standalone corrective session, coach-overridable.
- The same finding surfaces in **Total Player Analysis** as the athlete-axis weakness + its lever (already the
  pattern in `preseason-buildup-from-total-player-analysis-brief.md`), so the corrective focus is visible on
  the player's profile and feeds the individualised block.
- **Close the loop:** schedule a **re-screen** (e.g. 4–6 weeks) and show the trend — did valgus / trunk lean
  improve? (Bell 2013: the compensation is trainable and closes on re-screen.) This is the credibility hook.

## 4 — Research to ground the library (from the research folder — NOT NASM)

Exercise **selection and progression come from primary EMG / %MVIC studies in the club's research folder**, so
each corrective is ranked by measured activation of the target muscle:

- **Ebert et al. — *A Systematic Review of Rehabilitation Exercises to Progressively Load the Gluteus
  Medius*** — stratifies Gmed exercises by %MVIC (low 0–20 / moderate 21–40 / high 41–60 / very-high >61):
  prone/quadruped/bilateral bridge = low; specific hip abduction/rotation = moderate–high; unilateral stance
  with contralateral limb movement = high/very-high. → the **loading progression**.
- **Macadam et al. — *Gluteal muscle activity during dynamic hip abduction and external rotation: a
  systematic review*** — highest **Gmed** = side bridge with hip abduction, standing hip abduction with
  elastic resistance at the ankle, side-lying hip abduction (81–103 %MVIC); highest **Gmax** = lateral
  step-up, cross-over step-up, rotational single-leg squat (79–113 %MVIC). → the **exercise ranking**.
- **Bolgla — *EMG of gluteus medius in five weight-bearing exercises*** — single-limb stance > double-limb;
  single-limb squat > single-limb stance; unstable surface adds activation. → the **weight-bearing progression**.
- **Gmax activation systematic reviews (folder)** — hip thrust / back squat / split squat elicit high Gmax →
  posterior-chain selection for the forward-lean mapping.
- **ACL injury-risk movement review (folder)** — valgus loading relates to neuromuscular control / which
  muscles must be strong-and-active → supports targeting the glutes for valgus control.
- **Cause papers (uploaded set):** Bell 2008/2012; Padua 2012; Macrum 2012 (ankle-DF drives valgus); Bell 2013
  (valgus reduced by an exercise intervention → the re-screen loop).
- **Honest grade:** correctives target trainable compensations and re-screen confirms change — but keep the
  injury-prediction caveat (Bonazza 2017; Dorrel 2015): this improves movement quality, it is not sold as
  injury-risk reduction. Pain / red flags → clinician.

*(The generated screen PDF cites "NASM-CES" for the forward-lean interpretation — swap that line for the
folder Gmax activation reviews so the whole chain is primary-source.)*

## The YouTube exercise the coach supplied

`https://www.youtube.com/watch?v=sWofU_ssCb0` — to be added as a `corrective_exercises` entry once
identified (web fetch was rate-limited; confirm which exercise/target it is). Tag it by phase + target so it
slots into the right mapping.

## Acceptance

- A `corrective_exercises` library + `compensation → corrective set` map exist (data-driven; new entries =
  rows, not code).
- Aron's screen (valgus + forward lean) auto-generates the ordered corrective block above, de-duplicated to
  the shared ankle-DF + glute priority, written to his strength programme and shown in Total Player Analysis
  with citations + grade; a re-screen is scheduled and trends.
- Everything coach-overridable; screening/training only; never the readiness colour; pain/red-flags →
  clinician. EN/IS. Lint + typecheck clean; manifesto five-question check passes.

Ref: `docs/research/overhead-squat-assessment-evidence.md`,
`docs/tasks/movement-screen-video-to-tpa-and-strength-spec.md`,
`MicroPulse-MovementScreen-Aron-Bjarnason-2026-09-06.pdf`, `src/app/coach/custom-templates` +
`programme-library` (strength delivery), `TotalPlayerProfile.tsx` (athlete-axis lever). NASM-CES + the Bell/
Padua/Macrum cluster as the evidence base.
