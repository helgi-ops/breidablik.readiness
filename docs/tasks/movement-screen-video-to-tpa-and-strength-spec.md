# Spec — Movement-test video framework → Total Player Analysis → individualised strength

**The question:** can MicroPulse take an Onform-style movement video, analyse it, use references to help
interpret it, feed the result into **Total Player Analysis**, and drive an **individualised strength
programme**? **Yes — it's feasible and a strong fit, in stages, with clear boundaries.** The uploaded clip is
a **single-leg drop jump, hands overhead** (Aron Bjarnason), but the system must **not** be hard-coded to one
test — it must accept **many movement tests**, each with its own protocol, measured variables and
interpretation. So this is a spec for a **test-type framework**, not a single-test feature. v1; more books /
papers are coming and will extend the test library.

Screening + training tool — **not** diagnosis, and it **never** sets the readiness colour or the medical
record. Rules recommend; the coach/clinician decides.

## Architecture: a test registry (extensible — add tests as config, not code)

Every movement test is a **definition** in a registry (DB table `movement_tests` + typed config), so a new
test plugs in as data, not a rebuild. A test definition holds:

- **identity** — id/slug, name (EN/IS), category (mobility screen / landing / jump / hop / balance / gait /
  strength-endurance), short description, and whether it's **bilateral or per-leg**.
- **capture spec** — required view(s) (front / side / both), whether reps/legs are needed, and standardisation
  notes (camera height/distance, drop height, clothing) so repeats compare.
- **phase model** — how to segment the movement (e.g. drop → initial contact → absorption → propulsion →
  landing; or squat descent/ascent) so measures are taken at the right instant.
- **measured variables** — the pose/temporal outputs for this test (e.g. dynamic knee valgus at contact,
  knee-flexion absorption, trunk lean, contact time, jump/hop distance, RSI, L/R asymmetry) with units and a
  **reliability note** (which are robust from phone video vs low-precision at 30 fps).
- **norms / thresholds** — interpretation cut-points (e.g. limb-symmetry-index deficit >10–15%, valgus
  severity bands), each with a citation.
- **interpretation rules** — finding → likely contributing factor → corrective/strength lever (the same
  rule shape across tests).
- **references + evidence grade** — the papers/books behind the test's variables and thresholds.

The **pose pipeline is shared** (one BlazePose/equivalent service); the test definition tells it which
landmarks/angles/phases to extract and how to interpret them. Adding OHSA, CMJ, single-leg squat, hop tests,
Y-balance, running gait, Nordic, etc. is then a new registry row + rules, reusing the same ingest → measure →
interpret → TPA → strength path.

**Tests to seed (v1 examples — the framework supports more):** single-leg drop jump (the uploaded clip),
overhead squat assessment, countermovement / drop jump (bilateral), single-leg squat, hop-for-distance /
triple-hop (limb symmetry), Y-balance / SEBT, ankle-dorsiflexion lunge, running gait. Each ships as a
definition; the coach picks the test on upload (auto-detection can come later).

## Worked example — the uploaded test (single-leg drop jump)

This is **one test definition** in the registry above; it shows the shape every test follows. The clip is a
**single-leg drop jump (SLDJ), hands overhead** — a landing-mechanics + reactive-strength + limb-symmetry
test (not a mobility screen). Hands overhead removes the arm-swing contribution and adds a trunk-control
challenge, isolating the lower limb. It surfaces:

- **Landing quality / injury-risk kinematics** — dynamic knee valgus (frontal-plane projection angle at
  initial contact and at peak), trunk lean, hip/knee/ankle absorption, foot position. Dynamic knee valgus on
  single-leg landing is the classic ACL-risk read.
- **Reactive strength / jump performance, per leg** — contact time, flight time → jump height → **RSI**
  (reactive strength index), i.e. stretch-shortening-cycle quality on one leg.
- **Left–right asymmetry (limb symmetry index)** — the decisive output for injury risk and return-to-play.

What's automatable:

