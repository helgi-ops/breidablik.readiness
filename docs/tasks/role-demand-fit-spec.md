# Code brief — Role-demand fit (fusion-lag #1): Engine × Driver × Output × hlutverk

First fusion surface: one explainability-first card that answers **"does this player's physical engine match
the physical demands of the role he plays — and does his tactical output confirm it?"** — combining data that
normally lives in separate silos (Catapult GPS/IMA vs StatsBomb output). Prototype rendered and agreed; this
turns it into a live surface.

Grounded in: the rendered prototype (Ágúst RW: elite engine, fits role, productive, low aerobic/robustness =
watch-item), the strategy note `docs/tasks/fusion-layer-strategy.md`, and the existing Game-Plan Fit engine.

## Reuse, don't duplicate

`docs/tasks/game-plan-fit-spec.md` already defined **role demand × opponent modifier × player capacity ×
readiness** and Code built `/coach/game-plan-fit`. **Role-demand fit = the player-capacity-vs-role-demand core
of that engine, minus the opponent modifier, surfaced as a per-player development/scouting card.** So:
- **Reuse** the role-demand model + player-capacity computation from the Game-Plan Fit lib.
- **Drop** the opponent modifier and match-specific readiness weighting.
- **Add** the tactical-output confirmation dimension + the watch-item derivation + the card.

If the Game-Plan Fit lib isn't factored to share the role/demand model, refactor the shared piece into
`src/lib/micropulse/roleModel.ts` and have both consume it (one source for position→demand weights).

## The four fused inputs (all already in the system)

1. **Engine (GPS)** — position-percentile physical qualities that already power the dossier / Power Curve
   Intelligence page (speed, mechanical power, anaerobic reserve, reactive power, peak demands, aerobic
   endurance, vbt power, robustness). Source: the existing athlete-profile percentile computation. Read the
   percentiles, don't recompute.
2. **Driver (IMA)** — movement signature (accel/decel/CoD balance, directional bias) from the IMA data that
   powers `MovementSignatureCard` / `MovementStyleCard`.
3. **Output (tactical)** — per-90 output from `player_match_stats` / `player_season_stats` (OBV, goals,
   assists, xG, progressive actions) — same source the Form-vs-State panel reads.
4. **Role demand** — position → which qualities matter, as demand weights. Grounded table (below), citable.

## Role-demand model (`roleModel.ts`) — position → quality weights

Per position, weight each physical quality 0–1 by how much the role demands it, with a paper citation. Seed
values (coach-tunable later), grounded in Modric 2019 (position-specific running↔game), Ju 2022 (peak demands
by position: wide players highest, centre-backs lowest), Bradley & Ade:

| Position | speed | mech.power | anaerobic | aerobic endur. | peak demands | robustness |
|---|---|---|---|---|---|---|
| Winger (WOP/WDP) | **1.0** | 0.9 | **1.0** | 0.6 | 0.9 | 0.7 |
| Full-back | 0.9 | 0.8 | 0.9 | **0.9** | 0.9 | 0.7 |
| Central mid | 0.6 | 0.7 | 0.7 | **1.0** | 0.8 | 0.7 |
| Centre-back | 0.6 | 0.8 | 0.5 | 0.6 | 0.6 | **0.9** |
| Striker | 0.9 | 0.9 | 0.9 | 0.6 | 0.8 | 0.7 |

(Store as data, not hardcoded in components. Editable per club later. Cite the source per row.)

## Computation (`roleDemandFit.ts`, pure fn)

Input: one player's engine percentiles + driver summary + output per-90 + season-norm + position. Output: the
card model. No DB in the lib (mirror `winFactors.ts` / `formVsState` pattern — testable with a fixture).

1. **Engine-fit score** = demand-weighted mean of the player's engine percentiles for his position
   (Σ weightᵢ·percentileᵢ / Σ weightᵢ). Band: elite ≥ ~80, solid ~55–80, below < ~55. This is the core fusion
   number — "how well his engine covers what the role physically asks for."
2. **Driver-fit** = does the movement signature match the role archetype (e.g. winger → high CoD/decel +
   directional cut). Categorical: fits / atypical, with the one-line reason.
3. **Output read** = per-90 output vs his position/league norm (reuse Form-vs-State baseline): productive /
   at-norm / under. This is the *confirmation* the engine turns into end product.
4. **Watch-item** = the highest-demand quality where he's weakest **relative to the demand** — i.e. flag a
   quality only if `demandWeight high AND percentile low`. For a winger that surfaces aerobic endurance +
   robustness (the base that sustains repeated peaks). This is the signal neither dataset shows alone.
5. **Verdict** (one sentence) composed from the three bands + watch-item, in plain language (no "percentile",
   no "OBV" in the primary string).
