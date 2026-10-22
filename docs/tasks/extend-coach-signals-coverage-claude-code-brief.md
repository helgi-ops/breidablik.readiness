# Claude Code brief — extend coach_signals coverage (make every engine a briefing chip)

Goal: the single biggest help for coaches now is **fewer pages to visit**, not more analytics. The
`coach_signals` mechanism already exists (table + `/api/coach/signals` compute-and-cache +
`CoachSignalChips` on the Today dashboard), but **only ~8 engines emit a signal**. Every other
analytical page still forces the coach to *go and look*. This task wires the remaining engines into
`coach_signals` as **exception-gated chips** — silent unless they have something to say — so the Today
briefing becomes the one screen, and the deep pages become optional drill-downs.

Grounds: `docs/tasks/coach-pages-audit-background-vs-destination.md` (the destination/background/
consolidate model) — this brief implements its "Background" column.

## What exists (the pattern to copy — do NOT rebuild)

- **Table** `coach_signals` (`20260825190000`, `20260827100000_per_player`): `team_id, engine,
  player_id, level, label, why[], confidence, counterfactual, href, as_of`.
- **`/api/coach/signals/route.ts`** — computes each engine's signal, caches per (team, day): reads
  cache, else recompute → `delete` + `insert`. It already calls `deriveGamePlanFitSignal`,
  `derivePostTrainingSignal`, `deriveMatchMinutesSignal`, `deriveFormVsStateSignal` (+players),
  `deriveRobustnessTeamSignal`, `deriveHrvTeamSignal`, `deriveHrLoadTeamSignal`,
  `deriveRecoveryTeamSignal`.
- **`coachSignals/` module** — each `deriveXSignal(read) → CoachSignal` (`engine, level, label, why[],
  confidence, counterfactual, href`). `level ∈ {elevated, task, watch, steady}`.
- **`CoachSignalChips.tsx`** already renders the cache; the digest/notifications already aggregate it.
  `adminCompute.ts` has the tokenless subset for cron.

So adding an engine = write one `deriveXSignal`, call it in the route, done. No new surface, no new
table. This is deliberately incremental — ship one engine at a time.

## The exception gate (every new signal obeys it)

- **Silent unless it has something to say.** Return `level: "steady"` (no chip) unless the read crosses
  its threshold. Never a chip that says "all normal".
- **Manifesto shape:** one-line `label` (the verdict), 2–3 `why` facts, `confidence`, a `counterfactual`,
  and an `href` to the deep page (now a drill-down). **Never the readiness colour** — it sits beside it.
- Per-player where the read is per-player (`player_id` set), team-level otherwise.

## Engines to wire (Background column of the audit + the new features)

Each row: the engine, its existing read/lib, and the exception that should raise a chip.

| Engine (new `derive…Signal`) | Source read | Raise a chip when… |
|---|---|---|
| `decel_intelligence` | `decel-intelligence` / decel burden | decel:sprint coupling flag fires for a player |
| `hsr_intelligence` | `hsr-intelligence` (Lite twin) | HSR load flag (tier-swapped with decel) |
| `load_intelligence` | `load-intelligence` coupling | load-coupling / ACWR-context flag |
| `heart_rate` | `heart-rate-intelligence` | HR-vs-sRPE mismatch (efficiency drift) |
| `indoor_load` | `indoor-load` (no-GPS clubs) | indoor-load spike vs personal norm |
| `train_like_you_play` | `train-like-you-play` | training ≠ match demand (preparedness gap) |
| `peak_capacity` | `power-curve` peak-capacity | a session hit peak-capacity territory |
| `position_fitness` | `positionFitnessRequirements.ts` (new) | player **below** a demanded position requirement |
| `fitness_trend` | `fitnessTrend.ts` (new) | MAS/CS drop beyond the SWC band (retest flag) |
| `speed_zones` | `speedZones.ts` (new) | no individualised zones yet / MSS≤MAS data gap (setup nudge) |
| `body_comp` | body-composition trend (new) | %BF trend beyond error band — **neutral wording**, no target |
| `strength_1rm` | non-VBT logging / `rpeAutoregulate` (new) | RPE-autoreg suggests a load change; or a lift needs a 1RM |

(Skip any engine already emitting; keep the tokenless ones cron-safe in `adminCompute.ts` too.)

## Implementation (per engine, repeat)

1. Add `deriveXSignal(read): CoachSignal` in `coachSignals/` — pure; returns `steady` unless the
   threshold is crossed; fills label/why/confidence/counterfactual/href.
2. Load its read in `/api/coach/signals/route.ts` (reuse the existing team-load loaders) and push the
   signal into the `team`/player arrays that get cached.
3. If it's tokenless (no coach-JWT read), also add it to `adminCompute.ts` so the morning digest
   includes it.
4. `CoachSignalChips` renders it automatically (no change) — verify the chip links to the drill-down.

## Guardrails

- Pure `derive…Signal` functions; deterministic; exception-gated (`steady` = no chip).
- **Never** set or read the readiness colour from a signal — beside, not instead.
- Body-comp signal: neutral language, no target/ranking (carry the wellbeing rule from that brief).
- Cache write stays delete+insert per (team, day) as today; don't change the cache contract.

## Tests — `src/lib/micropulse/coachSignals/__tests__/coverage.test.ts`

1. Each new `deriveXSignal`: below threshold → `steady` (no chip); above → correct level + label + href +
   a counterfactual.
2. Per-player engines emit `player_id`; team engines emit `null`.
3. Body-comp signal wording contains no target/eval language (assert neutral copy).
4. Boundary test: no `derive…Signal` imports readiness/decision modules.

`npx eslint <changed files>` + tests; lint-clean.

## Acceptance

- [ ] Each listed engine emits an exception-gated `coach_signals` chip via the existing route + cache.
- [ ] Chips carry verdict + 2–3 why + confidence + counterfactual + drill-down href; never the colour.
- [ ] Tokenless engines added to `adminCompute.ts` so the morning digest includes them.
- [ ] New features (position-fitness, fitness-trend, speed-zones, body-comp, strength) surface as chips
      — the coach no longer needs to visit those pages to know if there's something to see.
- [ ] Tests + eslint clean; cache contract unchanged.

## Why this is the highest-value coach help

The analytics are already built; the cost to a coach is *finding* what matters across ~90 pages. Turning
each engine into a silent-until-relevant chip on the one screen they already open (Today) is what the
manifesto's "glance first, depth on click" actually requires — and it directly serves the pilot KPI
(weekly coaching-staff usage) and retention. Pair later with the sidebar prune to the ~12–15
destinations the audit names.