- **Pose estimation** (e.g. MediaPipe BlazePose / equivalent) extracts per-frame joint landmarks and computes
  the **frontal-plane knee angle / dynamic valgus at landing**, trunk lean, knee-flexion absorption, and
  **L vs R asymmetry %** — these are robust from a single front-view phone video. Onform already overlays
  angles, so MicroPulse can run its **own** pose pipeline on the raw video or ingest **Onform's exported
  angles** — support both.
- **Temporal / performance variables** — jump height and contact time (→ RSI) can be estimated from the
  video, but **30 fps is marginal** (≈33 ms resolution): treat RSI/contact-time from phone video as a **rough
  field estimate**, and prefer a force plate / high-speed capture where precision matters. Frontal-plane
  valgus and asymmetry do **not** need high frame rate and are the more reliable video outputs.
- **Views / standardisation.** Front view gives the valgus + asymmetry reads; a side view adds sagittal
  (knee-flexion depth, trunk). Standardise capture (fixed camera height/distance, same drop height, tight
  clothing) so results compare over time. Repeat both legs.
- **Honest accuracy:** single-camera pose is good for **valgus + asymmetry + trends**, coarser for RSI/contact
  time; treat every output as a **screen/trend with a confidence**, never a verdict.

## Ties to what MicroPulse already has

This complements the existing physical layer: **VALD force plates already give RSI / jump / DSI /
asymmetry** on a plate — the SLDJ video adds the **landing-quality (dynamic valgus)** a plate can't see, and a
**field-friendly RSI/asymmetry** capture where no plate is available. Both feed the same athlete-axis and the
same return-to-play / injury-risk reads (limb symmetry index thresholds).

## How the references help (knowledge base, not diagnosis, not redistribution)

- **Magee, *Orthopedic Physical Assessment*** and **Vizniak, *Orthopedic Conditions*** — the assessment
  framework and **red flags** (when a finding warrants clinical referral).
- The more directly relevant evidence for an SLDJ is the **landing-mechanics / ACL-risk / reactive-strength**
  literature (dynamic knee valgus and injury risk; Landing Error Scoring System; RSI interpretation; limb
  symmetry index thresholds for return-to-play). The user is sending more books/papers — prefer these primary
  sources for the interpretation rules.
- Used to build MicroPulse's **own** grounded rules: finding → likely contributing factor → corrective /
  strength direction. Example mappings for an SLDJ: *dynamic knee valgus on landing →* hip abductor /
  external-rotator strength + landing/deceleration mechanics + ankle dorsiflexion; *poor knee-flexion
  absorption / stiff landing →* eccentric/absorption capacity; *low or asymmetric RSI →* plyometric /
  reactive-strength progression biased to the weaker leg; *large L/R asymmetry →* unilateral loading and a
  return-to-play flag.
- **Boundaries (important):**
  - **Copyright:** the books are copyrighted textbooks — use them as **internal reference** to author
    MicroPulse's rules; do **not** reproduce, quote at length, or redistribute their text/figures in the
    product. Cite the concept, not the page.
  - **Medical:** map compensation → *training* target, never → diagnosis. Any pain, red flag, or suspected
    pathology → **flag for a clinician**, don't interpret. Same wall as the rest of MicroPulse (performance /
    screening only).

## Where it plugs into Total Player Analysis

Total Player Analysis already has the **athlete axis** (physical qualities with strengths/weaknesses + a
"lever" for each). A **Movement Screen** becomes another athlete-axis input, slotting in exactly like the
VALD / GPS qualities:

- Per-finding entries (e.g. "left-leg dynamic knee valgus — moderate", "RSI 0.38 L vs 0.31 R — 18% deficit
  right", "stiff/low-flexion landing right"), each with a **confidence** (view count, pose quality, 30 fps
  RSI caveat, single vs repeated screens) and a **lever** (the corrective/strength direction). Descriptive;
  never touches the readiness colour.
- These findings feed the same per-player weakness list that already drives the **preseason build-up**
  (`preseason-buildup-from-total-player-analysis-brief.md`) — so a movement asymmetry becomes a targeted
  emphasis in the individualised block.

