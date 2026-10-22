# Claude Code task — Expected post-match CMJ recovery curve, personalised by match HSR (item 2)

Paste to Claude Code (or `@docs/tasks/cmj-expected-recovery-curve-hsr-claude-code-brief.md`).
Read `@docs/research/cmj-neuromuscular-fatigue-assessment.md` first.

## Goal (and the one-line why)

Today a post-match CMJ is read against a **flat** personal baseline, and the recovery time-course is encoded only
qualitatively (the MD+1/MD+2 match-minutes points in `src/lib/fatigue/classify.ts`). The literature says the *expected*
post-match jump dip is predictable and is driven by **high-speed running**, which MicroPulse already has from GPS. So
model an **expected CMJ recovery band per match, per player**, compare the observed CMJ trajectory to it, and flag
"recovering slower than expected." The why: a jump that's low but *on the expected curve* is normal; a jump that's low
and *behind the curve* is the real signal — and only a per-match, HSR-driven model can tell them apart.

## The model (grounded)

For each match a player features in, build an expected CMJ-vs-time band over the following ~72 h:

- **Driver = match high-speed running > 5.5 m/s**, not total distance. Hader 2019: per 100 m of HSR above threshold,
  CMJ peak power ≈ −0.5% at +24 h (and CK +30%); total distance is *not* predictive. Scale the expected dip by the
  player's HSR in that match (already available via the GPS/HSR layer — same source the HSR-intelligence surfaces use).
- **Time-course shape** (seed the band, then personalise as data accrues): dip greatest 0–48 h, recovering by 72 h;
  jump recovers *slower than sprint* and can still be down at 72 h. Nédélec 2012 (CK peaks 24–48 h, normalises
  48–120 h; DOMS peaks 24–48 h; jump 48 h→>72 h); Silva 2018 (jumping still impaired at G+72 h).
- Express the expected value as a **% of the player's own CMJ baseline** at each hour offset, with a band (not a point)
  reflecting the phase-metric CV already in `vald/phaseChange.ts`.

Then compare the **observed** CMJ (from `vald/snapshot.ts`) at its actual hours-post-match to the modelled band:
- Inside the band → "recovering on schedule" (green/quiet).
- Below the band → "recovering slower than expected" → feed the **TISSUE/peripheral** read of the fatigue classifier
  (see item-1 brief) and surface it as a labelled context signal.
- Above the band → recovering ahead of schedule.

## Where to build

- Pure model under `src/lib/micropulse/cmjRecovery/` (no IO): `expectedCmjBand({ matchHsr, hoursPostMatch,
  playerBaseline })` → `{ expectedPct, lo, hi }`, and `classifyRecovery(observedPct, band)` →
  `on_track | slow | ahead`. Unit-test against the seed time-course.
- The caller joins **match date + match HSR** (GPS layer) with the **post-match CMJ tests** (vald) — reuse the same
  match/HSR join the MD-comparison / HSR-intelligence surfaces already do; do not build a new GPS pipeline.
- Emit a `cmjRecoverySlope` / `behindCurve` signal into `FatigueInput` (item-1 brief consumes it) and a small
  coach-facing context line on the RTP / Neuromuscular-Fatigue (CMJ) surface: "48 h post-match: jump at 88% of
  baseline — expected ~92–100% for this match's HSR → recovering slower than expected."

## Gates & honesty (manifesto)

- **Descriptive only** — never moves the readiness colour; it's expected-vs-observed context.
- **No-data ≠ zero** — no post-match CMJ, or no HSR for the match, → no verdict, lowered confidence, shown as pending.
- **Personal norm** — expected band is a % of the player's own CMJ baseline; the model personalises as his own
  post-match jumps accumulate (start from the literature seed, converge to his history).
- **Every number carries provenance + citation** (match id + HSR value + hours offset); counterfactual where useful
  ("if he were on the expected curve he'd be ~X%"); bilingual EN/IS.

## Acceptance

- `expectedCmjBand` returns an HSR-scaled, time-decaying band as a % of baseline; `classifyRecovery` labels
  on_track / slow / ahead. Unit tests cover a high-HSR match (deeper, longer dip) vs a low-HSR match, and a
  missing-HSR / missing-CMJ case (→ no verdict).
- A slow-recovery result feeds the TISSUE read of `lib/fatigue` and shows a coach context line with the numbers.
- Nothing changes the readiness colour. `npx eslint` clean; migrations (if any) saved under `supabase/migrations/`.
  Stage specific files only.

## Do NOT

- Do not drive the expected dip off total distance — use HSR > 5.5 m/s (Hader 2019).
- Do not apply a generic (sprint-like) recovery curve — jumps recover slower; use the CMJ-specific shape.
- Do not let the recovery flag change the readiness verdict or auto-cut load.
- Do not fabricate a curve when the match HSR or the post-match CMJ is missing.

## Papers

Hader 2019 (HSR drives post-match fatigue; CK/CMJ vs HSR at +24 h) · Nédélec 2012 (Recovery in Soccer Part I —
CK/DOMS/jump time-course) · Silva 2018 (jumping impaired at G+72 h, distinct from sprint) · Gathercole 2015 (CMJ
metric CV for the band width). See `docs/research/cmj-neuromuscular-fatigue-assessment.md`.
