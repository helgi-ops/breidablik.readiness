# Claude Code brief — season-phase strength periodization + per-player pre-season recommender

Goal: make the strength engine change its **goal by season phase**, and — in pre-season — **recommend a
starting emphasis per player from their own data** (does he need max strength first, or hypertrophy, or
power?). Plus give the coach an **in-season choice: microdose vs traditional**. Builds on the existing
season detection + MD-microdose engine. **Descriptive/coach-owned; advisory; never the readiness colour.**

Read first: `docs/tasks/strength-periodization-off-pre-in-season-research-synthesis.md` (the model +
citations).

## Reuse (verified — do not rebuild)

- **`periodization/index.ts` `detectSeasonPhases`** → `preseason | competitive | offseason`.
- **`strengthProgramming`** — MD-microdose engine (MD-4 strength / MD-3 power / MD-2 activation / MD-1
  primer / MD+1 recovery); `oneRepMaxes` + VBT/e1RM load; `ledgerEmphases` already accepted in the snapshot.
- **`playerAnalysis/athleteProfile`** qualities incl. `max_strength`, `vbt_power`, `reactive_power`,
  `work_capacity`, `robustness` (position percentiles + confidence).
- **`unifiedDeficits`** — already maps IMTP → max-strength emphasis, IMA-decel → eccentric, asymmetry →
  unilateral, poor absorption → eccentric_absorption.
- **`vald/benchmarks.ts`** — elite/good/average/below bands by population.
- **`load/bodyComposition.ts`** — lean mass / body-fat% (Jackson-Pollock) — **already implemented**.
- **`positionFitnessRequirements.ts`** — position physical requirements.

## Part 1 — season-phase strength goal (rides on `detectSeasonPhases`)

A phase → strength-emphasis config (defaults, team-tunable):

- **Off-season:** reconditioning + **minimum maintenance** (protect the pre-season start; short rest first).
- **Pre-season:** a **block sequence** — hypertrophy/strength-endurance → **max strength (~4 wk)** →
  **power/speed (~3–4 wk)** — that sets the engine's intensity zone (%1RM / velocity) and volume, tapering
  into the opener. (This is where Part 2's per-player recommendation weights the *starting* block.)
- **In-season:** retention (the current microdose), + a **break = mini-block** trigger and a
  **congested-week strength-protection** flag (Rønnestad: 1×/wk maintains; 1×/2wk loses ~10% 1RM).

Each phase just selects emphasis + zone + volume the engine already lays out — a periodisation *layer*.

## Part 2 — per-player pre-season recommender (the new intelligence)

New pure lib `src/lib/micropulse/strengthProgramming/preseasonEmphasis.ts`:

```ts
import type { Bi } from "@/lib/micropulse/load/peakPeriod";
export type PreseasonEmphasis =
  | "hypertrophy" | "max_strength" | "power" | "strength_endurance" | "injury_prevention_priority";

export interface PreseasonInputs {
  maxStrengthPctl?: number|null;      // athleteProfile max_strength (or VALD IMTP band)
  powerPctl?: number|null;            // vbt_power / reactive_power
  bodyFatPct?: number|null; leanMassKg?: number|null; massKg?: number|null;  // bodyComposition — REQUIRED
  deficitEmphases?: string[];         // from unifiedDeficits ledger (eccentric/unilateral/…)
  position?: string|null;
}
export interface PreseasonEmphasisRead {
  emphasis: PreseasonEmphasis;
  why: Bi;                            // "low relative strength + low lean mass → build tissue first"
  secondary: PreseasonEmphasis|null; // injury-prevention overlay is often secondary
  confidence: "high"|"moderate"|"low";
  needsBodyComp: boolean;             // true when body comp is missing → prompt, don't guess
  cite: string;
}
export function recommendPreseasonEmphasis(inp: PreseasonInputs): PreseasonEmphasisRead;
```

Rules (explainable, cited; thresholds configurable):

- **Body composition is the discriminator** between "needs mass" and "needs force" — so when it's missing,
  set `needsBodyComp: true` and return a low-confidence default with a prompt to record it (this is why
  the founder insists on líkamsástand).
- **`hypertrophy`** — low relative strength **AND** low lean mass / high body-fat for position: build
  cross-sectional area/tissue before loading heavy (stronger athletes respond better to later phases —
  Cormie/Suchomel).
- **`max_strength`** — adequate mass but low `max_strength`/force (has the tissue, lacks the ceiling).
- **`power`** — high `max_strength` but low `power`/RFD (`vbt_power`/`reactive_power` low): convert
  strength to fast force.
- **`strength_endurance`** — reconditioning / low work capacity (typical off→pre transition start).
- **`injury_prevention_priority`** — a hamstring/adductor deficit or asymmetry from the ledger → overlay
  (eccentric emphasis) **regardless** of the primary. (Injury prevention runs year-round.)
- Position weights the read (e.g., CB robustness/aerial; winger power/speed).

Everyone still progresses through the sequence; the recommendation sets the **starting block + where to
spend extra weeks** for that player. Advisory — the coach confirms/overrides.

## Part 3 — in-season: microdose vs traditional (coach's choice)

A team/coach setting `in_season_strength_mode = 'microdose' | 'traditional'`:
- **microdose** (current default): volume distributed across the MD week (MD-4 strength, MD-3 power…).
- **traditional**: 1–2 dedicated full strength sessions/week (e.g., MD-4 + MD-2), the rest minimal.
- Both **maintain** strength if weekly volume is equated (Cuthbert 2021) — present it as an equal,
  evidence-based choice, not one "right" way. The engine already produces per-MD sessions; `traditional`
  just concentrates the week's strength volume into 1–2 days and lightens the others.

## Surface

- **Periodization hub / strength:** show the current phase's strength goal; in pre-season, per player, the
  **recommended starting emphasis + why + confidence** (and a "record body composition" prompt when
  missing). An in-season **microdose/traditional toggle** in team settings.
- Layered read (manifesto): verdict (emphasis) → 2–3 why facts (his numbers) → confidence → details/cite.

## Guardrails / tests

- Pure `preseasonEmphasis.ts`; deterministic; `needsBodyComp` when body comp absent (never guess mass vs
  force without it). Advisory only; coach owns; **no readiness/decision coupling** (boundary test).
- Reuse `detectSeasonPhases`, the microdose engine, `athleteProfile`, `unifiedDeficits`, `bodyComposition`,
  `vald/benchmarks` — no new engines.
- Tests: hypertrophy (low strength + low lean mass), max_strength (adequate mass + low force), power
  (strong + low RFD), injury overlay (hamstring deficit), `needsBodyComp` when body comp null; in-season
  toggle changes volume distribution but not weekly total; boundary test.

`npx eslint` + tests clean. Config/migration for the mode + phase config saved under `supabase/migrations/`.

## Acceptance
- [ ] Strength goal changes by season phase (off = maintain/recondition; pre = block sequence; in = retain).
- [ ] Per-player pre-season emphasis recommended from strength/power/body-comp/deficit/position data, with
      why + confidence; requires body comp (prompts when missing).
- [ ] In-season microdose vs traditional toggle; both equated on weekly volume.
- [ ] Advisory/coach-owned; descriptive-only boundary test passes; reuses existing engines; eslint+tests clean.

## Citations
Rønnestad 2011 (in-season maintenance); Cuthbert 2021 (frequency/volume distribution); Mujika & Padilla
2000 (detraining); Cormie/Suchomel 2011/2016 (strength underpins power; stronger respond better);
Pareja-Blanco 2017 (velocity autoregulation). See the research synthesis doc for the full set.
