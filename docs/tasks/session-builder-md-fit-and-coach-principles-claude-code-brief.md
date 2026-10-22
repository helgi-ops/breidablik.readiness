# Claude Code brief — Session Builder MD-fit guardrails + coach's own periodization principles

Goal: when a coach builds a session in the Session Builder, give **advisory warnings** when the session
(1) carries **too much load** versus what that MD day should carry, or (2) is the **wrong load type** for
the day (e.g. today is MD-4 → mechanical, but the session is locomotive-dominant). Then let the coach
**run it against their own periodization principles** — pick the default MD-microcycle, a **Tactical
Periodization** preset, or a **custom** model they define — and check against *that* instead of the
built-in model. **Advisory only — never blocks, never touches the readiness colour or the daily
decision; the coach can always override, and the override is logged.**

Idea came from a coach: "if the session load is too high for a normal MD day, or doesn't match the MD
day's stimulus, warn me — and let me use my own principles (e.g. Tactical Periodization)."

## Reuse (verified — most of the scaffolding already exists)

- **`plannedSessionLoad.ts`** — `planSessionLoad(params)` → `PlannedSessionLoad` with `SessionLoadType =
  "mixed" | "locomotive" | "mechanical"` and `SessionLoadBand = "light" | "moderate" | "high" |
  "very_high"`. This already turns the built session into a type + band + per-KPI totals. **Use it as the
  session's summary.**
- **`load/drillMdFit.ts`** — `DrillLoadType` (`mechanical|locomotive|speed|metabolic|balanced|low`),
  `classifyDrillLoadType(...)`, `drillFitForMdDay(drillType, dayTargetType, mdContext)` → `DrillMdFit`.
  Already classifies each drill's fit to the MD day (and flags WCS drills on MD-4/MD-1). **The per-drill
  layer exists; this brief lifts it to the whole-session level.**
- **`loadPlan/forTeam.ts` `intentToMd(intent)`** → `{ mdDay, dayType, focus }`; Week Setup already stores
  `day_intent` (CHECK: `FORCE_LIGHT|FORCE|NEURAL_VELOCITY|VELOCITY|POLISH_CALM|ACTIVATION|GAME|OFF`) and a
  `focus` like "MD-4 Mechanical". **This is the day's intended context.**
- **`externalLoad/loadTargets.ts` (`LoadTargetMode`) + `weeklyLoadTypes.ts` + `periodization/index.ts`
  `weeklyTargetFromMatch`** — already compute the day's/weeks's target load per KPI. **This is the "normal
  for this MD day" band to compare against.**
- **Session Builder UI:** `src/components/coach/SessionBuilder.tsx`, `SessionBuilderCard.tsx`,
  `DrillRecommenderPanel.tsx` — already read `day_intent` and show per-drill fit badges + "best today".
- **Override logging** — the existing coach-override audit pattern (log with a reason).

So Parts 1–2 are mostly **aggregation + a warning banner**; Part 3 is the new **configurable model** layer.

## Part 1 — load overshoot vs the day (modest)

Compare the built session's planned load (`planSessionLoad` band + per-KPI totals) to the **day's target
band** (`loadTargets` / `weeklyTargetFromMatch` for that MD day). Warn when the session exceeds it:

- e.g. "MD-2 target ≈ 0.4× match; this session ≈ 0.7× → **above the MD-2 band**." Show the KPIs driving
  the overshoot (HSR, PlayerLoad, accel/decel) and a **counterfactual** ("drop the 8v8 block or shrink the
  area → back in band").
- Bands: `in_band` / `above` / `below` (below = a prompt, not an error — maybe intended for a light day).

## Part 2 — load-type mismatch vs the day (modest)

Take the session's dominant `SessionLoadType` (from `planSessionLoad`; or aggregate the drills'
`classifyDrillLoadType`) and compare to the **day's intended stimulus** (from `day_intent` / `focus`,
mapped through the active periodization model in Part 3). Warn on a mismatch:

