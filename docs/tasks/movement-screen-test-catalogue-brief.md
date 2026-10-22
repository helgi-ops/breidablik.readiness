# Brief — movement-screen test catalogue (seed the registry with published assessments)

**Goal:** seed the movement-test registry (`movement-screen-video-to-tpa-and-strength-spec.md`) with a
**broad, published catalogue** of movement-quality / mobility / stability / balance / landing / hop
assessments the **coach selects from** — grounded in the systematic-review evidence, not proprietary
systems. This is the primary test catalogue; OHSA + SLDJ (already specced) are members of it, and the Gray/
AFS triplane analyses are a later optional category. Feeds the **deficit ledger → corrective/prehab +
strength** (unified individualisation). Screening/training only — not diagnosis; not injury prediction.

## Grounding

Wijekulasuriya et al. (2025), *Sports Medicine – Open* — systematic review + meta-analysis of movement-
quality assessments in athletic populations: **131 studies, 36 assessments, 59 movements**, scored by Likert
or binary. Key take-aways to encode:

- **Movement quality extends well beyond the FMS** — bilateral, unilateral, slow-speed, jumping/landing,
  pushing/pulling and sport-specific tasks all matter; combine **slow-bilateral + slow-unilateral +
  high-speed-bilateral + high-speed-unilateral** for a broad picture (a slow squat says little about
  high-speed landing control).
- **Composite scores are more reliable than movement-specific scores**; **rater experience affects
  reliability** → carry a confidence that reflects scorer + repeat count.
- **The relationship between a screen and its target application (e.g. injury prediction) is not universal**
  → screens identify characteristics for **further assessment / programming**, not injury prediction.

## Catalogue structure (categories → tests)