## How it drives individualised strength

Movement findings → **corrective + strength prescriptions**, delivered through the existing strength system
(`custom-templates`, `programme-library`, VBT) and the per-player periodization build:

- e.g. dynamic knee valgus on landing → hip-abductor/ER strength (single-leg, banded) + landing/deceleration
  mechanics drills + ankle dorsiflexion; stiff/low-absorption landing → eccentric + landing-absorption work;
  low or asymmetric RSI → reactive-strength/plyometric progression biased to the weaker leg; large L/R
  asymmetry → unilateral loading to the weaker side. Each prescription cites its rationale and carries a
  confidence.
- Re-screen over time → track whether the corrective work is closing the valgus / RSI / asymmetry (the screen
  becomes a trend, like the other athlete-axis reads), and whether limb symmetry crosses the return-to-play
  threshold.

## Staging (feasible increments — ship value early)

1. **Registry + ingest + store.** Stand up the `movement_tests` registry with 2–3 seed definitions (SLDJ +
   OHSA + one jump/hop). Coach uploads the Onform video (or its exported angles) against a player + date,
   **picks the test from the registry**, and records findings (assisted, not auto). Finding lands in Total
   Player Analysis with a confidence. PHI-style storage: consent, access-gated, signed URLs (like clinical
   reports).
2. **Auto-measure.** Add the shared pose pipeline; the chosen test definition drives which variables it
   extracts (for SLDJ: dynamic knee valgus, knee-flexion absorption, trunk lean, L/R asymmetry — robust; plus
   a rough jump-height/RSI estimate flagged low-precision at 30 fps). Coach confirms/overrides.
3. **Auto-interpret + prescribe.** Apply each test's finding→cause→corrective rules → suggested correctives /
   strength emphasis + any symmetry/RTP flag (coach-overridable), wired into the strength system and the
   per-player block. New tests = new registry rows, no pipeline rewrite.

## House rules

- **Performance / screening only** — never the readiness colour, never a diagnosis; red flags → clinician.
- **Every output carries confidence + rationale** (manifesto provenance); coach can override.
- **Consent + privacy** for player video (likeness/PHI-adjacent): explicit consent, team-scoped access,
  retention policy — treat like the clinical-reports gate.
- **Copyright:** reference books inform the rules; their content is not reproduced in the product. Extend the
  rules as the user sends more books / peer-reviewed papers (prefer citing the primary literature — NASM-CES,
  FMS validity/reliability studies, Magee ROM norms — over textbook text).
- EN/IS.

## Acceptance (v1 = Stage 1)

- A **test registry** exists (`movement_tests`) with ≥2 seed tests; adding a new test is a config/data row +
  rules, not a pipeline rewrite. A coach can attach an Onform video (or exported angles) to a player + date,
  **pick the test from the registry**, record findings, and see a **Movement Screen** entry appear in Total
  Player Analysis with a confidence and a lever, feeding the player's weakness list / build-up.
- Findings map to suggested correctives/strength via grounded, cited rules (coach-overridable); no book text is
  reproduced; anything flagged as pain/red-flag routes to "refer to clinician," not an interpretation.
- Video is consent- and access-gated; nothing touches the readiness colour. EN/IS. Lint + typecheck clean;
  manifesto five-question check passes.

Ref: the uploaded single-leg drop-jump clip (Aron Bjarnason, Onform) + Magee & Vizniak + the landing-
mechanics/ACL/RSI literature (interpretation reference, not reproduced), VALD force-plate reads (RSI/DSI/
asymmetry — complementary), `src/components/coach/TotalPlayerProfile.tsx` +
`src/lib/micropulse/playerAnalysis/*` (athlete axis + levers),
`preseason-buildup-from-total-player-analysis-brief.md` (weakness→build-up),
`src/app/coach/custom-templates` + `programme-library` + VBT (strength delivery), `clinical-reports` (the
consent/access-gating pattern to mirror). Pose: MediaPipe BlazePose or equivalent. To be extended as more
books/papers arrive.
