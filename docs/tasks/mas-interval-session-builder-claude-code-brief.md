# Claude Code brief — MAS interval session builder (turn the zones into a real HIIT session)

Goal: turn the MAS speed **zones** MicroPulse already computes into an actual, per-player **running
interval session** — reps × work × rest at *his* km/h, with the per-rep distance — so a coach can
prescribe conditioning off the fitness test, not just read a speed table. **Descriptive planning aid the
coach owns and adjusts** — it never touches the readiness colour, the load target, or the daily decision.

## What exists (reuse)

- **`intervalSpeedsFromMas(masKmh)`** in `src/lib/micropulse/periodization/index.ts` → `IntervalZone[]`:
  Type 1–5 with `{ type, label, pctMas, kmh }` (70/85/95/105/120% MAS, Buchheit & Laursen zones). This
  is the speed layer — build the *session format* on top of it.
- MAS resolution already exists (`fitnessTests.ts`, `speedZonesData.ts`, `criticalSpeed.ts`). Reuse to
  get the player's `masKmh` (+ provenance/confidence).
- Conditioning page (`/coach/conditioning`) is the home; `SessionBuilder`/`sessionPlan.ts` is the
  strength-side analogue — mirror its "coach owns / never readiness" framing.

## The model — HIIT formats (Buchheit & Laursen 2013 "weapons")

A **format** maps a training goal to a work/rest structure; the *speed* comes from the player's MAS zone.

| Format | Goal | Zone (%MAS) | Work | Rest | Reps × sets (default) |
|---|---|---|---|---|---|
| Long intervals | VO₂max / aerobic power | Type 4 (~105%) | 3–4 min | 2–3 min | 4–5 × 1 |
| Short intervals | VO₂max, lower load | Type 4–5 (105–115%) | 15–30 s | 15–30 s | 12–15 × 2–3 |
| Threshold | extensive/tempo | Type 3 (~95%) | 4–8 min | 60–90 s | 3–4 × 1 |
| Repeated-sprint (RSA) | speed endurance | > Type 5 (near max) | ≤ 6 s | ~20 s | 6–8 × 2–3 |
| Aerobic/recovery | recovery run | Type 1–2 (70–85%) | continuous | — | 20–40 min |

Per player, per rep:
- `speedKmh = masKmh × pctMas/100` (from the zone). `speedMs = speedKmh / 3.6`.
- `repDistanceM = speedMs × workSeconds` (for timed intervals) — the coach can run it as time or as the
  distance on a marked pitch.
- `totalWorkMin`, `totalSessionMin` (work + rest × reps × sets), `sessionDistanceM`.
- Short shuttle formats (with COD) carry a note that COD lowers the effective speed ~5–10% (don't
  silently apply; surface it).

## New pure lib — `src/lib/micropulse/load/intervalSession.ts` (no I/O)

```ts
import type { Bi } from "./peakPeriod";
import { intervalSpeedsFromMas, type IntervalZone } from "@/lib/micropulse/periodization";

export type HiitFormatId = "long" | "short" | "threshold" | "rsa" | "recovery";
export interface HiitFormatDef { id: HiitFormatId; label: Bi; goal: Bi; zoneType: number;
  workSec: number; restSec: number; reps: number; sets: number; restBetweenSetsSec?: number; codNote?: boolean; cite: string; }

export interface IntervalPrescription {
  format: HiitFormatId; label: Bi; goal: Bi;
  masKmh: number; pctMas: number; speedKmh: number; speedMs: number;
  workSec: number; restSec: number; reps: number; sets: number; restBetweenSetsSec: number | null;
  repDistanceM: number | null; totalWorkMin: number; totalSessionMin: number; sessionDistanceM: number | null;
  note: Bi; confidence: "high"|"moderate"|"low"; cite: string;
}

export const HIIT_FORMATS: Record<HiitFormatId, HiitFormatDef>;      // the table above (editable defaults)
export function buildIntervalSession(opts: {
  masKmh: number | null; masConfidence?: "high"|"moderate"|"low";
  format: HiitFormatId; overrides?: Partial<Pick<HiitFormatDef,"workSec"|"restSec"|"reps"|"sets">>;
}): IntervalPrescription | null;                                     // null when masKmh missing
```

- Speed from `intervalSpeedsFromMas(masKmh)` at the format's `zoneType` (don't re-derive %MAS).
- `confidence` inherits the MAS provenance (direct MAS test > VIFT-shrunk > CS-backcalc).
- `note` (Bi): "starting template (Buchheit & Laursen 2013) — coach adjusts reps/rest to the block;
  speeds are as accurate as the MAS test; run as time or the marked distance." COD caveat when relevant.
- Return `null` (never fabricate a speed) when `masKmh` is missing → card shows "record a MAS test first".

## Surface — an "Interval session" builder on `/coach/conditioning` (near CriticalSpeedCard)

- Pick a format (Long / Short / Threshold / RSA / Recovery) → show the per-player session: speed (km/h),
  per-rep distance, reps × work / rest × sets, total work + total time + total distance. Editable
  reps/rest (overrides). A one-line "why this format" (the goal) + the MAS-provenance confidence chip.
- Optional: a "send to player / add to session" hook mirroring the strength SessionBuilder (later).
- Honest labels: template not prescription, coach-owned, descriptive; speeds depend on the MAS test.

## Guardrails
- Pure lib, no I/O; deterministic; speeds only from `intervalSpeedsFromMas`.
- `null`/empty when no MAS — never a fabricated speed.
- Boundary test: no readiness/decision/prescription-engine coupling (it's a planning aid, like sessionPlan.ts).

## Tests — `src/lib/micropulse/load/__tests__/intervalSession.test.ts`
1. MAS 16.0, format "long" (Type 4, 105%) → speed 16.8 km/h; 4×4 min; repDistance ≈ 4.67 m/s × 240 ≈ 1120 m; totals correct.
2. "short" 15-15 → reps/sets from defaults; repDistance from 15 s.
3. Overrides (reps/rest) reflected in totals.
4. `masKmh = null` → `null`.
5. RSA carries near-max note + COD note where set.
6. Boundary test: no readiness/decision import.

`npx eslint` + the new test; lint-clean.

## Acceptance
- [ ] `intervalSession.ts` pure; speeds only via `intervalSpeedsFromMas`; null on missing MAS.
- [ ] 5 formats with editable defaults; per-player speed, per-rep distance, totals; MAS-confidence shown.
- [ ] Conditioning surface with format picker + editable reps/rest + honest template labels.
- [ ] Descriptive-only boundary test passes; eslint + tests clean.

## Citations
Buchheit & Laursen 2013 (*Science and Application of HIIT* — the format weapons + %MAS zones);
Buchheit 2008 (30-15 IFT / %VIFT prescription). Same zones already cited in `periodization/index.ts`.
