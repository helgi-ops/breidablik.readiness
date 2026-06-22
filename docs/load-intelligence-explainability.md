# Spec — Explainability layer over Load Intelligence

> **Idea (Helgi, June 2026):** instead of `/coach/load-intelligence` being a wall
> of S&C data, put the explainability-first treatment on it — one plain-language
> **load verdict** on top, the raw signals as drill-down. Same principle the rest
> of the system follows (CLAUDE.md: head-coach surface by default, S&C surface on
> drill-down). This is **re-parent and synthesize, not delete** — every existing
> metric stays reachable.

## Problem

`/coach/load-intelligence` today stacks five dense, jargon-heavy cards with no
top-line read:

- `GpsLoadIntelligence` — NBS, decel burden, A:D ratio, HID%, residual decel, PL spike
- `MechanicalLoadIndexCard` — MLI (`/api/coach/player-load/mli`, `mechanicalLoad.ts`)
- `TeamMetabolicSummary` — di Prampero metabolic power (`/api/coach/player-load/metabolic`, `metabolicLoad.ts`)
- `FosterMonotonyStrainCard` — Foster monotony/strain (`foster` lib)
- `MdHsrComparisonCard` — MD HSR comparison

A non-S&C coach cannot read this in five seconds. The page comment already calls
itself "the interpretation layer" — but it doesn't interpret, it displays.

## Goal — the shape

1. **Top: one load verdict** (team-level, then per-player exceptions). Plain
   language, e.g. *"Squad load is sustainable this week; 2 players carrying high
   braking load — Anton, Kristinn."* With **confidence** and the **driving
   signals named**.
2. **Middle: tiles/chips** for the components (braking load, high-intensity %,
   monotony, spike) — glanceable, click-through.
3. **Bottom: "Show S&C details"** reveals the existing five cards unchanged.
4. **Jargon → tooltips** (NBS, MLI, A:D, di Prampero, monotony) — never in the
   primary view.

## The synthesis lib — `loadVerdict`

New deterministic lib `src/lib/micropulse/loadVerdict/index.ts`. It does **not**
recompute load — it consumes the signals the existing libs/endpoints already
produce and synthesizes a verdict.

```
type LoadVerdict = {
  band: "SUSTAINABLE" | "BUILDING" | "SPIKING" | "UNDER";   // team or player
  sentence: { EN: string; IS: string };   // one plain-language line
  drivers: Array<{ signal: string; plain: { EN; IS }; z?: number; weight: number }>;
  confidence: { level: "high" | "moderate" | "low"; coverage: number; baselineDays: number };
  components: Array<{ key; label; value; band; tooltip }>;  // tiles
};
```

Inputs (reuse, do not duplicate):
- `playerLoadAcwr` → acute:chronic ratio + spike (primary band driver).
- `externalLoad` / `compositeLoad` → braking burden, HID%, HSR, residual decel.
- `mechanicalLoad.ts` (MLI) and `foster` (monotony/strain) → corroborating signals.
- `metabolicLoad.ts` (di Prampero) → **secondary, low weight** (see guardrail).
- `movementSignature` spike (≥2.0 SD) → reuse the existing unfamiliar-load spike.

Band logic = rules, not AI (rules decide, AI explains):
- **SPIKING** if ACWR > ~1.5 OR a movementSignature spike (≥2.0 SD) is present.
- **BUILDING** if ACWR ~1.3–1.5 or rising monotony/strain.
- **UNDER** if ACWR < ~0.8 (undertraining).
- **SUSTAINABLE** otherwise.
Each band names the 1–2 signals that triggered it as `drivers` — that is the
explanation. (Thresholds tunable; mirror existing `playerLoadAcwr` cut-points so
the page agrees with the rest of the system.)

## Confidence rule (mandatory — principle #4)

`confidence.level` from (a) signal coverage — how many of the component signals
are present (lower Catapult tiers expose fewer → lower coverage), and (b)
baseline maturity — training days in the window (min 8 to report, mirroring
`playerLoadAcwr` / `movementSignature`). Show it as a chip, e.g. "Confidence:
moderate · 4/6 signals · 19-day baseline." Never hide it.

## Integrity guardrail (the part that makes this honest)

Some inputs are contested in football — **di Prampero metabolic power** especially,
and HID/MLI to a lesser degree. Do NOT launder a contested metric into a clean
green verdict:
- Weight metabolic power LOW in the band logic; never let it alone flip a band.
- If the verdict leans on a weak/contested signal, the `drivers` entry must say
  so (`plain` text flags it: "metabolic-power estimate — directional only").
- Where coverage is low, the band must degrade to lower confidence, not pretend.
This is what separates the explainable layer from a dashboard that fakes certainty.

## UI

- New `LoadVerdictCard` at the top of `/coach/load-intelligence` (and reusable as
  a compact strip if wanted on the daily dashboard later).
- Component tiles under it (reuse existing number formatting).
- Wrap the current five cards in a collapsed `<details>`-style "Show S&C details"
  section (default closed). No change to those cards themselves.
- Tooltips for every jargon term; plain-language labels in the primary view.

## Endpoint

`/api/coach/load-verdict` (or extend an existing player-load route) returns the
`LoadVerdict` for the team + per-player exceptions, calling the existing
load endpoints/libs server-side. Coach-auth same pattern as `ksi-report`.

## What NOT to touch

Do not change `mechanicalLoad.ts`, `metabolicLoad.ts`, `foster`, `playerLoadAcwr`,
`externalLoad`, `compositeLoad`, or the five cards' internals. This is a synthesis
+ presentation layer on top. No data deleted; depth preserved behind the toggle.

## Order of work

1. ✅ `loadVerdict` lib (`src/lib/micropulse/loadVerdict/index.ts`) — pure
   synthesis + `__tests__/loadVerdict.test.ts` (12 cases). Anton sanity (real
   16-Jun signals): ACWR 1.15 SAFE → SPIKING via braking spike (decel z 3.1),
   drivers braking + HSR. Metabolic guardrail + confidence-degrades tested.
2. ✅ `/api/coach/load-verdict` endpoint — reuses `computePlayerLoadAcwr` +
   `computeFosterMetrics` + `computeLoadVerdict`; braking/HSR/HID/metabolic as
   recent-peak-vs-28d-baseline z. Team band + named exceptions + per-player.
   Validated on 16-Jun real data (Anton SPIKING(braking); sensible squad spread).
3. ✅ `LoadVerdictCard` on top of `/coach/load-intelligence`; the five existing
   cards moved UNCHANGED behind a default-closed `<details>` "Show S&C details".
4. ✅ Tooltips on every jargon term + plain-language labels + confidence chip,
   all inside `LoadVerdictCard`. Labelled "Load verdict (rules decide — not AI)".
Verify: `npx eslint` per file; check the verdict agrees with the daily
briefing's canonical color direction; the user runs the dev server + git.

## Acceptance (the five-question manifesto check)

1. Provenance? Verdict names its driving signals + window. ✓
2. 5-second read for a non-S&C coach? One sentence on top. ✓
3. Answers "why"? `drivers` list. ✓
4. Recommendation reasoning visible/overridable? Rules + thresholds shown. ✓
5. If AI phrases the sentence, it's labelled AI and only rephrases real signals. ✓