- e.g. "Today is **MD-4 → mechanical**, but this session is **locomotive-dominant**." List the drills
  pushing it the wrong way (reuse `drillFitForMdDay` per drill) and the fix ("swap the large-pitch
  possession for a small-area 1v1 / finishing block to raise mechanical load").
- Honest fallback: drills with no GPS demand profile → classify from `category` + `area_per_player`
  (flagged lower confidence), never fabricate metrics.

## Part 3 — the coach's own periodization principles (the new piece)

A selectable **periodization model** that maps each MD day to an intended load type + intensity cap +
(optionally) a tactical emphasis. The Part 1–2 checker reads the **active model** instead of a hardcoded
one.

New pure lib `src/lib/micropulse/periodization/periodizationModel.ts`:

```ts
import type { SessionLoadType } from "@/lib/micropulse/plannedSessionLoad";
import type { Bi } from "@/lib/micropulse/load/peakPeriod";

export type ModelSource = "default_md" | "tactical_periodization" | "custom";
/** The four moments of the game (Tactical Periodization). */
export type GameMoment = "def_org" | "def_to_att" | "att_org" | "att_to_def" | null;

export interface MdDaySpec {
  mdDay: string;                 // "MD-4", "MD-3", "MD-2", "MD-1", "MD+1"…
  intendedType: SessionLoadType | "speed";  // mechanical / locomotive / speed / mixed
  intensityCapPct: number | null;            // cap as ×match (null = no cap)
  tacticalMoment?: GameMoment;   // the emphasised game moment (TP / custom)
  principleTag?: string | null;  // free coach tag ("high press", "build-up")
  note: Bi;
}
export interface PeriodizationModel {
  id: string; name: Bi; source: ModelSource;
  days: MdDaySpec[];             // one spec per MD day in the microcycle
}

export const DEFAULT_MD_MICROCYCLE: PeriodizationModel;        // today's built-in model
export const TACTICAL_PERIODIZATION_MORPHOCYCLE: PeriodizationModel; // the preset (below)

export function specForDay(model: PeriodizationModel, mdDay: string | null): MdDaySpec | null;
```

- **Default preset** = the current behaviour (MD-4 FORCE/mechanical, MD-3 NEURAL_VELOCITY, MD-2
  VELOCITY/POLISH_CALM, MD-1 ACTIVATION), so nothing changes for teams that don't opt in.
- **Tactical Periodization preset** (Frade / Mourinho morphocycle): **MD-4 = Tension** (mechanical;
  reduced spaces, eccentric/strength, 1v1, finishing), **MD-3 = Duration** (locomotive/endurance; larger
  spaces, more continuous, 11v11), **MD-2 = Velocity** (speed; short high-speed actions, big recoveries),
  **MD-1 = Activation** (polish/calm). Intensity "maximal **relative to recovery**", and each day carries
  an emphasised **game moment / principle**. NOTE: this differs from the current default labels (e.g. TP's
  MD-3 is duration/endurance, not neural/velocity) — which is exactly why it's a selectable model.
- **Custom** = the coach edits an `MdDaySpec` per day (type, intensity cap, moment, principle tag). Stored
  per team.

Storage — new table (migration under `supabase/migrations/`):

```sql
create table public.team_periodization_model (
  team_id uuid primary key references public.teams(id) on delete cascade,
  source text not null default 'default_md'
    check (source in ('default_md','tactical_periodization','custom')),
  model jsonb,                 -- the PeriodizationModel.days when source='custom'
  updated_by uuid, updated_at timestamptz default now()
);
-- RLS: coach/staff of the team read+write; everyone else none.
```

### The session-fit checker

New pure lib `src/lib/micropulse/periodization/sessionFitCheck.ts`:

```ts
import type { PlannedSessionLoad, SessionLoadType } from "@/lib/micropulse/plannedSessionLoad";
import type { MdDaySpec } from "./periodizationModel";
import type { Bi } from "@/lib/micropulse/load/peakPeriod";

export type FitLevel = "ok" | "watch" | "mismatch";
export interface SessionFitWarning {
  kind: "load_overshoot" | "type_mismatch" | "tactical_mismatch";
  level: FitLevel;
  headline: Bi;                  // layer-0 verdict line
  why: Bi[];                     // 2–3 plain facts (the "why")
  counterfactual: Bi;            // "drop X / shrink area → back in band"
  confidence: "high" | "moderate" | "low";  // lower when drill metrics are estimated/off-ball
}
export interface SessionFitResult {
  verdict: "fits" | "review";    // layer-0: does the session fit today?
  warnings: SessionFitWarning[];
  daySpec: MdDaySpec | null; modelName: Bi;
}
export function checkSessionFit(opts: {
  planned: PlannedSessionLoad;             // from planSessionLoad
  dayTargetByKpi?: Partial<Record<string, number>> | null;  // loadTargets/weeklyTargetFromMatch
  daySpec: MdDaySpec | null;               // from the active periodization model
  drills?: Array<{ id: string; loadType: SessionLoadType | "speed" | null; category?: string | null;
                   tacticalMoment?: string | null; metricsEstimated?: boolean }>;
}): SessionFitResult;
```

- **load_overshoot:** planned band/KPIs vs `dayTargetByKpi` and `daySpec.intensityCapPct` → `above`/`in`/`below`.
- **type_mismatch:** `planned.sessionType` vs `daySpec.intendedType` → mismatch + the drills pushing it.
- **tactical_mismatch (confidence-gated):** does any drill carry `daySpec.tacticalMoment` /
  `principleTag`? Coarse match from `drill_library.category` + tags + (where present) `peakPeriodContext`
  Ju-actions; **off-ball/tactical fidelity is partial without event tracking → mark `low` confidence**,
  never a hard fail. Omit this warning entirely when there's no tactical target set.
- Pure, deterministic, null-safe. No I/O, no colour.

## Surface (Session Builder)

- A **verdict-style advisory banner** at the top of the builder (the layered read per CLAUDE.md):
  - **(0)** one line: "✓ Fits today (MD-4 · mechanical)" or "⚠ Review — doesn't match today".
  - **(1)** the 2–3 `why` facts + the counterfactual, visible without a click.
  - **(2)** behind "Show details": the per-KPI target vs planned, the mismatching drills, the model used.
- A small **model picker** (team setting, or inline in the hub): Default MD-microcycle / Tactical
  Periodization / Custom. Custom opens a per-MD-day editor (type, intensity cap, moment, principle).
- An **"Use anyway / override"** action that dismisses the warning and **logs the override with an optional
  reason** (existing audit pattern). The banner never prevents saving the session.
- Reuse the existing per-drill fit badges in `DrillRecommenderPanel` / `SessionBuilderCard`; this adds the
  **session-level** roll-up on top.

## Guardrails / tests

- Pure `sessionFitCheck.ts` + `periodizationModel.ts`; deterministic; null-safe (no target → skip overshoot,
  labelled; no drill metrics → category/area fallback, `low` confidence; no tactical target → no tactical
  warning). **Never fabricate** load numbers.
- Reuse `planSessionLoad`, `drillMdFit`, `intentToMd`, `loadTargets`/`weeklyTargetFromMatch` — **no new load
  engine**. Models are data, not new engines.
- **Boundary test (mandatory):** warnings and the model are advisory/display-only — they **never** write or
  influence `readiness_entries.color` / `v_coach_readiness_today_v8.final_color`, `athlete_decision_history`
  or `stage4_decisions`. Saving a session is never blocked.
- Tests: a locomotive session on an MD-4 mechanical day → `type_mismatch`; a 0.7×-match session on an
  MD-2 (~0.4×) day → `load_overshoot` with the driving KPIs + counterfactual; Tactical Periodization preset
  maps MD-3 → locomotive/duration (differs from default) and the same session now reads `fits`/`review`
  accordingly; custom model round-trips through `team_periodization_model`; override logs a reason;
  low-confidence tactical warning when drill metrics are estimated; **boundary test** (no colour write).

`npx eslint <changed files>` + tests; lint-clean. Migration saved under `supabase/migrations/` with a
timestamp prefix.

## Acceptance
- [ ] Session Builder shows an advisory, layered (verdict → why → details) banner when the built session is
      **over the day's load band** or the **wrong load type** for the MD day, each with a counterfactual.
- [ ] A selectable periodization model drives the check: Default MD-microcycle, **Tactical Periodization**
      preset, or **Custom** (per-MD-day type / intensity cap / game moment / principle), stored per team.
- [ ] Tactical emphasis checked coarsely from drill category/tags/peak-context, **confidence-gated**, and
      skipped when no tactical target is set.
- [ ] Advisory only — coach can override (logged with a reason); saving is never blocked; reuses existing
      engines; descriptive-only **boundary test passes**; eslint + tests clean; migration saved.

## Citations / grounding
Tactical Periodization — Vítor Frade (Univ. Porto); popularised by Mourinho / Villas-Boas. Core ideas:
the four **moments** of the game (defensive organisation, def→att transition, attacking organisation,
att→def transition); **specificity** (every drill expresses the game model); the **morphocycle** with
acquisition days (MD-4 Tension / MD-3 Duration / MD-2 Velocity) where intensity is **maximal relative to
recovery**; principles → sub-principles → sub-sub-principles. Coach reference:
soccercoachlab.com "What is Tactical Periodization and How to Implement It" (the guide the coach linked).
MD-microcycle stimulus mapping and load bands: existing MicroPulse engines (`plannedSessionLoad`,
`drillMdFit`, `loadTargets`, `weeklyTargetFromMatch`); Buchheit/Lacome & Martín-García on MD-cycle loading.
