# Code brief — Coach weekly strength-plan upload (pick lifting days) — ready to paste

## Why this exists
Njarðvík W's S&C coach plans the week himself — "they lift Mon / Wed / Sun" — and that plan has to live in
the system so each player sees the right session on Today. Right now the only way to do that is the manual
fan-out we did by hand (14 players × 3 dated rows into `player_today_strength_override`). This brief turns
that into a repeatable coach tool: **upload/build one weekly strength plan, choose which weekdays the team
lifts, and apply it to a chosen week** — the system fans it out to every active player, derives the MD
context from fixtures, and reads readiness/microcycle to adjust at delivery. The coach plans and owns the
rules; the system just reads and delivers them.

Not every club does this (most ride the periodised microdose), but because at least one does, it needs a
real surface instead of a one-off SQL insert.

## Non-negotiable boundaries (read `docs/session-delivery-model.md` + CLAUDE.md first)
1. **This is a coach *send* → it lands on layer 2 (`player_today_strength_override`, `source='coach_sent'`).**
   Do **not** add a sixth un-namespaced writer. Reuse the shared writer
   `persistTodayStrengthOverride` (`src/lib/micropulse/strengthProgramming/persistTodayOverride.ts`) with a
   **new `origin = 'weekly'`**. The existing five origins (`session`, `bulk`, `block`, `corrective`, `auto`)
   are untouched.
2. **Preview collisions before writing.** The apply action produces many dated rows across a week, so it must
   call `summarizeDeliveryConflicts` (`src/lib/micropulse/sessionDelivery/conflicts.ts`) /
   `GET /api/coach/player/[id]/today-conflicts` and surface what it replaces (other overrides on those dates;
   per-player `custom_template_sets` windows it supersedes). Honest success message: "replaced N, supersedes
   M custom programmes."
3. **Never writes the readiness colour.** The weekly plan is descriptive coach programming. It feeds the Today
   session card only. `readiness_entries.color` / `v_coach_readiness_today_v8.final_color` are untouched.
   `estimated` is irrelevant here (coach-authored real plan, not imputed).
4. **Readiness/microcycle-aware at delivery, coach-owned in authoring.** The coach sets the plan and the
   lifting days; the system reads readiness to apply the existing `readinessDowngrade` logic from
   `strengthProgramming/structures.ts` (yellow/red → scaled version) when the session is shown, exactly as
   other sent strength sessions already do. Do not invent a second downgrade path.
5. **Power before strength** in any session the tool builds or displays — honour the existing
   `æfingauppsetning` convention (power/explosive blocks first, then strength) already encoded in the
   structure builders.

## Data model
Add one table to store the reusable weekly plan (the *template*), separate from the dated delivery rows:

```sql
-- supabase/migrations/<timestamp>_team_weekly_strength_plan.sql
create table if not exists team_weekly_strength_plan (
  id            uuid primary key default gen_random_uuid(),
  team_id       uuid not null references teams(id) on delete cascade,
  name          text not null default 'Weekly strength plan',
  -- which weekdays the team lifts: ISO 1=Mon … 7=Sun
  lift_days     int[] not null,
  -- one session structure per lift day, keyed by weekday:
  -- { "1": {title, description, structure(jsonb[]), summary, duration_min}, "3": {...}, "7": {...} }
  day_sessions  jsonb not null default '{}'::jsonb,
  is_active     boolean not null default true,
  created_by    uuid references auth.users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create unique index if not exists team_weekly_strength_plan_active_uniq
  on team_weekly_strength_plan(team_id) where is_active;
```

- **`lift_days`** = the coach's day picker (e.g. `{1,3,7}` for Mon/Wed/Sun).
- **`day_sessions`** = the session for each chosen day, in the **same shape** the override table already
  stores (`structure` = array of `{block, items:[{name, sets, reps, rest, method, exerciseId?, note?,
  alternatives?}], prescription?}`, plus `title`, `description`, `summary`, `duration_min`). Reuse the exact
  format `persistTodayStrengthOverride` expects — no new structure dialect.
- One active plan per team (partial unique index). Editing overwrites the active plan; applying it to a week
  is a separate action (below), so the stored template and the dated deliveries stay decoupled — same
  decoupling as `player_training_programmes` vs the Today card.

**Migration rule (CLAUDE.md):** apply via `mcp__supabase__apply_migration` AND save the `.sql` under
`supabase/migrations/` with a timestamp prefix.

## API
Three routes, all admin-aware (reuse the canonical admin gate), all team-scoped:

1. `GET /api/coach/team/weekly-strength-plan` → the active plan for the coach's team (or `null`).
2. `PUT /api/coach/team/weekly-strength-plan` → upsert the active plan: `{ name, lift_days, day_sessions }`.
   Validate: `lift_days` ⊆ 1..7 and non-empty; every day in `lift_days` has a `day_sessions[day]` with a
   non-empty `structure`; structure items validate against the existing session schema (reuse the validator
   the send-session route uses — do not hand-roll).
