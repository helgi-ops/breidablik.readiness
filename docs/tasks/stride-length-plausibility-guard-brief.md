# Stride length — plausibility guard (small, insurance not a fix)

**Status:** proposed. The stride-length engine already shipped (commit `4995cd1`,
`src/lib/micropulse/strideLength/`). This is a small, well-scoped addition to the
pure engine — please make it there so every surface inherits it via the loader.

## Why — and why it is NOT urgent

While auditing IMA Stride I ran an ad-hoc query that averaged stride length across
*all* rows, including reprocessed sessions with a handful of strides and zero
distance. It produced 0.79 m for HK — a toddler's stride, impossible for a footballer.

**That 0.79 was an artefact of my query, not the data.** On real match data HK's
stride length is 2.1–2.7 m, identical to Breiðablik. The engine computes per-session
with `MIN_STRIDES = 50` and would never emit 0.79. There is no live bug.

So this guard is **insurance**, not a repair. It exists for the case we have hit
twice now in a different form: a future org configures bands or units wrong, stride
length comes out at 0.8 m or 5 m, and the engine faithfully computes a "fatigue"
verdict from nonsense. Same philosophy as the 37 km/h velocity ceiling shipped
2026-07-13 — the system should refuse its own number when the number is impossible.

## The guard

In `assessStrideLength` (or the shared compute step), after computing
`strideLengthM` for a session and BEFORE comparing it to the norm:

```
PLAUSIBLE_STRIDE_MIN = 1.0   // metres per stride
PLAUSIBLE_STRIDE_MAX = 3.5
```

If `strideLengthM < PLAUSIBLE_STRIDE_MIN` or `> PLAUSIBLE_STRIDE_MAX`:
- return `verdict: "unmeasurable"` (do NOT produce shortened/normal/lengthened)
- reason (EN): "Stride length of {x} m is outside the physiologically possible
  range (1.0–3.5 m). This points to a data problem — likely a band or unit
  mis-configuration — not to the athlete. Not used."
- reason (IS): "Skreflengd {x} m er utan þess sem er líffræðilega mögulegt
  (1,0–3,5 m). Það bendir til gagnavillu — líklega rangrar banda- eða
  einingastillingar — ekki til leikmannsins. Ekki notuð."

Grounding for the bounds: elite football match stride length in high-cadence bands
sits ~1.9–2.7 m (measured, Breiðablik 331 sessions). 1.0–3.5 m is a generous
envelope that only trips on genuinely broken input, never on a real athlete —
including a heavily fatigued one (the real fatigue case, Ágúst Orri, was 1.90 m,
comfortably inside).

## Two things it must NOT do

- **Do not silently drop the row.** Return `unmeasurable` with the reason, so the
  absence is explained — never a green tick, never a blank. Same rule as the
  light-session case the engine already handles.
- **Do not flag it as fatigue.** An impossible stride length is a data-quality
  problem, not a player problem. If a data-quality surface exists (see
  `dataQuality.ts`), emit it there too, keyed to the team/date — an impossible
  stride length across a whole squad is the fingerprint of a mis-configured org,
  and that is exactly the "tell us on day one" signal that engine is for.

## Test

Add a case to the existing suite: stride length 0.79 m and 4.2 m both return
`unmeasurable` with the data-problem reason; 1.90 m (the Ágúst Orri fatigue case)
still returns `shortened`. The existing 341 tests must stay green.
