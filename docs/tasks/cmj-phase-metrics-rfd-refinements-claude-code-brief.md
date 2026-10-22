# Claude Code task — CMJ metric refinements: early-phase RFD, FT:CT, mean-of-repeats (item 4)

Paste to Claude Code (or `@docs/tasks/cmj-phase-metrics-rfd-refinements-claude-code-brief.md`).
Read `@docs/research/cmj-neuromuscular-fatigue-assessment.md` first.

## Goal (and the one-line why)

Make the CMJ read earlier and less blunt by refining the metric set MicroPulse already computes in
`src/lib/micropulse/vald/snapshot.ts` + `vald/phaseChange.ts`. Three evidence-backed changes: (a) add **early-phase
RFD** as an earlier fatigue flag, computed reliably; (b) add the **flight-time:contraction-time (FT:CT) ratio** and
lean on it over RSI-modified; (c) use the **mean of the session's repeat jumps**, not the single best. The why:
early-phase RFD drops ~a day before jump height, FT:CT is more fatigue-sensitive than RSI-mod in team-sport athletes,
and mean-of-repeats detects fatigue/supercompensation better than a max jump — all feed the fatigue classifier (item 1).

## This EXTENDS existing files

- `vald/snapshot.ts` — already maps `jump_height_cm, rsi_mod, peak_force_n, concentric_impulse_n_s,
  eccentric_duration_ms, concentric_duration_ms, peak_power_w`. Add the new derived metrics here.
- `vald/phaseChange.ts` — already CV-gates each metric against literature CV + player CV (`PHASE_METRICS`,
  `PHASE_NOISE_K`, `PLAYER_CV_MATURE_TESTS`). Add the new metrics to `PHASE_METRICS` with their CVs so they inherit
  the gate. RFD already exists here (`cvPct: 16.2` — the noisiest); this brief refines *how* it's computed.

## The three changes (grounded)

**(a) Early-phase RFD, computed for reliability.**
- Compute RFD over **fixed time windows from force onset — 0–100 ms and 0–200 ms — as an averaged slope**, and
  **normalise to the player's peak force**, rather than instantaneous peak RFD. Maffiuletti/Rodríguez-Rosell: a 20-ms
  moving-average slope and MVC-normalisation markedly improve RFD reliability; onset detection is the main error.
- Fatigue evidence: D'Emanuele 2021 (70 studies) — fatigue decline is larger for **early RFD ≤100 ms (−23%)** and peak
  RFD (−25%) than max force (−19%); early RFD is neural-drive dominated and drops before height. If ForceDecks exposes
  a force-time curve or an early-RFD field, derive it; if only summary RFD is available, use that but keep the tighter
  CV. Add `rfdEarly` to `PHASE_METRICS` with a conservative CV (≈12–16%) so the gate is honest.
- Surface a CV-cleared early-RFD drop as a labelled "explosiveness ↓ (early)" signal → NEURAL evidence in item 1.

**(b) FT:CT ratio; de-emphasise RSI-mod.**
- Add **flight-time:contraction-time** (from the durations already ingested). Edwards 2018: FT:CT is sensitive in
  team-sport athletes, whereas **drop-jump RSI was not sensitive** in basketball/rugby-7s. Add `ftCtRatio` to
  `PHASE_METRICS`; treat it as a primary fatigue metric and mark **RSI-modified as secondary** (keep it, but note it
  may be insensitive) in the metric copy/tooltips.

**(c) Mean-of-repeats, not best jump.**
- Where a session has multiple CMJ trials, aggregate the **mean** of valid trials for the fatigue read (Edwards 2018:
  mean-of-repeats detects fatigue/supercompensation better than a single max). Keep best-jump available for
  performance/RTP display, but the **fatigue** comparison uses the mean. Check `vald/trialAggregate.ts` — extend its
  aggregation rather than duplicating.

## Gates & honesty (manifesto)

- **CV-gated** — every new metric enters `PHASE_METRICS` with its literature CV and inherits the existing gate; a move
  must clear the larger of literature CV and the player's own CV × `PHASE_NOISE_K`.
- **Descriptive** — these are fatigue-context metrics; they never move the readiness colour on their own.
- **Personal norm**, mature-baseline gated; **no-data ≠ zero**; each metric cites its paper; bilingual EN/IS.
- **Publish the smallest worthwhile change** — surface each metric's CV/SWC in "behind the numbers" (Thorpe 2017:
  monitoring rarely defines an MCID; MicroPulse's CV-gate already is one — make it visible).

## Acceptance

- `snapshot.ts` derives `rfdEarly` (0–100/0–200 ms averaged slope, normalised), `ftCtRatio`, and a mean-of-repeats
  aggregate; all three appear in `PHASE_METRICS` with CVs and pass through the existing gate.
- RSI-modified is labelled secondary; FT:CT is primary. The fatigue read uses mean-of-repeats.
- New metrics feed item 1's NEURAL/TISSUE evidence. Unit tests: an early-RFD drop that clears its gate flags while a
  within-CV wobble does not; FT:CT computed correctly; mean vs best aggregation. `npx eslint` clean; stage specific
  files only.

## Do NOT

- Do not use instantaneous peak RFD as the flag (too noisy) — use windowed, normalised RFD.
- Do not drop RSI-mod entirely — demote it, don't delete it.
- Do not let any metric bypass the CV gate or move the readiness verdict.
- Do not switch the RTP/performance display to mean-of-repeats — that stays best-jump; only the *fatigue* read uses
  the mean.

## Papers

D'Emanuele 2021 (RFD as NM-fatigue indicator, scoping review) · Maffiuletti / Rodríguez-Rosell (RFD assessment
reliability) · Edwards 2018 (FT:CT sensitive, RSI insensitive, mean-of-repeats) · Gathercole 2015 (phase-metric CVs) ·
Thorpe 2017 (define the SWC). See `docs/research/cmj-neuromuscular-fatigue-assessment.md`.
