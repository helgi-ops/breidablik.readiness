# Claude Code brief — non-VBT strength logging + e1RM + RPE autoregulation

Goal: give teams **without a VBT device (GymAware)** the objective loop they otherwise lack — the player
logs each working set (**weight × reps × RPE**), the system **estimates his 1RM** (reusing the existing
RIR-aware formulas), turns the prescription's **%1RM into real kg**, and uses **RPE feedback to
autoregulate** load — the non-VBT analogue of the VBT auto-regulation the engine already does. Coaching
aid the coach owns; the 1RM/autoregulation outputs are **descriptive — they never set the readiness
colour or the daily decision** (session load already flows through `session_rpe_entries` as today).

## What exists (REUSE — most of this is built, on the client/PT side)

- **`src/lib/client/oneRepMaxFormulas.ts`** — RIR-aware e1RM: `estimateOneRm(...)`, `e1rmFromSet(...)`,
  `e1rmEvidence(...)`, `rirFromRpe` (RIR = 10 − RPE), `countsAsMaxEffort`, `MAX_EFFORT_MIN_RPE = 9`,
  `RIR_CAP = 3`. Formulas: Epley `w·(1+r/30)` (default), Brzycki `w·36/(37−r)`, Lombardi `w·r^0.10`,
  `r = reps + RIR`.
- **`src/lib/client/workingOneRm.ts`** — `computeWorkingOneRm(...)`, `workingTargetKg(...)`,
  `WorkingEntry { one_rm, source: "tested"|"auto"|"logged", tested, needs_retest }`,
  `SetLogRow = { session_date, exercise_name, weight_kg, reps, rpe? }`. Guardrails: corroboration on ≥2
  sessions (28-day window), floor = tested 1RM, cap +10% (else `needs_retest`), auto-progression only
  ever RAISES.
- **`src/lib/client/oneRepMax.ts`** — `canonicalLift(name)`, `buildOneRmMap(...)` (name normalisation).
- **Football engine** (`strengthProgramming`): the session snapshot already has
  `oneRepMaxes?: Record<string, number>` ("only set if coach has entered them") and `vbtAutoRegulated:
  boolean` (requires GymAware). Prescriptions already carry `%1RM` and **RPE** targets (`exerciseLibrary`
  intensity strings like `"85% 1RM / RPE 8"`).
- **`session_rpe_entries`** — session-level gym sRPE already exists (`session_type='gym'`). Keep it for
  session load; the **per-set** log below is distinct (needed for e1RM + per-lift autoregulation).

## The gap (what to build)

1. No **per-set strength log** on the football side → non-VBT teams have no logged weight/reps/RPE, so
   `oneRepMaxes` can only be hand-entered and %1RM can't become kg automatically.
2. e1RM/working-1RM (client side) is **not wired** into the football engine.
3. **RPE feedback** isn't collected per set/lift, so there's no non-VBT autoregulation.

## New table — `player_strength_set_log` (migration under `supabase/migrations/`)

```
id uuid pk, player_id uuid not null, team_id uuid,
session_date date not null,
exercise_id text not null,          -- football exerciseLibrary id
exercise_name text not null,        -- for canonicalLift() mapping
canonical_lift text null,           -- resolved canonical key (squat/bench/…); null for accessories
set_index int not null,
weight_kg numeric null, reps int null,
rpe numeric(3,1) null check (rpe is null or (rpe>=0 and rpe<=10)),
rir numeric null,                   -- optional explicit RIR (else derived from rpe)
is_warmup boolean not null default false,
source text not null default 'player',   -- player | coach
created_at timestamptz default now(),
unique (player_id, session_date, exercise_id, set_index)
```
RLS: same shape as `player_body_metrics` / `player_fitness_test` (coach-of-team read/write, player
read+write own).

## New lib — `src/lib/micropulse/strengthProgramming/oneRmFromLogs.ts` (pure, no I/O)

Thin football-side wrapper over the client formulas:

```ts
import { e1rmFromSet, e1rmEvidence } from "@/lib/client/oneRepMaxFormulas";
import { computeWorkingOneRm, workingTargetKg, type SetLogRow, type WorkingEntry } from "@/lib/client/workingOneRm";
import { canonicalLift } from "@/lib/client/oneRepMax";

/** Build oneRepMaxes (canonical lift → working 1RM kg) from a player's logged sets (+ any tested LV 1RM). */
export function oneRepMaxesFromLogs(sets: SetLogRow[], testedByLift?: Record<string, number>): Record<string, WorkingEntry>;
/** Target kg for a prescribed %1RM on a lift; null when no working 1RM yet. */
export function targetKgForPercent(lift: string, pct: number, working: Record<string, WorkingEntry>): number | null;
```

