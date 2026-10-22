# Claude Code brief — Owen multimodal Volume×Intensity session read + microcycle taper shape

Goal: add the one thing from Adam Owen's peer-reviewed work that MicroPulse does **not** already have — a
**multimodal Volume × Intensity session score** and the **microcycle taper-shape** view it produces —
plus two small extensions to existing infra. **Descriptive load context — never the readiness colour or
the daily decision.** Book excluded on purpose; sources are the papers only.

## ALREADY EXISTS — do NOT rebuild (verified)

- **Per-MD-day load reference bands:** `externalLoad/loadTargets.ts` `match_demand` mode already averages
  recent match demand and distributes it across a per-MD-day template (`match_demand_template`), with a
  mesocycle multiplier, cited to Martin-Garcia 2018. → **Extend, don't duplicate.**
- **Physical theme per MD day:** `week-setup` already assigns MD-4 FORCE, MD-3 NEURAL_VELOCITY, MD-2
  POLISH_CALM, MD-1 ACTIVATION (+ GAME/OFF/RECOVERY); the strength engine has MD-4 strength / MD-3 power /
  MD-2 activation / MD-1 primer / MD+1 recovery templates. → **The microcycle template is built.**
- MD context resolves correctly (`fetchMdContext`, post-match aware).

So this brief is only the **novel** Owen pieces.

## Sources (papers only — book dropped)

- Owen et al. 2017, *A contemporary multi-modal mechanical approach to training monitoring in elite
  professional soccer* (Sci Med Football) — the **volume + intensity session-score** method.
- Owen et al. 2017, *Analysis of a training mesocycle and positional quantification* (IJSPP/Res) — MD-day
  taper (MD-1 lowest vs MD-2/-3/-4), positional demands.
- Owen et al. 2024, *Between-microcycle variability … 'CUPs'* — Collective/Unit/Positional model; the
  four monitored load variables (TD, HI distance, HI accelerations, %max speed).
- Djaoui, Owen et al. 2022, *Congested periods & Acc/Dec profiles by position* (Biol Sport).

## Part 1 (core, novel) — Volume × Intensity multimodal session score

Owen's method scores a session on **two independent axes** rather than single metrics:
- **Volume** = accumulated work (total distance, HI distance, PlayerLoad, accel/decel counts) relative to
  a reference.
- **Intensity** = rate/peak (distance-per-min, PlayerLoad-per-min, %max speed, HI-accel rate).

A session is a point in the volume–intensity plane; the **week's sessions trace the taper shape** (MD-4
higher volume, MD-1 low both = the taper), which is Owen's signature read and nothing in MicroPulse shows
today.

### New pure lib `src/lib/micropulse/load/volumeIntensityScore.ts` (no I/O)

```ts
import type { Bi } from "./peakPeriod";
export interface SessionLoadInputs {
  // volume-side
  totalDistanceM?: number|null; hiDistanceM?: number|null; playerLoad?: number|null;
  accelDecelCount?: number|null;
  // intensity-side
  distancePerMin?: number|null; playerLoadPerMin?: number|null; pctMaxSpeed?: number|null;
  hiAccelPerMin?: number|null;
  durationMin?: number|null;
}
export interface VolumeIntensityScore {
  volume: number|null;      // 0–100 vs the player's/team's reference distribution
  intensity: number|null;   // 0–100
  quadrant: "high_vol_high_int"|"high_vol_low_int"|"low_vol_high_int"|"low_vol_low_int"|"unknown";
  vsMdExpectation: "as_expected"|"above"|"below"|"unknown";  // needs the MD day + its band (Part 2)
  note: Bi;                 // "high-volume, low-intensity — an MD-4-type session"; descriptive
}
export function scoreVolumeIntensity(
  inp: SessionLoadInputs,
  reference: { volumeRef: number; intensityRef: number } | null,   // rolling player/team norms
  mdContext?: string | null,
): VolumeIntensityScore;
```

- Normalise each side to a 0–100 relative to a rolling reference (per player, else team). Both axes null
  → `unknown` (never fabricated).
- `note`/`quadrant` are descriptive; cite Owen 2017.

### New read/route + surface

- Server loader builds `SessionLoadInputs` from `player_drill_load` / `player_external_load_daily` (the
  four Owen variables already stored: total_distance, high_speed/HI distance, accel/decel, max_velocity),
  plus rolling references.
- **Microcycle taper view** on `/coach/load-plan` (or periodization hub): the week's sessions plotted on
  the volume–intensity plane, one point per MD day, so the coach sees the taper shape at a glance
  ("MD-1 sits low-low = a proper taper; last week MD-1 was mid-intensity = under-tapered").

## Part 2 (small) — per-session MD-day appropriateness flag (extends loadTargets)

`loadTargets` produces a **weekly** target; it does not flag a **single** session as too heavy/light for
its MD day. Add a thin check: given a session's load + its MD day + the existing `match_demand_template`
band for that day, return `above / as_expected / below` (feeds `vsMdExpectation` above). Reuse the
template that already exists — no new template system. Surface as a one-line chip on the load-plan
("MD-1 delivered 95% of MD-3 distance — high for a taper day").

## Part 3 (optional) — "Owen / CUPs" template preset + CUPs drill tag

- Add an **"Owen (CUPs)" preset** to `match_demand_template` alongside the Martin-Garcia default, encoding
  the **directional** taper Owen reports (MD-1 lowest; MD-3 highest; positional). **Do not fabricate exact
  per-KPI percentages** the papers don't give — encode the directional shape, mark it tunable, cite Owen
  2017/2024.
- Optional `cup_principle` tag on `drill_library`/sessions (`collective|unit|positional`) — a planning
  taxonomy from Owen 2024; low priority, additive.

## Guardrails
- Pure `volumeIntensityScore.ts`; no I/O; both axes relative to a reference; null when data missing.
- Reuse `loadTargets`' template + `week-setup` themes — no duplicate microcycle system.
- **Boundary test:** the score/flag must not reach the readiness colour or the daily decision.

## Tests — `volumeIntensityScore.test.ts`
1. High TD + low per-min → `high_vol_low_int` (MD-4-type); low both → `low_vol_low_int` (taper).
2. Missing intensity inputs → intensity null, `unknown`.
3. `vsMdExpectation` uses the MD-day band: an MD-1 session above the MD-1 band → `above`.
4. Boundary test: no readiness/decision import.

`npx eslint` + tests; lint-clean. Any migration (cup tag / preset) saved under `supabase/migrations/`.

## Acceptance
- [ ] `volumeIntensityScore.ts` pure; two-axis score + quadrant; null-safe.
- [ ] Microcycle taper view plots the week's sessions on the volume–intensity plane.
- [ ] Per-session MD-day appropriateness flag reuses `loadTargets`' existing band (no new template system).
- [ ] Optional Owen/CUPs preset (directional, tunable, cited) + optional CUPs drill tag.
- [ ] Descriptive-only boundary test passes; no duplication of existing MD-template/load-target infra.

## Citations
Owen et al. 2017 (multimodal volume/intensity; mesocycle taper + positional); Owen et al. 2024 (CUPs;
between-microcycle variability); Djaoui/Owen 2022 (congestion Acc/Dec by position). Existing per-MD-day
distribution already cites Martin-Garcia 2018 — keep it.