6. **Confidence** = signal coverage (which of GPS/IMA/output/VALD are present) + baseline maturity (n
   sessions/matches). Low coverage → soften verdict + show what's missing.

## Surface (`RoleDemandFitCard.tsx` + `/api/coach/role-demand-fit` + a route/tab)

Match the rendered prototype, explainability-first:
- **(0) Verdict**, boldest, one sentence (e.g. *"Elite winger engine, matched to his role, and turning it into
  end product — durability is the one watch-item."*) + confidence badge.
- **(1) Three fused tiles** — Engine×role (Elite/Solid/Below), Driver (Fits/Atypical), Output
  (Productive/At-norm/Under) — each with one plain supporting fact. Visible without a click.
- **Watch-item** strip (amber) — the demand-weighted weakness, in plain words.
- **(2) "Show details"** — the demand-weight table for the position, the raw percentiles/IMA/output numbers,
  the jargon (eFG-style terms, OBV, peak demands) with tooltips, and the citations (Modric 2019, Ju 2022,
  Bradley & Ade). Never jump 0 → 2.
- English default + IS toggle; both coach-readable.
- Placement: a tab/section on the player profile (next to the Power Curve / Athlete Profile).

### Roster view (`RoleDemandFitRoster.tsx`) — selection / development / scouting
A team-level list ranking every player by **engine-fit for the role he actually plays** (reuse the same
`roleDemandFit.ts` per player; sort desc by engineFit). Prototype rendered — match it:
- One row per player: fit score + fit-band bar (elite green / solid amber / below red), name · position·sub-role,
  a one-line read, and a right-aligned band pill. Amber = a watch-item; red = mismatch with a **role-change
  suggestion** (e.g. "→ consider a deeper role").
- Three uses, name them in the UI copy: **selection** (who fits the role today), **development** (the watch-items
  say what to build), **scouting** (rank incoming players by fit to a vacant role).
- Filters: by position/sub-role, by band; toggle "our squad" vs "scout targets" (targets = players in the scout
  tables with GPS/output available). Skip goalkeepers (no role model row).
- Same guardrails: descriptive/advisory, confidence per row (low coverage → muted/greyed with "insufficient
  signal"), never touches readiness. Clicking a row opens that player's full Role-demand fit card.

## Guardrails (manifesto)

- **Descriptive/advisory only — never touches the readiness colour or the daily decision.** (Distinct from the
  readiness engine; this is a development/scouting read.)
- **Rules decide, AI explains.** If an AI narrative is added, it labels itself AI and cites the underlying
  qualities + weights; it never invents the verdict.
- Every quality/weight carries a paper citation; every verdict carries confidence (coverage + n).
- Counterfactual where it helps: "if aerobic endurance were mid-tier → fit would read 'complete'."
- Provenance: which data sources fed the read + as-of date.

## Honest data note (don't fake precision)

The engine percentiles + output are solid. Two known gaps to surface, not paper over:
- **Peak-period HSR** (for a true Ju-2022 peak benchmark) isn't in the Catapult MII export (distance + player
  load only) — so "peak demands" here uses what we have; a direct peak-HIR benchmark is Phase 2 (see
  `docs/tasks/football-peak-period-context-vs-research.md`).
- Small squad → position norms have low n; confidence must reflect it.

## Verification (ship gate)

1. Unit test `roleDemandFit.ts` against a fixture reproducing the prototype (Ágúst RW → Engine-fit "elite",
   watch-item = aerobic endurance + robustness).
2. A player with a genuinely mismatched engine (e.g. low-speed player listed as winger) reads "Below / atypical"
   — the fit logic must discriminate, not rate everyone elite.
3. Confidence drops and the verdict softens when GPS **or** output is missing (coverage test).
4. Card shows verdict + the plain "why" (3 tiles + watch-item) **without** opening details (manifesto Q2).
5. Readiness colour + daily decision unchanged by this feature (no write path into them). 
6. `npx eslint` clean on new files; any new table/view (role-weight table) saved under `supabase/migrations/`.

## Build order

1. `roleModel.ts` (position→demand weights, seeded + cited) — shared with Game-Plan Fit.
2. `roleDemandFit.ts` pure fn + unit test (fixture from the prototype).
3. `/api/coach/role-demand-fit` reading engine percentiles + IMA + output for a player.
4. `RoleDemandFitCard.tsx` matching the prototype; wire into the player profile (+ optional roster ranking).
5. Verify (gate above).

## Reference
- Prototype: the rendered "Role-demand fit" card (this session) — design target.
- `docs/tasks/game-plan-fit-spec.md` (reuse role/demand + capacity), `docs/tasks/readiness-adjusted-output-spec.md`
  (Form-vs-State output baseline), `docs/tasks/fusion-layer-strategy.md` (why this is #1),
  `docs/tasks/football-peak-period-context-vs-research.md` (peak-HIR Phase 2 + citations).