Each test is a registry entry: category, **speed (slow/high) + laterality (bi/unilateral)**, planes, what it
screens, pose-measurable elements, scoring (binary/Likert), reliability/confidence note, and the
injury-prediction caveat. Categories (from the review + the coach's list):

- **Squat / lower-limb movement (slow):** overhead squat, bodyweight/deep squat, single-leg squat,
  pistol-squat, squat-to-box, **step-down** (forward / lateral), split squat, inline / forward / reverse /
  lateral / crossover lunge, walking lunge, single-leg RDL.
- **Mobility:** weight-bearing lunge (knee-to-wall) dorsiflexion, active/passive SLR, Thomas / modified
  Thomas, hip IR/ER, hip flexion/extension, FABER, shoulder flexion + IR/ER + combined reach, thoracic
  rotation/extension, cervical, multi-segmental flexion/extension/rotation.
- **Balance / motor control:** Y-Balance / SEBT (lower + upper quarter), single-leg / tandem stance, BESS /
  modified BESS, dynamic leap-and-balance, motor-control screen.
- **Core / trunk / upper-body control:** trunk-stability push-up, push-up, rotary-stability / bird-dog,
  plank, side-plank / side-bridge (± hip abduction), bridge / single-leg bridge / bridge-with-leg-extension,
  prone hip extension, CKC upper-extremity stability, loaded/farmer carry.
- **Jumping / landing (high-speed bilateral):** **LESS** / LESS-RT, drop vertical jump, drop-jump screen,
  CMJ, squat jump, broad jump, single-leg landing, bilateral-jump-to-unilateral-landing, repeated jump,
  tuck-jump.
- **Hop / agility (high-speed unilateral):** single hop for distance, triple hop, crossover hop, 6-m timed
  hop, lateral / side / vertical hop, single-leg hop-and-stick, repeated hop, figure-8 hop, LEFT, lateral
  shuffle / cutting / change-of-direction mechanics.

**Composite systems (reference-level):** FMS (7 patterns, 0–3), SFMA (clinical, pain-present), MCS / MCS-2,
MSST, Athletic Ability Assessment, Fundamental Capacity Screen — list as systems a coach may run, with their
components; see IP note.

## Default battery (~10–12 tests, ship this as "Standard movement screen")

Overhead squat · single-leg squat / step-down · inline/reverse lunge · knee-to-wall · active SLR · hip
rotation · shoulder mobility + overhead flexion · thoracic rotation · Y-Balance / SEBT · trunk-stability
push-up · drop jump + **LESS** · single-leg hop-and-stick. This spans slow-bilateral → slow-unilateral →
high-speed-bilateral → high-speed-unilateral (the review's breadth recommendation) and is more informative
than any single composite score.

## What the system looks at + expected findings (per test in the default battery)

Every test definition must carry **what to observe (checkpoints)**, **the expected findings/deviations
(scoreable outcomes)**, and **what each finding means → the deficit it writes to the ledger**. This is the
operational layer (as the OHSA already has). For the default battery:

- **Overhead squat** — *look at:* knee valgus, feet turn-out/pronation (front); forward trunk lean,
  arms-fall-forward, ankle-DF/heel-rise, depth (side); heel rise, calcaneal eversion, pelvic/scapular
  asymmetry (back). *Findings →* dynamic valgus (hip abd/ER weakness ± ankle DF), forward lean (ankle DF /
  posterior-chain), arms-fall-forward (thoracic/lat). See `overhead-squat-assessment-evidence.md`.
- **Single-leg squat / step-down** — *look at:* medial knee displacement / dynamic valgus, contralateral
  **pelvic drop (Trendelenburg)**, trunk lean/shift, foot pronation, depth + control, L/R asymmetry.
  *Findings →* valgus + pelvic drop = **glute med/ER weakness ± ankle DF**; poor eccentric control. *(Pose:
  valgus angle, pelvic obliquity, asymmetry.)*
- **Inline / reverse lunge** — *look at:* front-knee valgus/tracking, trunk & pelvis control, split-stance
  balance, depth, hip mobility. *Findings →* frontal/transverse control deficit, hip-mobility restriction,
  L/R difference.
- **Knee-to-wall (weight-bearing dorsiflexion)** — *measure:* max toe-to-wall distance with heel down + knee
  touching wall (cm), each side. *Finding →* ankle-DF ROM + **asymmetry** (flag a side difference; low DF
  drives squat valgus/forward lean).
- **Active straight-leg raise** — *look at:* raise height/ROM, pelvic control, opposite-leg stability, L/R.
  *Finding →* posterior-chain (hamstring) length / hip-flexion mobility + asymmetry.
- **Hip rotation (IR/ER)** — *measure:* internal + external rotation ROM (degrees), each side. *Finding →*
  hip-mobility restriction / asymmetry (feeds valgus + groin risk).
- **Shoulder mobility + overhead flexion** — *look at:* overhead reach, combined mobility (reach behind),
  symmetry. *Finding →* shoulder/thoracic restriction.
- **Thoracic rotation** — *measure:* seated rotation ROM, each side. *Finding →* thoracic mobility
  restriction / asymmetry (rotation + overhead sports).
- **Y-Balance / SEBT** — *measure:* normalised reach (% leg length) anterior / posteromedial / posterolateral
  + composite, each side; **anterior L/R asymmetry** is the key flag. *Finding →* dynamic single-leg control
  + asymmetry.
- **Trunk-stability push-up / rotary stability** — *look at:* moves as one unit (no lumbar sag/lag), timing,
  symmetry. *Finding →* trunk/core control + anti-rotation capacity.
- **Drop jump + LESS** — *count:* LESS errors — knee valgus at initial contact + peak, trunk flexion, foot
  position/rotation, landing stiffness, symmetry → LESS score. *Finding →* landing mechanics / ACL-risk
  kinematics. *(Pose-measurable frontal-plane valgus + asymmetry; RSI rough at 30 fps.)*
- **Single-leg hop-and-stick (+ hop-for-distance)** — *look at:* landing stability (stick vs hop/step),
  knee valgus, time-to-stabilise; hop distance → **limb symmetry index (LSI)**. *Finding →* unilateral
  high-speed control + LSI (RTP-relevant).

Recurring root causes surface across tests — **ankle dorsiflexion** and **glute med/ER control** are the two
that come up again and again (as in Anton's assessment) → the reconciler in the deficit ledger should
**aggregate a finding seen across multiple tests into one higher-confidence deficit** (e.g. valgus on OHSA +
SLDJ + step-down = strong glute/ankle target), not three separate weak flags.

Each test entry stores these as structured **checkpoints[]** (label, view/plane, pose-measurable?,
scoring) + **expectedFindings[]** (deviation → deficit → confidence) so the screen produces consistent,
ledger-ready output.

## Data model — the operational schema (screen → finding → hypothesis → confirmation)

The right model is **not pass/fail.** For every test, record: **what it challenges → every observable
result/deviation → what that result may *investigate* (a hypothesis, not a diagnosis) → the follow-up test
that confirms it.** This is the core rule and it must be enforced in the UI + data:

> **An observed compensation does NOT prove a muscle is "weak" or "tight."** A movement deviation has
> multiple possible explanations; the screen generates a **hypothesis** to be confirmed with more specific
> testing. Visual movement classifications have variable reliability/validity — never a standalone diagnosis
> or injury-prediction (measurement-property reviews: Lower-extremity functional tests 2024; SLS/step-down
> measurement properties 2022).

**Per-test schema (each registry row):**
- `challenges` — what regions/qualities the test loads (e.g. OHSA = integrated ankle/knee/hip/pelvis/trunk/
  thoracic/shoulder).
- `observations[]` — each `{ observation (the deviation), investigate (the hypothesis/-es it opens),
  confirmationTest (what to run next), poseMeasurable?, side }`. e.g. *knees move inward → investigate
  frontal-plane hip/knee/foot control → confirm with hip ROM + knee-to-wall + Y-Balance + single-leg
  landing.*
- `scoring` — binary / Likert / measurement (cm, deg, %, count, time), per the validated protocol; use the
  test's own criteria (e.g. LESS uses LESS scoring — don't invent cutoffs).
- `reliability` — measurement-property note + confidence (scorer experience, repeats, pose quality).
- `followUp[]` — the confirmation tests this one points to.

**Every result is tagged across 8 domains** (so one deviation isn't collapsed into "weak glute med"):
1. Pain/symptoms · 2. Mobility/ROM · 3. Movement quality · 4. Motor control · 5. Balance/stability ·
6. Strength/capacity · 7. Left–right asymmetry · 8. Speed/power/reactive control.

**Recording format (replaces pass/fail)** — structured, per side, per region/domain. e.g. a single-leg
squat records: quality (Likert), pain (0–10), foot, ankle, knee, hip, pelvis, trunk, depth, balance, tempo,
symptoms, L/R difference, **follow-up tests** — not "SLS: Fail." This is what makes it actionable and
ledger-ready.

**Hypothesis → confirmation examples (seed the `observations` map):**
- *Knee valgus (SLS/OHSA/landing)* → investigate hip strength/control, hip ROM, ankle DF, foot mechanics,
  balance, fatigue, symptoms → confirm: hip ROM + knee-to-wall + Y-Balance + single-leg landing + isolated
  hip strength.
- *Heel rise (squat)* → ankle DF → confirm: knee-to-wall, compare sides, **heel-elevated squat retest**.
- *Pelvic drop (step-down)* → hip strength/capacity + trunk strategy + balance + pain → confirm: SLS +
  Y-Balance + isolated hip-abductor capacity.
- *Active SLR restricted, passive normal* → motor control/strength/tolerance (not tissue length) → confirm:
  passive SLR + strength test.

**Seed source:** the full per-test observable→investigate tables (the ~40+ tests: squat family, mobility,
balance, core/trunk, jump/land, hop/agility, cutting) come from the coach-supplied catalogue, grounded in
the cited systematic reviews (Wijekulasuriya 2025; lower-extremity functional-test measurement properties
2024; SLS/step-down 2022; NASM OHSA; LESS/Padua). Encode each test's observations + follow-ups per the
schema above; include the **heel-elevated squat retest** and **active-vs-passive** logic as built-in
"confirmation" moves.

## Deliverable — Movement Screening Assessment Form

Ship a single **assessment form**: every test with **checkboxes for each possible finding**, **L/R columns**,
**pain score**, **ROM/measurement fields**, validated scoring where it exists, and a **follow-up section that
auto-points to the confirmation tests** for each flagged finding. Findings flow to the deficit ledger tagged
by the 8 domains; the ledger aggregates a finding seen across tests into one higher-confidence deficit +
lists the confirmation tests still outstanding.

## Trademark / copyright note

- **Generic, published tests** — overhead squat, step-down, knee-to-wall, SLR, hip/shoulder ROM, thoracic
  rotation, SEBT, push-up, plank/bridge, drop jump, CMJ, **LESS** (published open scoring), hop-for-distance,
  triple/crossover/side hop, LEFT — **implement freely** with their standard procedures.
- **Proprietary systems** — **FMS®, SFMA®, Y-Balance Test®** (Functional Movement Systems), AAA/MCS/MSST/FCS
  as named batteries — **cite as reference; do not reproduce their exact manuals/scoring rubrics or brand a
  MicroPulse feature with their marks.** SEBT (the generic star-excursion reach) is open and can substitute
  for Y-Balance in-product; reference Y-Balance as the productised version.

## Scoring, reliability, honesty

- Support **binary or Likert** scoring per test (as the assessments do); prefer **composite** where a system
  defines one (more reliable per the review). Confidence chip reflects **scorer experience + repeat count +
  view/pose quality**.
- **Injury-prediction caveat on every screen:** identifies movement characteristics that warrant further
  assessment or shape programming — **not** a validated injury-risk score. Grade STRONG (movement-quality
  screen + programming target) / WEAK (injury prediction), consistent with the OHSA evidence note.
- Pain / red flags → clinician; never a diagnosis; never the readiness colour.

## Wire-in (unified engine)

Coach picks tests → scores (by eye/video; pose-measurable where possible) → results land in the **deficit
ledger** with confidence + provenance, beside VALD / VBT / IMA / load → drive the **corrective/prehab +
strength** program (reconciled, coach-overridable). The Total Player Analysis athlete-axis is the surface.

## Acceptance

- The registry is seeded with the catalogue above (categorised, speed/laterality-tagged), a shippable
  **default ~10–12-test battery**, binary/Likert scoring, confidence reflecting scorer/repeat, and the
  injury-prediction caveat on each.
- **Every test uses the observation → hypothesis → confirmation schema** (`challenges`, `observations[]`
  {observation → investigate → confirmationTest}, `scoring`, `followUp[]`), tagged across the **8 result
  domains**, recorded **per-side/structured (not pass/fail)** — with the **"compensation ≠ diagnosis"** rule
  enforced (hypothesis, confirmed by follow-up; visual classifications have variable reliability; never a
  standalone injury predictor).
- A **Movement Screening Assessment Form** ships: per-finding checkboxes, L/R columns, pain score, ROM
  fields, validated scoring where it exists, and an **auto follow-up section** pointing to the confirmation
  tests. Findings feed the deficit ledger (8-domain tagged); the ledger **aggregates a finding across tests
  into one higher-confidence deficit** and lists outstanding confirmation tests.
- Generic tests implemented with standard procedures; FMS/SFMA/Y-Balance/etc. **cited, not reproduced/branded**
  (SEBT used as the open balance-reach). Results feed the deficit ledger. Pain/red-flags → clinician; never
  the readiness colour. EN/IS. Manifesto five-question check passes.
- Extensible: OHSA/SLDJ are members; Gray/AFS triplane analyses are a later category; new tests = registry
  rows.

Ref: Wijekulasuriya et al. 2025 (*Sports Med – Open*, movement-quality assessment systematic review); the
coach-supplied catalogue + battery; FMS/SFMA (Cook et al.), Y-Balance/SEBT, LESS (Padua et al.), MSST, MCS,
AAA, FCS as named references. Ties to `movement-screen-video-to-tpa-and-strength-spec.md` (registry),
`docs/research/overhead-squat-assessment-evidence.md`, `corrective-exercise-library-and-mapping-brief.md`,
the deficit-ledger / unified-individualisation vision.