3. `POST /api/coach/team/weekly-strength-plan/apply` → `{ week_start (Monday, ISO date), dryRun?: boolean }`.
   - Resolve the active plan. For each `day ∈ lift_days`, compute `entry_date = week_start + (day-1)`.
   - For each `entry_date`, derive **MD context** from the team's fixtures using the **existing** MD-day
     helper (the same one Today uses — do not add a competing fixture reader). Store it in
     `md_context` (e.g. `MD-4`, `MD+1`, `MD-2`) so the card reads honestly. If no fixture is near, store a
     neutral label (e.g. `TRAIN`) rather than a fabricated MD number.
   - Fan out to **all active players** on the team (`players.is_active`) into
     `player_today_strength_override` via `persistTodayStrengthOverride({ origin: 'weekly', source:
     'coach_sent' })`, one row per `(player_id, entry_date)`.
   - **Before writing**, run `summarizeDeliveryConflicts` over the target dates for the roster and return the
     summary. When `dryRun: true`, return only the conflict summary + the computed date→MD→session mapping
     and write nothing. When `dryRun: false`, write and return `{ written, replaced, supersedesCustom }`.
   - Idempotent: re-applying the same week overwrites its own `origin='weekly'` rows (last-write-wins on the
     `(player_id, entry_date)` conflict key) rather than duplicating.

## Coach UI
On the existing **Strength Training** hub (the "operate" surface, not Programme Library), add a
**"Weekly plan"** panel:

- **Day picker** — Mon–Sun toggles → `lift_days`. The spine of the feature: the coach picks which days the
  team lifts.
- **Per selected day, a session** — either (a) pick an existing session from the Programme Library / method
  schemes (reuse the structure builders in `strengthProgramming/structures.ts` + `structureHowTo.ts`), or
  (b) **upload** a structured plan. For upload, accept the same xlsx shape the coach already uses (the
  "VIKA 14"-style sheet: blocks, exercise, sets, reps, rest, method) and parse it into the stored
  `structure` format. Keep the parser tolerant (blank cells → omitted, never 0) and show the parsed result
  for confirmation before save — never silently mis-map an exercise.
- **"Apply to week"** — a Monday week-start picker → calls `apply` with `dryRun:true` first, shows the
  **preview**: each lift day with its derived MD context and session title, plus the conflict summary ("this
  will replace 2 sent sessions and supersede 1 custom programme this week"). The coach confirms → `apply`
  with `dryRun:false`.
- Bilingual labels (EN default, IS toggle), no sport-science jargon in the primary view — methods/jargon
  behind the existing tooltips/"Show details" pattern (explainability-first).

## What the player sees
Nothing new structurally — on each lift day the session appears in "Æfing dagsins" exactly as the manually
sent Njarðvík W sessions do now, because it lands on the same override layer. Non-lift days fall through to
the normal layers (microdose / rest), so a weekday the coach did **not** pick does **not** get a fabricated
strength session (ties into the `player-today-unplanned-day` guard).

## Guardrails / tests
- **Delivery-layer test:** applying a plan with `lift_days={1,3,7}` for a given Monday writes exactly
  `|active players| × 3` rows, all `origin='weekly'`, `source='coach_sent'`, one per `(player_id, entry_date)`;
  the two unpicked-vs-picked weekdays resolve correctly; re-applying the same week overwrites, not duplicates.
- **Conflict preview test:** when a `block`/`session` override already exists on a target date, the dry-run
  returns it in the summary and the success message counts it as `replaced`; an overlapping
  `custom_template_sets` window is reported as `supersedesCustom` (not silently clobbered).
- **MD derivation test:** `entry_date` with a fixture the next day → `MD-1`; day after a game → `MD+1`;
  no nearby fixture → neutral `TRAIN` label, never an invented MD number.
- **Readiness test:** a yellow/red player on a lift day gets the downgraded session via the existing
  `readinessDowngrade` path at display time; GREEN gets the authored session as-is.
- **Boundary test (mandatory):** applying/updating a weekly plan does **not** change any row in
  `readiness_entries` or the value of `v_coach_readiness_today_v8.final_color` for any player on any date.
  Assert the colour is byte-identical before and after an apply.
- **Upload parser test:** a VIKA-14-style xlsx parses into the stored `structure` shape with power blocks
  before strength blocks; malformed/blank cells → omitted, never 0; parsed result shown for confirmation.
- `npx eslint` on every changed file; typecheck; migration saved under `supabase/migrations/`.

## Out of scope (don't build now)
- No auto-apply cron (that's the existing `auto` origin's job; the weekly plan is coach-triggered per week).
- No change to the periodised microdose or Custom Programmes — the weekly plan simply wins over them on the
  days it covers, same as any other coach send (document this in the success message, don't change layer 3).
- No new readiness logic, no new MD/fixture reader, no new structure dialect — reuse all three.
