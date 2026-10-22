# Claude Code task — Feed the real CMJ signal into the fatigue-type classifier (item 1)

Paste to Claude Code (or `@docs/tasks/fatigue-classifier-cmj-evidence-claude-code-brief.md`).
Read `@docs/research/cmj-neuromuscular-fatigue-assessment.md` first (the research basis).

## Goal (and the one-line why)

MicroPulse already classifies **fatigue type** — `NEURAL / TISSUE / SYSTEMIC / MIXED` in
`src/lib/fatigue/classify.ts`. But today it infers that type from **proxies** (wellness + readiness + external-load
flags); it never looks at the **measured CMJ**, even though `src/lib/micropulse/vald/phaseChange.ts` already computes
CV-gated CMJ phase-metric changes. The why: a CMJ measures *net* output and can't say *where* the fatigue is — but
paired with soreness and wellness it can, and the classifier is the exact place to fuse them. This turns "his jump is
down" into "his jump is down **because** it's neural / tissue / systemic", from data already on hand.

## This is an EXTENSION, not a new module

- Extend `src/lib/fatigue/types.ts` — add CMJ evidence to `FatigueInput`.
- Extend `src/lib/fatigue/classify.ts` — add CMJ-driven drivers into the existing `neuralScore` / `tissueScore`
  tallies (don't invent a parallel engine; reuse `FatigueDriver` with `category: "NEURAL" | "TISSUE"`).
- Source the CMJ evidence from the existing `vald/phaseChange.ts` output + `vald/snapshot.ts` — do not recompute jumps.

## The mapping to implement (grounded)

Fold the measured CMJ into the type split using the phase metrics `phaseChange.ts` already classifies (each already
CV-gated against literature CV + the player's own CV):

**NEURAL evidence (add to `neuralScore`):**
- A CV-cleared drop in **peak power**, **RFD**, **RSI-modified**, or **concentric impulse/force** → neural/central
  output loss. These are the explosive, neurally-driven qualities. *(Gathercole 2015; D'Emanuele 2021 — early RFD is
  neural-drive dominated.)*
- A **fast next-day CMJ rebound** (recovery slope steep) → points neural rather than tissue (central fatigue recovers
  in hours). *(Carroll/Taylor/Gandevia 2017.)*

**TISSUE evidence (add to `tissueScore`):**
- A CV-cleared lengthening of **eccentric duration** / **contraction time** with jump height barely moving → altered
  jump *strategy*, a tissue/peripheral signature. *(Gathercole 2015: time/eccentric metrics stay abnormal longest.)*
- **CMJ still depressed at 48–72 h** post-match (recovery slope flat) → peripheral/muscular. *(Carroll 2017; Silva
  2018 — jump recovers slower than sprint.)*
- Existing soreness/pain drivers already land in TISSUE; a low CMJ **with** high soreness reinforces tissue.

**Confidence:** the CMJ drivers only fire when `phaseChange.ts` says the move cleared its CV gate AND baseline is
mature (`PLAYER_CV_MATURE_TESTS`). When there is no recent CMJ, add nothing and lower `FatigueConfidence` — never
treat "no jump" as "no neural fatigue" (no-data ≠ zero).

## Where to wire it

- `FatigueInput` gains optional fields, e.g. `cmjPowerDropFlag`, `cmjRfdDropFlag`, `cmjEccLengthenFlag`,
  `cmjRecoverySlope` (fast/slow/unknown), plus the raw `phaseChange` verdict so drivers can quote the metric.
- The caller that builds `FatigueInput` (find it via the `classifyFatigue(` call site) already loads readiness + load;
  add the latest `vald/snapshot` + `phaseChange` result there.
- Each new driver carries a plain-language `label` and its metric, so the existing fatigue UI and the
  "why-flagged" surfaces can show "peak power ↓ beyond its noise → neural" with the paper behind a tooltip.

## Gates & honesty (manifesto)

- **Descriptive only** — fatigue type never moves `readiness_entries.color` / `v_coach_readiness_today_v8.final_color`.
  It's a labelled interpretation layer, exactly like the classifier is today.
- **CV / confidence-gated** — reuse `phaseChange.ts`'s gate; a noisy metric (RFD ~16% CV) needs a bigger move.
- **Personal norm** — all CMJ evidence is vs the player's own baseline (Neyroud 2016: fatigue thresholds are
  individual, not group).
- **Every driver cites its signal + paper**; layered read (type verdict → 2–3 plain drivers → metric detail behind a
  toggle); bilingual EN/IS.

## Acceptance

- `classifyFatigue` consumes real CMJ evidence; a power/RFD drop pushes NEURAL, an eccentric-lengthening / persistent
  depression pushes TISSUE, each as a labelled driver with the metric named.
- No CMJ → no CMJ drivers and reduced confidence, never a silent zero.
- Nothing changes the readiness colour. `npx eslint` clean; unit-test the new mapping (a NEURAL case, a TISSUE case, a
  no-CMJ confidence case) alongside the existing `lib/fatigue` tests. Stage specific files only.

## Do NOT

- Do not build a second classifier — extend `lib/fatigue`.
- Do not let an un-gated (within-CV) CMJ wobble create a driver.
- Do not let fatigue type feed the readiness verdict or the daily decision.
- Do not treat missing CMJ as no fatigue.

## Papers

Gathercole 2015 (CMJ phase metrics & reliability) · Carroll, Taylor & Gandevia 2017 (central vs peripheral recovery
clocks) · Gandevia 2001 (central fatigue) · D'Emanuele 2021 (early RFD is neural) · Silva 2018 (jump recovers slower
than sprint) · Neyroud 2016 (individual thresholds). All summarised in
`docs/research/cmj-neuromuscular-fatigue-assessment.md`.
