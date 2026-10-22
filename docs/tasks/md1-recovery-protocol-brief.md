# Brief — MD+1 recovery: extend the existing Recovery Protocols system (don't rebuild it)

**Context correction:** MicroPulse **already has** a Recovery Protocols system — a `recovery_protocols`
table (slug, title, category, evidence_tier, duration_min, when_to_use, goal, trigger_hint, sections,
citations, active), a coach browse/prescribe page (`/coach/recovery-protocols`), player assignment +
completion tracking, a locker-room TV display (`/coach/display/recovery`), and auto-trigger logic
(`src/lib/recovery/autoTrigger.ts`). It ships an **MD+1 Morning Recovery Bundle** (`md_plus_1_recovery_bundle`,
12 min: Diaphragmatic Breathing Reset → Isometric Loading → Reciprocal Inhibition/MET; auto-triggers the
morning after a match with Player Load > 600 OR HSR > player p75), plus `post_match_vst_reset` and
`pre_match_neural_activation`.

So this brief is **not "build MD+1 protocols"** — they exist. It's three additive improvements grounded in
the evidence analysis (`Evidence analysis — The nervous system and recovery after football`) + the papers on
file. Advisory/descriptive — never sets the readiness colour. Rules recommend; the coach decides.

Files: `src/lib/recovery/*` (types, loader, autoTrigger), `recovery_protocols` table (Supabase),
`src/app/coach/recovery-protocols/*`, `src/app/coach/display/recovery/*`,
`src/app/coach/post-match-recovery/*` (the monitoring board), `match_schedule.kickoff_time`. Any DB change
via `apply_migration` must also be saved as a timestamped `.sql` under `supabase/migrations/` (repo rule).

## 1 — Align evidence tiers + wording with the graded analysis (credibility fix — do first)

The existing protocols carry evidence tiers ("mixed"/"practitioner"), which is honest in spirit, but two
things overclaim relative to the evidence analysis and should be corrected before the KSÍ workshop:

- **MD+1 bundle goal wording** currently says "clear residual extensor tone." That phrasing rests on the
  vestibulospinal-overdrive idea, which the analysis grades **SPECULATIVE**. Reword to what's supported —
  e.g. "reset breathing mechanics, restore tendon load tolerance, and support the transition toward rest" —
  and drop the extensor-tone causal claim.
- **`post_match_vst_reset`** is built around the vestibular reset the analysis grades **SPECULATIVE /
  INSUFFICIENT** for post-match recovery. Keep it available, but label it explicitly **experimental** (a new
  `evidence_tier` value or an `experimental: true` flag), with a one-line honest note: "vestibulo-sympathetic
  reflex is real physiology (Carter & Ray 2008); its role in post-match recovery is untested — use as an
  optional experiment, not established practice."
- Add a **per-section evidence grade** (the `sections` JSON has no `evidence_tier` today) so within a
  protocol the coach sees which parts are strong vs experimental — e.g. Diaphragmatic Breathing = STRONG
  (acute HRV; Laborde 2022), Isometric Loading = MODERATE (Rio 2015, tendon analgesia), VST/oculomotor =
  EXPERIMENTAL. This is the manifesto's provenance rule applied to protocol content.

Save the wording/tier changes as a migration `.sql` (update `recovery_protocols` rows) + the file copy.

## 2 — Night-match sleep flag (new; uses existing data)

`match_schedule.kickoff_time` is stored but unused here. When a match kicks off in the evening (e.g. ≥18:00),
raise a **night-match sleep-disruption flag** on the post-match board and, via `autoTrigger`, prefer the
lighter/earlier down-regulation content that evening. Grounding: direct football evidence (~90% of players
report worse sleep after night matches; ~92 min less total sleep). Surface the practical lever — the hours
between final whistle and bedtime are the key window; protect bedtime, reduce late stimulation, offer the
breathing reset. Grade it **STRONG (sleep is disrupted) / UNCERTAIN (mechanism)** so it doesn't claim
autonomic causation. This is the highest-value new piece and needs no new data source.

## 3 — Multi-process MD+1 board (new read on the monitoring surface)

The post-match board today shows one **readiness colour** across MD+1→MD+N. Extend it to the analysis's
model — recovery is several overlapping processes on different timelines — using signals MicroPulse already
has, each labelled, none blended into a single score:

- **Neuromuscular** — readiness colour (+ CMJ/force-plate or jump/sprint if present). *STRONG* (Thomas 2017;
  Silva 2018; Drayton 2025; Taylor 2016).
- **Autonomic** — HRV / resting-HR trend vs own baseline. *STRONG* (Stanley, Peake & Buchheit 2013).
- **Perceptual** — soreness / wellness self-report. *STRONG.*
- **Sleep** — the night-match flag + any sleep input. *STRONG that night football disrupts sleep.*

Show a small per-player, per-process read ("recovered / lagging" + its evidence chip) so the coach sees
*which system* lags, not just an overall colour — and can prescribe the matching protocol from the existing
library. Keep the existing MD+1→MD+N colour timeline. Never blends into one number; never sets the readiness
colour.

## What already works — leave it

Auto-trigger from Catapult match-load (PL>600 / HSR>p75), player assignment + completion tracking, the
locker-room TV display, and the breathing/isometric core of the MD+1 bundle are all sound and evidence-based
— don't rebuild them. The analysis explicitly validates the breathing component (STRONG for acute vagal HRV)
and MicroPulse's personal-norm, multi-signal readiness approach (HRV as one window, never a solo verdict).

## Acceptance

- MD+1 bundle goal reworded (no "extensor tone" causal claim); `post_match_vst_reset` flagged
  **experimental** with the honest note; **per-section evidence grades** shown; changes saved as a
  `supabase/migrations/*.sql`.
- **Evening kickoffs** raise a night-match sleep flag (from `kickoff_time`) on the board with
  transition-to-sleep guidance, graded STRONG/UNCERTAIN; `autoTrigger` accounts for it.
- The post-match board shows **per-process reads** (neuromuscular/autonomic/perceptual/sleep) with evidence
  chips alongside the existing MD+1→MD+N timeline; nothing blended; readiness colour untouched.
- Existing auto-trigger / assignment / TV display / breathing+isometric content unchanged. EN/IS. Lint +
  typecheck clean; manifesto five-question check passes.

Ref: `recovery_protocols` table + `src/lib/recovery/*` (types/loader/autoTrigger),
`src/app/coach/recovery-protocols/*`, `src/app/coach/display/recovery/*`,
`src/app/coach/post-match-recovery/*`, `match_schedule.kickoff_time`,
`Evidence analysis — The nervous system and recovery after football`,
`docs/articles/recovery-the-forgotten-nervous-system.md`. Papers on file: Thomas 2017, Silva 2018,
Drayton 2025, Taylor 2016, Amann 2020, Stanley 2013, Carter & Ray 2008, Buchheit 2014, Laborde 2022,
Rio 2015.
