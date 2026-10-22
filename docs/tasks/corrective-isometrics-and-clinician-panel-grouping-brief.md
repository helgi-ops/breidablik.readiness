# Brief — isometric options in the corrective plan + group the clinician reference panels

Two small, related refinements to the movement-screen corrective flow
(`src/lib/micropulse/movementScreen/correctives/`, `src/components/movement/CorrectiveTab.tsx`). Both are
data / presentation changes — no pipeline change. Screening / training only — never a diagnosis, never the
readiness colour; rules recommend the block, the coach confirms / overrides.

## Part A — add an isometric layer to the corrective library

**The gap.** The corrective library has only two isometric entries (`ball_squeeze_isometric`,
`spanish_squat_iso`) and **both belong to the rehab tracks** (groin / ACL impairment). The compensation-driven
**corrective plan itself** (dynamic valgus, forward trunk lean, etc.) has **no explicit isometric option** — it
runs dynamic activation → mobility → integrate. Isometrics are a legitimate, evidence-supported tool for the
plan's **activate** phase: high muscle activation at low joint stress, useful for activation/capacity, for
grooving a position, and as an **entry load when dynamic loading is provocative**.

**Honest framing (must be in the copy).** Add isometrics as an **activation / capacity / entry-loading** option
— **not** as a proven pain reliever. The "isometrics produce analgesia" claim (Rio 2015, patellar tendon) has
**not** been consistently replicated (van Ark 2016 partial; several Achilles/other cohorts negative). So the
rationale we ship is muscle activation (%MVIC) + capacity + tendon adaptation (Baar), never "kills pain."

**New entries** — `corrective_exercises` rows / EMG-library seeds, `phase: "activate"`,
`targetKind: "strengthen"`, `source: "emg_library"`, each tagged with the compensations it `addresses` and a
`%MVIC` band + citation where the folder EMG supports it:

- **Isometric side-lying hip-abduction hold** — Gluteus medius, high %MVIC (Macadam; Ebert). Dose e.g.
  5 × 20–30 s. `addresses: ["dynamic_valgus", "hip_abductor_weakness", "limb_asymmetry"]`.
- **Standing isometric hip-abduction (wall-press)** — Gluteus medius, high %MVIC (Macadam — standing banded
  abduction is a top-ranked Gmed exercise; the wall-press is its isometric form). Same `addresses`.
- **Isometric glute-bridge / hip-thrust hold** — Gluteus maximus, high %MVIC (folder Gmax reviews). Dose
  5 × 20–30 s. `addresses: ["forward_trunk_lean", "hip_abductor_weakness"]`.
- **Isometric single-leg heel-raise hold** — plantar-flexor / calf capacity; ties the **Baar tendon-adaptation
  entry** (isometric up-regulates collagen/scleraxis). Dose e.g. 5 × 30–45 s (or short frequent bouts per Baar).
  `addresses: ["limb_asymmetry"]` (calf capacity; supports the ankle track).
- **Wall sit (isometric quad)** — quadriceps capacity, an entry option for absorption findings. Dose
  5 × 30–45 s. `addresses: ["poor_absorption"]`.
- (Trunk isometrics — side-bridge / Pallof holds — already exist in the low-back track; reuse, don't
  duplicate.)

**Wiring.** Add each slug to the relevant compensation → slug list (the curated-library routing), so the
plan's **activate** phase surfaces an isometric alternative alongside the dynamic activation exercise
(secondary alternative, per the existing primary/secondary rule — the coach picks). Keep the `CompensationKey`
union unchanged (no new keys). Optionally add a light boolean `isometric?: true` to `CorrectiveExercise` for a
clear "isometric hold" tag in the UI — do **not** add a new `CorrectivePhase` (keep the NASM continuum small,
per the registry's own note); isometrics live in `activate`.

**Why it's the right default.** Isometric glute-med and calf capacity target the two most common valgus/lean
drivers, at low joint stress — a sensible activation/entry option the coach can choose when a player tolerates
holds better than dynamic reps. Coach/clinician-overridable; grounded in folder EMG (%MVIC) + Baar (tendon).

## Part B — group the four clinician panels under one reference header

**The issue.** Behind the existing **"Rehab & clinician detail — Show ▸"** toggle, `CorrectiveTab` stacks four
distinct clinician cards — `RehabTrackCard`, `KingProgramCard` (Enda King program template), `TendonLoadingCard`
(tendon loading & collagen nutrition), `RehabProtocolLinkCard` (matching staged-loading protocol) — plus
`OrthopedicTestsCard`. Each has a distinct role and belongs here (this is the **S&C / clinician drill-down**, per
the manifesto — not head-coach content, correctly gated to when a rehab track / injury is in play). But five
cards read as five separate features rather than one reference section.

**The change (presentation only).** Wrap them under a single labelled sub-header inside the drawer — e.g.
**"Clinician / S&C reference"** (IS: **"Klíník / S&C uppflettiefni"**) — with a one-line intro that these are
reference material for the treating clinician / S&C when a rehab track is active, not steps the head coach
actions. Keep each card's own content and gating unchanged; this is purely grouping + a header so the layered
read stays clean (verdict → plain facts → this reference block last). No logic change.

## Acceptance

- The corrective library gains the isometric activation entries above (`phase: "activate"`, %MVIC + citation
  where supported, `addresses` tagged), wired into the compensation → slug lists so the plan's activate phase
  offers an isometric alternative; `CompensationKey` union unchanged; optional `isometric?` flag only (no new
  phase).
- Copy frames isometrics as **activation / capacity / entry loading + tendon adaptation (Baar)** — **never** as
  proven analgesia (the Rio 2015 claim is flagged as not consistently replicated). Evidence grades carried.
- The four clinician cards + ortho-tests render under one **"Clinician / S&C reference"** sub-header inside the
  existing detail drawer, with a one-line intro; no card logic or gating changes.
- Descriptive only — never the readiness colour; coach/clinician-overridable; pain / red flags → clinician.
  EN default / IS toggle. Lint + typecheck clean (`npx eslint` on touched files); manifesto five-question check
  passes.

Ref: `src/lib/micropulse/movementScreen/correctives/registry.ts` (CorrectiveExercise, CorrectivePhase,
CompensationKey, MvicBand, existing `ball_squeeze_isometric` / `spanish_squat_iso`),
`src/lib/micropulse/movementScreen/correctives/mapping.ts` (compensation → slug routing),
`src/components/movement/CorrectiveTab.tsx` (the detail drawer, lines ~197–217),
`docs/research/corrective-exercise-library-evidence.md` (folder EMG: Ebert / Macadam / Bolgla %MVIC),
`docs/research/tendon-loading-nutrition-baar-evidence.md` (isometric tendon entry), `docs/explainability-first.md`.
Isometric-analgesia caveat: Rio et al. 2015 (patellar, immediate analgesia) vs van Ark 2016 and Achilles/other
cohorts (not consistently replicated) — cite honestly, do not claim analgesia.
