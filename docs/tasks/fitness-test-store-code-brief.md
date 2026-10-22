# Claude Code brief — a fitness-test store in MicroPulse (Yo-Yo, 30-15 IFT, beep, MAS, line drill)

Goal: let coaches **record standardized endurance tests** (the ones in
`Greinar/Tholpróf-fótbolti-korfubolti-yfirlit.md`) per player, and feed their outputs into the CS/D′
and load-target layers. **Answer to "er hægt að setja þau inn í kerfið?" — yes.** This brief is the how.

## Is it feasible? Yes — same pattern we already use

A dedicated max-effort table already exists: **`player_running_test`** (the 4-min MAS run, 20 players).
The clean move is to **generalize it into one `player_fitness_test` store** that holds any test type,
and treat the 4-min run as one `test_type`. One table, one entry form, one history card.

## Schema (generalize, don't fragment)

```sql
create table if not exists public.player_fitness_test (
  id           uuid primary key default gen_random_uuid(),
  player_id    uuid not null references public.players(id) on delete cascade,
  team_id      uuid not null,
  test_date    date not null,
  test_type    text not null,          -- see enum list below
  -- one primary result + its unit (keep it generic so every test fits)
  result_value numeric,                -- Yo-Yo: distance m · 30-15: VIFT km/h · beep: level.shuttle · MAS: km/h · line drill: seconds
  result_unit  text,                   -- 'm' | 'km/h' | 'level' | 's'
  -- optional structured extras (nullable, test-specific)
  stage        numeric,                -- beep level / IFT stage
  time_s       numeric,                -- timed tests
  distance_m   numeric,                -- when distance is a secondary field
  -- derived (computed on entry or by a trigger/lib; nullable)
  mas_kmh      numeric,                -- estimated MAS (km/h) where derivable
  vo2max_est   numeric,                -- estimated VO2max where derivable
  source       text not null default 'manual',
  notes        text,
  created_at   timestamptz not null default now(),
  unique (player_id, test_date, test_type, source)
);
```

RLS: **mirror `player_load_peak_period` exactly** (coach-read-team + player-select-own) — the
policies are already written there; copy them. SELECT-only policies; writes via service role / the
API route (below).

`test_type` starter enum (validate in the API, not a DB enum, so it stays extensible):
`yo_yo_ir1`, `yo_yo_ir2`, `ift_30_15`, `msft_beep`, `mas_vameval`, `mas_run_4min`, `line_drill`,
`suicide_17s`, `sprint_max` (MSS for ASR).

**Migrate the existing 4-min data:** copy `player_running_test` rows into `player_fitness_test` as
`test_type='mas_run_4min'` (`result_value = distance_m`, `result_unit='m'`), then either drop
`player_running_test` or leave it as a deprecated view. Update the CS brief's data source accordingly.

## How each test's output maps (for the entry form's hints + derived fields)

| Test | `result_value` (unit) | Derived |
|---|---|---|
| Yo-Yo IR1 / IR2 | total distance (m) | VO₂max est. (Bangsbo regression) |
| 30-15 IFT | VIFT (km/h) | MAS ≈ VIFT-linked; HIIT % of VIFT |
| Beep / MSFT | level.shuttle | VO₂max + MAS (Léger) |
| VAMEVAL / UMTT | MAS (km/h) | — (MAS is the result) |
| 4-min max run | distance (m) | MAS = distance/4 → km/h |
| Line drill / 17s | time (s) | — |
| Max sprint | MSS (km/h) | ASR = MSS − MAS |

Put the derivation formulas in a pure lib `src/lib/micropulse/load/fitnessTests.ts` (per test_type →
optional `{ masKmh?, vo2maxEst? }`), unit-tested. Keep it honest: only fill a derived field when the
test actually supports that estimate; otherwise null.

## What to build

1. **Migration** `player_fitness_test` (+ RLS) and the `player_running_test` → `player_fitness_test`
   data copy. Save the SQL under `supabase/migrations/` (per repo convention).
2. **API** `src/app/api/coach/fitness-test/route.ts` — `POST` (create/upsert a result, coach-auth,
   team-scoped, validate `test_type`), `GET ?player=<uuid>` (a player's test history). Mirror the auth
   pattern in `api/coach/load/peak-period/route.ts`.
3. **Entry UI** — a small "Log fitness test" form on the player/Load page: pick test_type → the form
   shows the right field + unit hint from the table above → save. Bilingual (EN default, IS toggle).
4. **Display** — a "Fitness tests" history block/card per player (latest + trend per test_type), on the
   Load Intelligence / player page.

## How it feeds the rest of the system

- **CS/D′** (`criticalSpeed.ts`, in build): consume `mas_run_4min` (and any MAS-yielding test) as the
  maximal aerobic anchor — replaces the `player_running_test` read once migrated.
- **Load targets / HIIT:** expose `mas_kmh` and `ift_30_15` VIFT so running load and intervals can be
  prescribed as **% of the player's own MAS/VIFT** rather than a squad-wide speed.
- **ASR:** `sprint_max` (MSS) − MAS = Anaerobic Speed Reserve, per the `research/Anaerobic Power
  Reserve` folder.

## Guardrails

- **Descriptive only.** Fitness-test values never feed the readiness colour or the daily decision — they
  feed training/load prescription. Same rule as the power curve.
- **Never fabricate a derived value** (MAS/VO₂max) for a test that doesn't support it → null.
- **Don't fragment storage** — one `player_fitness_test` table; the 4-min run is a `test_type`, not its
  own table long-term.

## Verify

1. `npx tsc --noEmit` + `npx eslint` clean on the lib, route, and UI.
2. Unit tests for `fitnessTests.ts` derivations (4-min → MAS km/h; beep level → VO₂max; ASR = MSS−MAS).
3. Round-trip: POST a Yo-Yo IR1 and a 30-15 IFT result, GET them back, confirm derived fields.
4. Confirm the 4-min `player_running_test` rows appear in `player_fitness_test` after the copy.

## Reference

Test protocols, outputs and citations: `Greinar/Tholpróf-fótbolti-korfubolti-yfirlit.md`.
Existing seed: `supabase/migrations/20260817140000_player_running_test.sql` (the 4-min MAS run).
