# Research-integration note — SPSR #318 (inter-limb LFF case report) → what MicroPulse should (and shouldn't) take

Source: Krótki-Borowicki, Quiroga, Hijano, Siedlecki, Guerra, Buchheit. *Inter-limb low-frequency
fatigue tracks the distribution of training dose rather than the underlying deficit.* SPSR #318, Sep 2026.
(Full text saved: `SPSR318_Borowicki_LFF_case_report.md`.)

## Evidence tier — read this first

**Single case (n=1), observational, no control.** It cannot prove cause or generalise. Its legitimate
role is hypothesis-generating and plausibility ("this can happen"). The authors are explicit and honest
about this ("one case only", "not proof", "suggestive", "remains a single-case observation"), which is a
quality marker — but it means **nothing here should drive a product rule on its own.** Treat any takeaway
the way MicroPulse treats every read: with provenance + a confidence that reflects the evidence. A
case-report-only takeaway = **low confidence**, and must never be surfaced as "research shows".

Rule of thumb applied below: adopt only what has **broader support than this one paper**; park what is
unique to the case until it replicates or **our own data** confirms it.

## ADOPT NOW — principles with broader grounding (the case reinforces, doesn't establish)

1. **Capacity ≠ readiness.** Isokinetic strength (or any max test) describes what a limb *can do*; it does
   not describe today's readiness or how much the next session will cost. This is already how MicroPulse
   separates the fitness-test/position-requirement *capacity* reads from the daily readiness verdict —
   this paper is a clean illustration of it (the strongest limb was also the most fatigable/unstable).
   **Action:** none needed structurally; keep the capacity-vs-readiness wording we already use, and cite
   this alongside the existing references, not instead of them.
2. **A single-day asymmetry is uninterpretable without the dosing context.** More work on one side → more
   fatigue on that side. This is a sound methodological caution independent of the case. It matches the
   manifesto's provenance principle. **Action:** where any inter-limb / left-right asymmetry is shown
   (VALD, movement screen), pair it with "how was load distributed" context, or label it as needing that
   context — don't present a lone asymmetry number as limb status.

## PARK — single-case hypotheses (interesting, not build-ready)

- "Day-to-day **variability** of a limb's readiness carries information its mean does not."
- Upward **rebound** swings (arriving 13–15% above the previous day) as a post-activation-potentiation signal.
- The exact session-cost ordering numbers (running ≈ 2× strength) as thresholds.

These rest on one 16-year-old, with the week-3 confound (asymmetric dosing tail *and* running onset
inseparable) the authors flag. **Do not encode them as rules or thresholds.** If we ever want them, they
go in as a low-confidence, clearly-labelled experimental read gated on our own replication.

## The one cheap, broadly-sound idea worth considering

The paper's own top recommendation: **"adding a single neuromuscular RPE per session would have supplied a
dose axis at negligible cost."** MicroPulse already has `session_rpe_entries` (session sRPE incl.
`session_type='gym'`). A **differential / neuromuscular RPE** (a second, "legs/neuromuscular" RPE beside
the existing breathing/whole-session one — McLaren 2016) is a low-effort extension that gives a better
internal-load axis for the strength side, and it's grounded in a wider literature than this case. This is
the only concrete build this paper motivates, and it's optional/low-priority — not urgent.

## What NOT to do

- Don't add an "LFF / Powerdex" engine on the strength of this paper — MicroPulse has no evoked-force
  hardware, and the construct's product value here rests on n=1.
- Don't let any of this touch the readiness colour or the daily decision (unchanged boundary).

**Bottom line:** file this as directional evidence. It strengthens two principles we already hold; it does
not justify a new feature. Confidence stays low until broader evidence or our own data converges.
