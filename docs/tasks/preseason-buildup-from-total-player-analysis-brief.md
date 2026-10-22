# Brief — preseason build-up steered by Total Player Analysis (weakness-prioritised)

**The ask:** should the Periodization **Players** build-up read **Total Player Analysis** to build the
player up in pre-season? **Yes.** Total Player Analysis already computes each player's physical
strengths/weaknesses **as an athlete** (GPS/VALD/VBT position-percentiles), and each development area
carries a **lever** ("how to improve") + citation, plus a VALD training-focus plan. The pre-season build-up
should consume that and **bias the ramp toward the qualities the player is behind on**, not ramp every KPI
uniformly. Performance/planning only — never the readiness colour. Rules compute; the coach decides.

Extends `progressive-overload-consolidate-into-hub-brief.md` (Part 2, the Players-tab build-up) and
`periodization-players-individualised-plan-brief.md` (per-player match unit).

Files: `src/components/coach/TotalPlayerProfile.tsx` + `src/lib/micropulse/playerAnalysis/
totalPlayerAnalysis.ts` (the profile — READ, don't rebuild), `src/lib/micropulse/playerAnalysis/
athleteProfile.ts` (`QUALITY_BY_ID`, weaknesses), `src/lib/micropulse/vald/valdSummary.ts`
(`buildValdTrainingPlan`), `src/lib/micropulse/progressiveOverload/index.ts` (the ramp engine),
`src/app/coach/periodization-hub/page.tsx` (Players tab).

## Why it fits (and the boundary to respect)

- Total Player Analysis is **explainability-first and already deterministic**: "rules compute the
  percentiles; wording is descriptive." It exposes, per player, the **athlete-axis** `weaknesses` (physical
  qualities low within position), each `DevItem` with a `lever { en, is, cite }` = the how-to, and a VALD
  training plan. The build-up should **read** these, not recompute them (it's a hub — "it does not rebuild
  the modules").
- **Use the athlete axis, not the footballer axis.** The physical build-up is steered by the *as-an-athlete*
  qualities (GPS/VALD/VBT). The *as-a-footballer* per-90 weaknesses are tactical/output — at most a
  secondary hint for which positional drills, never the physical ramp.
- **Boundary:** Total Player Analysis is "performance only — never the readiness colour, load, or the
  medical/injury view." The build-up is a **planning** output; reading the profile to prioritise is fine,
  but the build-up must stay descriptive and must not feed back into the readiness colour. Keep that wall.
- **Pre-season is the right phase for this.** Building capacities is what pre-season is for, so targeting a
  player's weaknesses belongs in the pre-season Accumulation block / the build-up mode — not in-season
  maintenance.

## How it steers the build-up

The build-up already ramps per-KPI toward the player's own match unit (progressive-overload engine). Layer
the profile on top:

1. **Read the player's athlete-axis weaknesses** from `TotalPlayerAnalysis` (the same ones the profile shows
   as "Development areas"), with their percentile + confidence.
2. **Map each weak quality → the KPI(s) that build it** and lift those KPIs' ramp emphasis (within the
   engine's existing safe caps — rate / match-ceiling; never past the ceiling). Suggested map (confirm
   against `QUALITY_BY_ID`):
   - repeated-sprint / RSA → HSR + Acc/Dec Band 2–3 efforts
   - max speed / sprint → sprint distance
   - acceleration → Acc Band 2–3
   - aerobic / endurance (CS·D′) → distance + HSR volume
   - power / explosive → VBT / mechanical (feeds the strength side, not just GPS)
3. **Prescribe the lever, not just a number.** Surface each targeted weakness's `lever` (the profile's own
   "how to improve" + citation) as the build-up's *what to actually train* line — so the plan says "build
   repeated-sprint: short-recovery HSR intervals" not just "HSR +8%/wk".
4. **Fold in the VALD training focus** (`buildValdTrainingPlan`) for the strength/force qualities alongside
   the GPS ramp, so the build-up covers both axes.
5. **Confidence gating.** Each quality carries source+date+confidence; a low-confidence or small-position-
   group (n=2–3) weakness is surfaced as a **hint** ("read as a hint"), not a hard target. Don't over-index
   on thin data.

## Surfacing (explainability-first — verdict → why → confidence → override)

On the Players tab build-up view for the selected player:

- **Level 0 — verdict:** one line tying the plan to the player's gaps. *e.g. "Pre-season build-up prioritises
  repeated-sprint and acceleration — Óli's two lowest athlete qualities — ramping HSR and Acc/Dec fastest
  toward his match unit."*
- **Level 1 — 2–3 facts:** the targeted weaknesses (with percentile), the KPIs being emphasised, and the
  lever(s) to use. Each fact tagged with its source (Total Player Analysis / VALD) and linking there.
- **Level 2 — the build-up plan:** the per-KPI weekly ramp (build/progress/hold) with the weakness-biased
  emphasis, the levers as the drill prescription, and a link to the full profile. Coach can drop the bias
  back to a neutral ramp (override).

## Acceptance

- The Players build-up reads the selected player's **athlete-axis weaknesses + levers + VALD focus** from
  Total Player Analysis (not recomputed) and **biases the per-KPI ramp** toward them, within the engine's
  existing rate/ceiling caps.
- The plan shows the targeted weaknesses, the KPIs emphasised, and the levers as the "what to train"; each is
  source-tagged and links to the profile. Low-confidence/small-group weaknesses show the "hint" caveat.
- Uses the **athlete** axis for the physical ramp (footballer axis at most a secondary positional hint).
- Stays performance/planning only — never sets or reads the readiness colour. Coach can override to a neutral
  ramp. EN/IS. Lint + typecheck clean; manifesto five-question check passes.

Ref: `src/components/coach/TotalPlayerProfile.tsx`, `src/lib/micropulse/playerAnalysis/
totalPlayerAnalysis.ts` + `athleteProfile.ts` (weaknesses + `DevItem` levers), `src/lib/micropulse/vald/
valdSummary.ts` (`buildValdTrainingPlan`), `src/lib/micropulse/progressiveOverload/index.ts` (ramp engine),
`progressive-overload-consolidate-into-hub-brief.md`, `periodization-players-individualised-plan-brief.md`,
`docs/explainability-first.md`.
