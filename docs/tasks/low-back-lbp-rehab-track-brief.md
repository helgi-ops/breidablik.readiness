# Brief — low-back (LBP) rehab/prehab track for the deficit ledger

**Goal:** close the biggest anatomical gap in the rehab library. The deficit ledger + movement screen can
already *observe* a low-back finding (forward-lean / hip-hinge fault, trunk control, hip/T-spine mobility),
but there is **no low-back track to send it to** — `ModuleRegion` today = `patellar | achilles | adductor |
ankle | hamstring` (+ King groin/ACL). This adds a **lumbar** track on the same pattern (phases + exit
criteria + corrective mapping + load link), grounded honestly in the LBP evidence.

Screening / training-support only — **never a diagnosis**. Low back has the sport's most important **red-flag
gate**: any suspected radicular (leg pain/numbness), saddle anaesthesia or bladder/bowel change, night pain,
trauma or systemic feature → **stop, clinician immediately** (cauda equina is an emergency). The track is for
non-specific mechanical LBP a clinician has cleared, plus prehab for asymptomatic capacity gaps.

## Honest evidence framing first (read before building)

LBP is the **most contested** area in this library — build it modest, not as a "cure":

- **Most LBP is non-specific** — no identifiable pain-generating structure (Maher, Underwood & Buchbinder
  2017, *Lancet* — landmark LBP series). So the track targets **capacity, motor control and load**, not a
  named lesion. Don't imply the system diagnoses a disc/facet/etc.
- **Exercise helps, but no single type is clearly superior.** Exercise reduces pain and disability in chronic
  LBP (Hayden et al. 2021, *Cochrane*), and motor-control exercise beats minimal intervention but is **about
  equal to other exercise** (Saragiotto et al. 2016, *Cochrane*). → offer a sensible, well-tolerated default;
  **do not claim** McGill/motor-control is proven best.
- **The McGill "big-3"** (curl-up, side-bridge, bird-dog) is a reasonable **trunk-endurance / motor-control**
  base with strong practitioner uptake; the *specific* big-3's superiority is **not** established. Frame it as
  *a* capacity base, cited, coach-overridable.
- **Regional interdependence** is the most defensible athlete angle: **hip mobility (esp. IR) and thoracic-spine
  stiffness** load the lumbar spine; **hip-hinge patterning** spares it. This ties LBP straight into the
  movement screen (hip/T-spine ROM, hinge quality) the system already runs.
- **Load matters:** spikes in training load associate with LBP in athlete populations — the **same ACWR-style
  load-driven early-warning** the system already runs for hamstrings/calf applies (individualise, monitor for
  management, **not** prediction).
- **A directional-preference sub-group** (centralisation / McKenzie) responds to repeated end-range loading —
  worth a flag, but **clinician-assessed**, not a coach default.
- **Honest grade:** exercise-for-LBP = well-supported (Cochrane); *which* exercise = no clear winner; McGill
  big-3 = reasonable/practitioner-backed, not proven-superior; regional-interdependence + load = defensible
  mechanisms. Track = capacity + motor control + mobility + load management; clinician gates red flags,
  radicular and directional-preference calls.

## The lumbar track (same shape as calf/Achilles/groin)

`ModuleRegion += "lumbar"`; `RehabModule` `{ region: "lumbar", href: "/coach/low-back", label: "Low Back" }`.
Clinician-cleared, non-specific mechanical LBP (+ asymptomatic prehab). Phases, criteria-gated:

1. **Screen / clearance** — clinician establishes it is non-specific mechanical LBP (red flags & radicular
   ruled out; directional-preference / structural calls are clinician territory). Record on the King
   Initial-Ax-style assessment schema; outcome measure: **Oswestry (ODI)** or **RMDQ**.
2. **Settle + foundation** — reduce provocation, **normalise the daily pattern** (sitting/hinge), restore
   pain-free ROM; begin **trunk-endurance/motor-control base** (McGill big-3: curl-up, side-bridge, bird-dog —
   endurance holds, not max reps) + breathing/bracing. (Parallels the calf-track "foundation" phase.)
2b. **Mobility contributors** — address the **hip (esp. IR) + thoracic-spine** restrictions the screen flags
   (regional interdependence) + **hip-hinge patterning** to load-share off the spine. These are also the OHSA
   forward-lean/hinge drivers, so findings de-duplicate with the existing corrective mapping.
3. **Loaded strengthening** — progressive **hip-hinge loading** (RDL/hip thrust/KB), **carries/anti-flexion +
   anti-rotation** (Pallof, suitcase carry), posterior-chain capacity; build trunk endurance under load.
   Football emphasis = **strength-endurance + rotational tolerance**, tailored to demands.
4. **Power / plyometric + rotational** — energy-storage and **rotational power** (med-ball throws, chops) once
   strength benchmarks met.
5. **Running / sport reintegration → RTS** — graded running → sprint/cutting → sport-specific, criteria-gated;
   ongoing **load-management** (avoid sudden spikes; prior-LBP = higher risk).

## How it plugs into the unified engine

- A lumbar/hip-hinge/trunk-control finding (movement screen → hypothesis; clinician → confirmed) lands in the
  **deficit ledger** with confidence + provenance, **reconciled** with hip/T-spine mobility findings (same
  root → one higher-confidence deficit, not stacked flags).
- The **corrective/prehab consumer** pulls it → big-3 endurance + hip/T-spine mobility + hinge patterning
  (mapped in the corrective library, folder-EMG-grounded where activation matters); the **clinician** owns the
  loaded rehab progression and any directional-preference programming.
- The **load monitor** flags LBP-relevant spikes (prior-LBP players higher risk) — management, not prediction.
- Coach/clinician-overridable; descriptive; **never the readiness colour**; red-flags/radicular → clinician.

## Acceptance

- `ModuleRegion` gains **`lumbar`** with a `/coach/low-back` module and criteria-gated phases (screen/clearance
  → settle+foundation → mobility → loaded strengthening → power/rotational → running/RTS), exit criteria, and
  an ODI/RMDQ outcome field on the assessment record.
- Low-back / hip-hinge / trunk-control screen findings write to the **deficit ledger** and reconcile with
  hip/T-spine mobility deficits (one combined priority, not duplicate flags); corrective consumer maps them to
  big-3 + hip/T-spine mobility + hinge patterning; clinician owns loaded progression.
- **Red-flag & radicular gate is explicit and prominent** (cauda-equina emergency wording); directional
  preference is clinician-assessed. Evidence grades carried through (exercise = supported; specific method =
  no clear winner). Descriptive only — never the readiness colour. EN default / IS toggle. Lint + typecheck
  clean; manifesto five-question check passes.

Ref: Maher, Underwood & Buchbinder 2017 (*Lancet*, non-specific LBP — landmark series); Hayden et al. 2021
(*Cochrane*, exercise for chronic LBP); Saragiotto et al. 2016 (*Cochrane*, motor-control exercise); McGill
(*Low Back Disorders* — big-3 / trunk-endurance model, practitioner-standard, cite not reproduce); regional
interdependence (hip IR + T-spine → lumbar load); athlete load–LBP association literature (full-text
verification of specifics pending — flag as with the calf/Achilles notes). Ties to
`unified-individualisation-engine-deficit-ledger-spec.md`, `movement-quality-rehab-library-king-framework-brief.md`,
`corrective-exercise-library-and-mapping-brief.md`, `src/lib/rehab/stageTemplates.ts` (ModuleRegion),
`movement-screen-test-catalogue-brief.md` (hip/T-spine/hinge screen), the load monitor / early-warning.
