# Brief — more IMA / mechanical variables in the plan + PDF export

**The ask:** the block plan (on-page "system computes") and the PDF export carry only Dist / HSR / Player
Load today. Add the **IMA / mechanical family** so each session gets individualised mechanical targets, not
just running ones — and surface them in the PDF. The data already exists in `TeamAverages`; it just never
reaches the plan model. Descriptive planning — never the readiness colour. Rules recommend; coach decides.

Files: `src/lib/micropulse/periodization/index.ts` (the plan model + shares),
`src/app/coach/periodization-hub/page.tsx` (the on-page plan), `src/components/coach/PeriodizationBlockPdf.tsx`
+ `PeriodizationHubPdf.tsx` (the export), and the demo PDF as the visual reference for the callout chips.

## The gap (grounded in the code)

- `MatchUnitAbs = { dist, hsr, load, accdec }` — `accdec` is on the unit but **not** in `CAL_SHARE`
  (`{ dist, hsr, load }` only), so it never gets a per-day target.
- `CalDay` carries only `dist, hsr, load` — no mechanical/IMA output at all.
- `TeamAverages` **already computes** the richer IMA fields that are being dropped: `accelHiEff`,
  `decelHiEff` (Acc/Dec Band 2–3 high-intensity effort counts), `strideHi` (top-band free-running stride
  count), `direction { forward, backward, lateral }`, and the Pro-only `rhieBouts`, `runSymmetry`,
  `metabolicPower` — plus their `match*` counterparts. These are exactly the variables the coach wants.

## The variables to add (tier- and presence-gated)

Add these to the plan, each **nullable** and shown only when the club's feed carries it:

| Variable | Source field | Tier | Notes |
|---|---|---|---|
| **Acc Band 2–3** (hi-intensity accelerations) | `accelHiEff` / `matchAccelHiEff` | **Core (GPS)** + Pro | GPS-derivable — Core clubs get this |
| **Dec Band 2–3** (hi-intensity decelerations) | `decelHiEff` / `matchDecelHiEff` | **Core (GPS)** + Pro | " |
| **IMA Free Running / Stride** | `strideHi` / `matchStrideHi` | **Pro (IMU)** | stride/free-running count |
| **IMA direction** (fwd / back / lat) | `direction` | **Pro (IMU)** | the movement signature — drives position tilt |
| **RHIE** (repeated hi-intensity bouts) | `rhieBouts` | **Pro**, presence-gated | absent on some Pro feeds → hide |
| **Running symmetry** | `runSymmetry` | **Pro**, presence-gated | " |
| **Metabolic power** | `metabolicPower` | **Pro**, presence-gated | di Prampero |

Keep the existing Acc+Dec total as-is; Band 2–3 is the *high-intensity* subset that actually differentiates
day-types.

## Wiring (minimal, grounded)

1. **Extend `MatchUnitAbs`** with the new fields (all `number | null`): `accHiEff, decHiEff, stride,
   dirFwd, dirBack, dirLat, rhie, symmetry, metPower`. Populate from `TeamAverages` (team scope) and from
   the player's own match rows (player scope) — same path as `dist/hsr/load/accdec` today.
2. **Extend `CAL_SHARE`** so each day-type sets a fraction-of-match for the mechanical/IMA variables, per the
   evidence (day-split rationale):
   - **Mechanical day** — high Acc/Dec Band 2–3 (>1× match, per Figueiredo accel 131–166%), moderate stride,
     low HSR. This is the mechanical-overload day.
   - **Locomotive day** — high stride / free-running + HSR, lower Acc/Dec Band 2–3 (the running day).
   - **Mixed** — balanced, near-match on all.
   - **Activation / Top-up** — low across the board.
   - **Direction** — tilt fwd/back/lat by **position** (winger → more forward + lateral; centre-back → more
     backward/lateral covering), grounded in the squad demands + Buchheit's directional gap. Default to the
     team direction split when position is unknown.
3. **Extend `CalDay`** to carry the computed IMA targets, and the weekly rollups (`pctMech` already exists;
   add `pctAccDec23`, `pctStride` as % of match for the overload table if shown).

## Surfacing — keep it readable (progressive disclosure)

The primary read stays **Dist / HSR / Load** — don't widen the main row into an unreadable spreadsheet.

- **On-page plan:** under each session, a secondary muted line with the mechanical/IMA targets present for
  the tier (e.g. *"Acc B2–3 42 · Dec B2–3 57 · Stride 310 · dir → fwd"*), or a **"Show mechanical/IMA
  detail"** toggle per week. Tier decides which appear.
- **PDF export:** add the IMA variables as a compact **second line per session** (or a slim right-hand
  block), not extra wide columns — mirror the demo's density. On **page 1**, extend the **match-unit
  callout** with IMA chips (Acc B2–3, Dec B2–3, Stride, and the direction split) alongside the existing
  Distance / HSR / Player Load / Acc+Dec chips, so the coach sees the full unit the block scales from.
- **Legend / "what the day-types mean":** add one line noting Mechanical loads Acc/Dec Band 2–3 + stride
  while Locomotive loads free-running/HSR — the split that protects the posterior chain.

## Tier handling (explicit)

- **Vector Pro (IMU):** all variables (Acc/Dec B2–3, Stride/Free-running, direction, + RHIE / symmetry /
  metabolic power where present).
- **Vector Core (GPS):** Dist, HSR, Acc/Dec Band 2–3 (GPS-derivable) — no stride/direction/RHIE/symmetry.
- **RPE-only:** sRPE targets, no IMA — hide the block entirely, as now.

Presence-gate each column: if the source field is null for the whole squad/player, drop it (don't render
empty dashes across the board).

## Evidence

Acc/Dec over match, HSR under (per-session): Figueiredo (positional match-relative). Directional running
load / the directional gap: Buchheit (Sep-2026 "closing the directional gap"), MicroPulse's own IMA
directional signature. Metabolic power: di Prampero 2015. Day-split (HSR vs mechanical on separate days):
Buchheit programming HSR vs mechanical. All in `docs/research/football-periodization-evidence.md`.

## Acceptance

- `MatchUnitAbs` + `CAL_SHARE` + `CalDay` carry the IMA variables; the block builder outputs per-session
  Acc/Dec Band 2–3, Stride/Free-running, and a direction tilt, scaled from the scope's own match unit.
- On-page plan shows the mechanical/IMA detail (line or toggle) tier-appropriately; RPE hides it, Core shows
  the GPS subset, Pro shows all.
- The PDF export shows the IMA targets per session (compact second line) and the match-unit callout on page 1
  gains the IMA chips — matching the demo's look/density.
- Presence-gating verified: a Core team shows Acc/Dec B2–3 but no stride/direction; a Pro team with no RHIE
  feed hides RHIE. EN/IS throughout. Never the readiness colour. Lint + typecheck clean; manifesto
  five-question check passes.

Ref: `src/lib/micropulse/periodization/index.ts` (`MatchUnitAbs` line ~415, `CAL_SHARE` ~423, `CalDay`,
`TeamAverages` IMA fields), `src/app/coach/periodization-hub/page.tsx` (the "system computes" list),
`src/components/coach/PeriodizationBlockPdf.tsx` + `PeriodizationHubPdf.tsx` (export + callout),
`docs/research/football-periodization-evidence.md`, `docs/explainability-first.md`.
