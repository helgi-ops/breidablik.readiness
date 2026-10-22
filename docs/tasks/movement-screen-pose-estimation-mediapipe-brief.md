# Brief — pose estimation (MediaPipe) for the movement screen: measure the angles, let AI explain

**Goal:** give the movement screen a real **measurement** layer. Today the capture flow samples video frames in
the browser and hands them to **Claude vision** (`/api/coach/movement-analysis` → `analyzeMovementVision`), which
both *estimates* the angles and *describes* the compensation. A general vision model can describe valgus, but it
is not reliable or repeatable at **measuring** a joint angle. Add a dedicated **pose-estimation** model
(MediaPipe Pose Landmarker / BlazePose) that produces the numeric variables; keep the AI as the **explanation**
layer. This is the manifesto in operational form: **measurements decide, AI explains** — and it matches the
observation → measurement → confirmation model the test catalogue already uses.

Screening / training only — never a diagnosis, never the readiness colour; a pose-measured finding is a
**hypothesis**, a clinician confirms. Pain / red flags → clinician.

## Why MediaPipe, in-browser

- **Free + client-side** (`@mediapipe/tasks-vision`, WASM/JS) — 33 body landmarks, runs on the coach's device.
- **Privacy-preserving, keeps the current stance:** the raw video **never leaves the device / never persists**
  (same as the film-clip route today) — only the derived `angles_json` / findings are stored.
- **No per-call cost** (unlike a vision-LLM call per screen), so it scales to every screen, every re-screen.
- Gives **numeric** output → maps straight into the existing findings schema; no downstream change.

## How it plugs into the existing pipeline (measure → rules → findings)

The screen already stores `movement_screens.findings = [{ variableKey, leg, value, severity }]` and derives
`result.readings` (ruleId `ohsa_valgus` / `ohsa_forward_lean`, cause/lever/strengthEmphasis) from them. Pose
replaces the **measurement** step only:

1. **Capture** — sample frames (or run live) in the browser as now; run MediaPipe Pose Landmarker on them.
2. **Measure** — from the landmarks, compute the screen variables the test defines, e.g.:
   - `knee_valgus` — frontal-plane knee-over-foot deviation (hip–knee–ankle projection), per leg.
   - `forward_lean` — trunk angle to vertical (shoulder–hip vs vertical), sagittal view.
   - `squat_depth` — hip vs knee height / knee-flexion angle.
   - L/R **asymmetry** — the same measure compared between legs.
   - (Ankle-DF stays a knee-to-wall clinical measure, not pose — keep as-is.)
   Pick the deepest-squat / key frame automatically (min hip height) so the measure is taken at the right moment.
3. **Classify** — feed the measured `value` into the **existing** severity thresholds + rule engine
   (`ohsa_valgus`, `ohsa_forward_lean` …) — unchanged. This produces `findings[]` + `result.readings[]` exactly
   as today, so corrective plan, rehab track and the deficit ledger all read it with no change.
4. **Explain** — Claude vision (the current path) becomes the **qualitative / capture-quality** layer on top:
   plain-language description + "is the camera angle usable" + anything pose can't see. It no longer owns the
   numbers.

## Confidence, capture quality, and the honest 2D caveat

- **Pose-measured = higher confidence** than vision-estimated — record the measurement method + capture quality
  (camera view, landmark visibility, frames used) as provenance; low visibility → lower confidence, and fall
  back to the Claude-vision estimate flagged as such.
- **2D single-camera has real limits:** front-plane valgus is a 2D projection (out-of-plane / camera-angle
  error); a sagittal measure needs a side view. So gate each variable to the **view it's valid in** (front vs
  side), warn on off-axis capture, and treat the number as **screening, not measurement-grade** — still a
  hypothesis, clinician confirms. (This is why the catalogue's `poseMeasurable` flag exists — honour it.)
- **Not clinically validated** for precise angles — keep the "movement quality, not an injury-risk claim /
  not a diagnosis" wording.

## Architecture — MediaPipe 2D, in-browser, behind a thin measurement interface

The solution is **MediaPipe 2D, client-side** — deliberately. It fits the target user (a small-staff club
filming a squat on **one phone**: no calibration, no upload, instant, free) and keeps the privacy stance (raw
video never leaves the device). A lab-grade 3D pipeline that needs multiple calibrated cameras and cloud video
upload is **explicitly not the direction** — it contradicts the product's low-friction, privacy-first value for
exactly the clubs MicroPulse serves, and screening needs repeatable good-enough measures, not mocap-grade angles.

Still, don't hard-wire the call sites to one library: put the model behind a thin **measurement interface** —
`input: sampled frames / capture → output: { variableKey, leg, value, confidence, method, captureQuality }` —
so `method` is recorded on every finding and the pose library can be swapped or upgraded later without touching
the rules, findings shape, or downstream consumers. This is a one-file abstraction, not a second implementation
— build only the `mediapipe_2d` provider now.

## Scope + fallback

- Ship the `mediapipe_2d` provider behind the thin measurement interface in the movement-screen capture;
  produce `findings[]` from landmarks; route through the existing thresholds/rules; Claude vision demoted to
  explanation + capture-quality + fallback.
- Store measurement `method` + capture-quality on the screen (provenance for the deficit ledger's confidence).
- **Not planned:** cloud / multi-camera 3D pipelines (e.g. OpenCap) — rejected as a poor fit for this product's
  low-friction, privacy-first, single-phone workflow. The interface leaves the door open only if a
  privacy-preserving, low-setup option ever emerges; nothing is committed.

## Acceptance

- The movement screen computes its variables (`knee_valgus`, `forward_lean`, `squat_depth`, L/R asymmetry) from
  **MediaPipe pose landmarks** in-browser; raw video never persists; the derived findings + capture quality are
  stored.
- Measured values run through the **existing** severity thresholds + rule engine → the same
  `findings[]` / `result.readings[]` shape; corrective plan, rehab track and deficit ledger consume it
  unchanged, with **pose-measured findings carrying higher confidence** than vision-estimated.
- Each variable is **gated to its valid camera view**; off-axis / low-visibility capture is warned and falls
  back to the Claude-vision estimate flagged lower-confidence. Claude vision remains the plain-language
  explanation + capture-quality layer (measurements decide, AI explains).
- Honest framing kept: 2D screening, not measurement-grade, not clinically validated; a finding is a
  hypothesis; never the readiness colour; pain / red flags → clinician. EN default / IS toggle. Lint +
  typecheck clean; five-question check passes.

Ref: `/api/coach/movement-analysis/route.ts` + `movementScreen/vision/ai.ts` (current Claude-vision path — becomes
the explanation layer), `movementScreen/vision/schema.ts` + `vision/regions.ts`, `movement_screens.findings`
(`{variableKey, leg, value, severity}`) + `result.readings` (`ohsa_valgus` / `ohsa_forward_lean` rules —
unchanged), `movement-screen-test-catalogue-brief.md` (`poseMeasurable`, observation→measurement→confirmation),
`unified-individualisation-engine-deficit-ledger-spec.md` (confidence/provenance), `docs/explainability-first.md`.
Library: `@mediapipe/tasks-vision` (Pose Landmarker, WASM, client-side). Cloud / multi-camera 3D (OpenCap) is
deliberately not pursued — poor fit for the single-phone, privacy-first workflow.
