# Return-to-training — individualise the ramp rate (Gabbett 2020)

**Status:** proposed. Extends the shipped RTT engine (`src/lib/micropulse/returnToTraining.ts`).
Small, well-scoped, and directly grounded in a paper the engine already implements.

## Why

Gabbett 2020 ("How Much? How Fast? How Soon?", JOSPT) — the floor/ceiling/time paper the
RTT engine is built on — is explicit in its CAUTION:

> "Very young and older athletes, and those with a long injury history, poor training
> history, musculoskeletal deficiencies, and lower strength and aerobic fitness, may have
> **poorer tolerance of rapid increases in training load**."

The engine today ramps almost everyone at the same rate (`RAMP = 1.10`, with an existing
`RAMP_CAUTION = 1.07`). But tolerance of the ramp is **individual**, and it varies by
exactly the factors MicroPulse now captures:

- **Injury history** — `injury_events` (18 of ~29 Breiðablik players have one; all within
  the last year; each carries `body_side`, `severity`, `mechanism`).
- **Age** — `players.date_of_birth` (see the DOB brief; very young / older = higher caution).
- **Training history** — the load data itself (a thin recent history = less established
  tolerance).

So the enhancement: a player the literature flags as less tolerant is ramped at the
**caution rate**, automatically, instead of the standard rate.

## What it is — and what it is NOT

**It is a conservative default, not a prediction.** Same discipline the engine already
states about ACWR: load is a *descriptor, not an injury predictor*. This does not claim who
will get hurt. It says: "for players the evidence flags as less tolerant, climb more
slowly." Erring slow costs a few days; erring fast is the risk the paper is about.

**It must NOT invent precise coefficients.** Gabbett gives risk *factors*, not weights.
Do not build a fancy weighted risk score with made-up numbers — that is exactly the
confident-looking guess this project keeps refusing. Use a small, transparent rule that
stays inside already-validated bounds.

## The rule (keep it this simple)

Stay within the two rates the engine already has — do not invent a third, slower rate
without evidence for it:

```
standard ramp = 1.10   (existing RAMP)
caution ramp  = 1.07   (existing RAMP_CAUTION)
```

Use the **caution ramp** when ANY of these risk factors is present:

1. **Prior injury to a body part the current return involves** (from `injury_events` —
   match on `body_side` / region where recorded). A player returning from a hamstring
   injury who has a prior hamstring injury is the clearest case.
2. **Two or more injuries in the last 12 months** ("long injury history", proxied by
   frequency since we lack career-length history).
3. **Age outside the tolerant band** — under ~18 or over ~30 (`date_of_birth`). Confirm the
   exact bands with the S&C staff; the paper says "very young and older" without numbers.
4. **Thin training history** — fewer than N healthy weeks on record to build the ceiling
   from (the engine already tracks `builtFromHealthyWeeks`); a ceiling built on little data
   is itself uncertain, so ramp conservatively.

One or more present → caution ramp. None present → standard ramp. That is the whole rule.

## Unknown data must not penalise — nor be assumed safe

- **Age unknown** (DOB not filled): do NOT guess. Treat age as "not a factor" for the ramp,
  but surface it as a data gap (the DOB brief already routes this to data-quality).
- **No injury history**: that factor is genuinely *absent* (good), not unknown — a player
  with no recorded injuries is not flagged on factors 1–2.
- The rule is monotonic: adding a known risk factor can only slow the ramp, never speed it.

## Surface the reason (explainability)

When the caution ramp is used, the RTT method view must say WHY, in plain language:

> "Climbing at 7%/week rather than 10% — prior hamstring injury on this side (May 2026)
> means a more cautious return (Gabbett 2020)."

Never a silent slower ramp. The coach can see the factor, and — per the manifesto — override
it with a logged reason if he disagrees.

## Cite it

`Gabbett 2020` on the ramp-rate MethodRow (the engine header now cites it for the whole
floor/ceiling/time model). This is the paper's direct clinical recommendation, not an
inference.

## Test

Add cases: a player with a matching prior injury gets 1.07 and the reason string; a clean
28-year-old with a full history gets 1.10; an unknown-DOB player is NOT slowed on age alone.
The existing RTT test suite must stay green.