- Only compute for the main barbell lifts (`canonicalLift` returns a key); accessories stay RPE-only.
- Round target kg to a sensible increment (2.5 kg default; expose the raw too).
- Reuse `computeWorkingOneRm`'s guardrails as-is — do not re-derive progression rules.

## New lib — `src/lib/micropulse/strengthProgramming/rpeAutoregulate.ts` (pure)

The non-VBT substitute for `vbtAutoRegulated`:

```ts
export type RpeAutoregRead = { lift: string; prescribedRpe: number|null; loggedRpeMean: number|null;
  delta: number|null; suggestion: "hold"|"add_load"|"reduce_load"; note: Bi; confidence: "high"|"moderate"|"low"; };
export function rpeAutoregulate(opts: { prescribedRpe: number|null; loggedRpe: number[]; }): RpeAutoregRead;
```

- Consistently **below** target RPE (e.g. mean ≤ prescribed − 1 over ≥2 sets) → `add_load` (small % nudge
  next session); consistently **above** → `reduce_load`; within ~±0.5 → `hold`. It's a SUGGESTION the
  coach approves — mirror the "coach owns / overrides" pattern; never auto-changes prescribed load
  silently.

## Wire-in

- Feed `oneRepMaxesFromLogs(...)` into the engine snapshot's `oneRepMaxes` (server loader) so %1RM
  prescriptions resolve to kg for non-VBT teams. VBT teams: logged sets still corroborate 1RM
  (`computeWorkingOneRm` already blends tested LV + logged); VBT autoregulation stays primary there.
- Surface on `PlayerStrengthSessionCard` (coach) and the player app strength view:
  - per exercise: the **kg target** (from working 1RM) beside the existing `%1RM / RPE` string, or, when
    no 1RM yet, the **RPE target only** + "log a set to unlock kg targets";
  - the working-1RM source chip (tested / logged / auto) + a `needs_retest` flag when hit.

## Player logging UI (player app strength surface — `PlayerClient` / a strength log entry)

- For each prescribed set: prefilled target (kg if available, else RPE), inputs for **weight, reps,
  actual RPE** (RIR optional). Save → `player_strength_set_log`. Keep it 2-tap fast; warm-ups optional.
- After the session, roll the gym sRPE into `session_rpe_entries` (`session_type='gym'`) as today — the
  per-set log is additional, not a replacement.

## Guardrails

- Pure libs (`oneRmFromLogs.ts`, `rpeAutoregulate.ts`): no I/O; deterministic; reuse client formulas,
  don't re-implement Epley/Brzycki/progression.
- Never fabricate a 1RM or kg target: no logs + no tested + no coach entry → RPE-only, honest prompt.
- Autoregulation only ever SUGGESTS; the coach approves. `computeWorkingOneRm` only raises (retest handles drops).
- **Boundary test:** e1RM / autoregulation outputs must not reach the readiness colour or the daily
  decision (session load via `session_rpe_entries` keeps its existing, separate path).

## Tests

`src/lib/micropulse/strengthProgramming/__tests__/oneRmFromLogs.test.ts`
1. Log 100 kg × 5 @ RPE 8 (RIR 2 → r=7) → Epley e1RM ≈ 100·(1+7/30) ≈ 123.3 kg.
2. Two corroborating sessions raise the working 1RM; one fluke does not (guardrail).
3. `targetKgForPercent("back_squat", 85, working)` → 0.85 × working, rounded to 2.5 kg.
4. No logs / accessory lift → null (RPE-only).

`rpeAutoregulate.test.ts`
5. Prescribed RPE 8, logged [6.5, 6.5] → `add_load`; logged [9.5, 9] → `reduce_load`; [8, 7.5] → `hold`.
6. Boundary test: no readiness/decision import.

`npx eslint <changed files>` + the new tests; lint-clean. Migration saved under `supabase/migrations/`.

## Acceptance
- [ ] `player_strength_set_log` table + RLS; player logs weight/reps/RPE per set.
- [ ] `oneRmFromLogs.ts` reuses client e1RM + workingOneRm → feeds engine `oneRepMaxes`; %1RM → kg.
- [ ] `rpeAutoregulate.ts` suggests load nudges from RPE (coach-approved), non-VBT analogue of VBT autoreg.
- [ ] Card shows kg target (or RPE-only + prompt) + working-1RM source + retest flag.
- [ ] Descriptive-only boundary test passes; VBT teams unaffected; eslint + tests clean.

## Citations
Epley 1985; Brzycki 1993; Lombardi 1989 (1RM estimation). RIR/RPE autoregulation: Zourdos 2016
(RPE/RIR), Helms 2016. VBT caps already cited in `strengthProgramming/types.ts` (Pareja-Blanco 2017).
