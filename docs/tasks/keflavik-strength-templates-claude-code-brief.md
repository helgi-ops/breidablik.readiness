# Claude Code task — set up Keflavík KK strength templates (Workout A/B/Recovery → MD days)

Paste to Claude Code (or `@docs/tasks/keflavik-strength-templates-claude-code-brief.md`).

## Goal
Load Keflavík men's football's strength programme into the custom-template system, mapped to MD days:
- **Workout A → MD-4**
- **Workout B → MD-2**
- **Recovery Workout → MD+1**, applied ONLY to players who played **60+ minutes** in the last match.

Team: **Keflavík — football, men** = `51be1656-bb56-4702-a8f4-26c314b3c861`. Team-level templates
(`player_id = NULL`). Base readiness level `GREEN` (the existing adaptation rules handle yellow/red
scaling — see `src/lib/micropulse/strengthProgramming/adaptationRules.ts`).

## How to build it (use the existing path, don't hand-craft)
The custom-template system stores each set in `custom_template_sets` (metadata incl. `md_days[]`,
`team_id`, `sport`, `gender`, `season_phase`, `table_name`, `player_id`) PLUS a per-set dynamic
records table created/written via the same RPCs the builder uses (see
`src/app/api/coach/custom-templates/route.ts`, `read_custom_template_records`, and the create/write
path in `src/app/coach/custom-templates/page.tsx`). Reuse that creation flow — create one set per
workout, set `md_days` accordingly, and write the block/exercise records. Confirm the exact record
shape (block, position, exercise_id, reps, rounds, rest, readiness_level) from the builder before
inserting.

Match every exercise to `exercise_library`. Several are probably missing — add them (bilingual
EN/IS name, movement family) scoped to the team/global library (`owner_team_id`) before referencing:
Broad jump, Box jump, Trap bar deadlift, Plyo push ups, DB bench press, Alternate lunge,
Single-arm DB row, Hamstring curl, Bodysaw plank, Pallof press, One-arm DB press snatch,
Assisted split squat jump, RFESS (rear-foot elevated split squat), Med ball slam, Pull ups,
Single-arm DB bench press, Step-ups with knee drive, SL (single-leg) deadlift, Weighted V-ups,
Med ball rotational slam, Push ups.

## Workout A → MD-4
Blocks (block name · rounds · rest → exercises `reps`):
- **CNS · Power Primer** · 2–3 rounds · rest 1:30–2 min/round
  - Broad jump `3`
- **A · Strength & Power** · 1–3 rounds · 0–10 s between exercises, 2–3 min/round (contrast pair)
  - Trap bar deadlift `5` · Box jump `3`
- **B · Strength & Power** · 1–3 rounds · 0–10 s between exercises, 1–2 min/round (contrast pair)
  - DB bench press `5` · Plyo push ups `3`
- **C · Strength** · 1–3 rounds · rest 60–90 s/round
  - Alternate lunge `3` (@) · Single-arm DB row `5` (@) · Hamstring curl `6`
- **D · Core** · 1–3 rounds · rest 60–90 s/round
  - Bodysaw plank `10` · Pallof press `5` (@)

## Workout B → MD-2
- **CNS · Power Primer** · 2–3 rounds · rest 1–2 min/round
  - One-arm DB press snatch `2` (@) · Assisted split squat jump `2` (@)
- **A · Strength & Power** · 1–3 rounds · 0–10 s between exercises, 1–2 min/round
  - RFESS `3` (@) · Med ball slam `3`
- **B · Strength & Power** · 1–3 rounds · 0–10 s between exercises, 60–90 s/round
  - Pull ups `5` · Single-arm DB bench press `5` (@)
- **C · Strength** · 1–3 rounds · 0–10 s between exercises, 60–90 s/round
  - Step-ups with knee drive `3` (@) · SL deadlift `3` (@)
- **D · Core** · 1–3 rounds · 0–10 s between exercises, 60–90 s/round
  - Weighted V-ups `10` · Med ball rotational slam `5` (@)

## Recovery Workout → MD+1 (only players with 60+ match minutes)
- **A** · 1 round · Cardio (bike/run/treadmill/swim) 70–80% HRmax, `5–10 min`
- **B** · 3 rounds · Trap bar deadlift `3` — "drop from top position, 80–90% of max" (eccentric/drop)
- **C** · 1 round · Push ups `AMRAP`
- **D** · 1 round · Pull ups `AMRAP`
- **E** · 1 round · Cardio 20–30% HRmax `3–5 min` · Stretch · Foam roll / massage

**60+ minute gating:** the MD+1 recovery already targets players who played a full/long match — check
`src/lib/micropulse/strengthProgramming/mdTemplates/mdPlus1Recovery.ts` and how match minutes gate
it (`match_player_minutes` / the ≥60 threshold). Wire this Recovery set to the same condition so it
only surfaces for Keflavík players with 60+ minutes; others get no MD+1 strength session.

## Notes on the parse (verify against `workout_tables.pdf`)
- "@" means a loaded/weighted exercise (coach sets the load). Reps shown are the per-round reps.
- CNS Power Primer is a priming block (few reps, long rest). A/B "Strength & Power" are contrast
  pairs (heavy lift + explosive, 0–10 s between the two exercises). C is straight strength, D is core.
- Workout A's block A = Trap bar deadlift + Box jump (contrast); the jumps are NOT all in CNS.

## Acceptance criteria
- Three team-level `custom_template_sets` exist for Keflavík (`51be1656…`): Workout A (`md_days`
  contains MD-4), Workout B (MD-2), Recovery (MD+1), each with the blocks/exercises/reps/rounds above.
- All referenced exercises resolve in `exercise_library` (missing ones added, bilingual).
- A Keflavík player on an MD-4 day is served Workout A; MD-2 → Workout B; MD+1 with ≥60 match minutes
  → Recovery; MD+1 with <60 minutes → no strength session.
- `npx tsc --noEmit` + `npx eslint` clean; any migration saved under `supabase/migrations/`; stage
  specific files (no `git add -A`); user manages git checkpoints.
```
