# Session delivery model — what a player sees on Today, and who wins

This is the operational map of how the player's **Today session** ("Æfing dagsins") is resolved, so new
coach features don't quietly add a competing writer. It is the companion to the canonical-verdict rule
in [CLAUDE.md](../CLAUDE.md): one Today session, resolved in one place, with a documented precedence.

The resolver is `fetchStage4Plan` in `src/app/player/PlayerClient.tsx` (~line 4529). Higher layers win.

## The layers (highest wins)

1. **Coach-sent daily *template*** — `player_template_assignments` → `workout_templates`. If present for
   today, it becomes the Æfing dagsins card and suppresses the whole strength card below.
   (`PlayerClient.tsx:6331`, `:7286`.)
2. **Coach-sent strength override** — `player_today_strength_override` (`source = 'coach_sent'`), one row
   per `(player_id, entry_date)`, locked ("sent = seen"; one exception for `origin = 'auto'`, below), no
   readiness re-adjust on the player's side. **This is the layer
   every explicit coach *send* lands on.** Five entry points write it (see below); the new `origin`
   column records which one, so a surface can name what's on a date.
3. **Periodised team microdose** — view `v_player_today_microdose_final` re-resolved from the team's
   template table, filtered by `team_id + md_day + readiness_level + season_phase`. **This is the
   "Today's session" auto layer — good for pre-season / in-season.** It is customised by:
   - **Custom Programmes** (a.k.a. custom microdose templates): a team-level custom table swaps the
     default `microdose_templates`; a **per-player** `custom_template_sets` row swaps it for one player
     over a **date range** when today's MD-day is in the set's `md_days` (`PlayerClient.tsx:4688-4724`).
4. Legacy `microdose_decisions` → assigned `workout_templates` → `v_player_session_today_v2` fallbacks.
5. **Engine default** (`GET /api/player/today-strength-default`) — display-only, persists nothing.

**Programme table names stay within 63 characters.** Postgres cuts longer identifiers without an error while PostgREST
answers 404, so every name goes through `fitTableName` (`src/lib/micropulse/templateAutoGenerate.ts`). The RPCs and a
check on `custom_template_sets` refuse anything longer. Tables must also carry `structure_en`, because the Today read
selects it. `create_custom_microdose_table` adds it when it runs, but tables it has not touched since 2026-11-09 can lack it.

**Daily plan locks are never a content source.** `player_microdose_plan_locks` (written on check-in by
`lock_player_microdose_plan`) records md_day + readiness, which `v_player_today_microdose_final` reads. Until
2026-11-09 it filled every club's lock with Breiðablik's session, and `fetchStage4Plan` showed that lock when the
team read found nothing (`FINAL_LOCK_FALLBACK`). Migration `20261109170000` keeps locks team-scoped (a guard
trigger empties any other team's content) and the app no longer reads `plan_*` from `_final`. When the team's
programme table misses or fails, the app reads the team's own `microdose_templates` rows instead
(`TEAM_DEFAULT_FALLBACK`, team-scoped, so only teams that own rows there get anything). Everyone else gets an
empty plan, then the engine default. The readiness re-resolve effect reads the same table the plan came from
(`template_table`: block, per-player override or recurring base) and falls back only to that table's GENERIC row.
`npm run audit:tenant` reports `DB_FOREIGN_PLAN_CONTENT` if a lock holds another team's session.

**Key consequence:** layer 2 (any coach send) always wins over layer 3 (Custom Programmes). So a
per-player Custom Programme is silently superseded on any date a session/block is sent. The send flows
therefore preview this (see below) instead of failing silently.

## The five writers of `player_today_strength_override` (layer 2)

All share `unique(player_id, entry_date)` and `source='coach_sent'`; last write wins. `origin` tags each:

| Route | `origin` | scope | guard |
|---|---|---|---|
| `POST /api/coach/player/[id]/send-strength-session` | `session` | 1 day | none |
| `POST /api/coach/team/send-strength-sessions` | `bulk` | 1 day, all players | none |
| `POST /api/coach/player/[id]/send-strength-block` | `block` | 12–16 dated rows | none (previews conflicts) |
| `POST /api/coach/movement-screen/corrective` | `corrective` | 1 day | none |
| `GET|POST /api/strength/auto-send` (cron) | `auto` | 1 day, opted-in teams | **skip-if-exists** |
| `POST /api/player/checkin` (rebuild) | `auto` (same row) | 1 day, that player | only an untouched `auto` row |

Shared writer: `persistTodayStrengthOverride` (`src/lib/micropulse/strengthProgramming/persistTodayOverride.ts`),
which now takes an `origin`. The block route upserts inline but with the same columns/conflict key.

## Readiness in a sent session (2026-11-18)

Every engine-built session (any origin) is built with today's **canonical colour** read from
`v_coach_readiness_today_v8.final_color` for that date (`fetchVerdict`, read only; an imputed row or no check-in =
a normal day). Until 2026-11-18 this read a column that never existed, so no sent session ever followed readiness.
Yellow = the method one step down only when that is really lighter (never more loaded reps, reps or exercises
than green; otherwise today's method) plus fewer sets; red = warm-up and mobility only (no upper-body lift).
`readiness_level` on the row records the colour the session was built with (provenance; nothing re-adjusts on it).

**The automatic session follows the check-in.** The 09:00 send runs before most check-ins. When the player checks
in, `refreshAutoSessionAfterCheckin` (`strengthProgramming/autoSession.ts`, the same builder as the cron) rebuilds
today's row **only if** its origin is `auto` and the player has not started it (no completion, set log or exercise
swap today). Same row, same origin, no push. Coach sends by hand stay locked. The player's banner says which:
"Your coach's plan … adjusted to your check-in today" / "… check in and it adjusts".

## Send log (2026-11-18)

`strength_send_log` (migration 20261118110000) records what the 09:00 auto-send did: one `team` row per team per day
(`sent`, or `not_sent` with `no_week_plan` / `off_day`) and one row per player (`sent`; `skipped` with
`already_sent` / `injured` / `no_session` / `standard_no_programme`; `failed` with a short error). A check-in rebuild
stamps `rebuilt_at` + the colour. Written only by the server (`strengthProgramming/sendLog.ts`, best effort, never
fails a send); a second run the same morning keeps the first run's rows. Read by `GET /api/coach/team/strength-send-log`
→ `StrengthSendStatus` under the send-mode picker on /coach/strength ("Sent to 21 players · 2 injured · 0 failed ·
09:00", failed players named, skipped + last 7 days behind "Show details"), and by the morning digest when yesterday
had a failed save. The week-not-set case is also pushed at ~08:00 by `weekSetupReminder.ts`. Descriptive only.

## Collision preview

`GET /api/coach/player/[id]/today-conflicts?dates=…` (admin-aware) returns, for a set of target dates:
existing overrides on those dates (with `origin`) and active per-player `custom_template_sets` windows
overlapping them. Pure summary logic: `src/lib/micropulse/sessionDelivery/conflicts.ts`
(`summarizeDeliveryConflicts`). The block-send panel calls it and warns before sending; the block route
returns `replaced` + `supersedesCustom` so the success message is honest.

## A separate, parallel artifact (NOT a Today source)

`player_training_programmes` ("Æfingavika") is the coach's MD-periodised **weekly planner**, written by
`POST /api/coach/training-programme/[playerId]` and read only by `PlayerTrainingWeek.tsx`. It never feeds
the Today card. Deliberate separation — it's a planning/overview surface, not a delivery mechanism.

## Rule for new features

Do not add a sixth un-namespaced writer to `player_today_strength_override`. A new coach send must:
set an `origin`, and check `today-conflicts` (or call `summarizeDeliveryConflicts`) so the coach sees what
it replaces. Never write the readiness colour from any of these — they are descriptive
(see CLAUDE.md "Canonical verdict source").

## "All the details" per lift on Today (lota 8, 2026-11-14)

Not a writer and not a source: a read-only view on whatever layer won. `buildSessionBlocks` (PlayerClient) keeps the
RAW items next to the parsed lines and calls `rxForTodayItem` (`strengthProgramming/todayLiftRx.ts`) for each one; the
row on the Today card and the ⓘ sheet in "Start session" show `LiftRxDetails` (player view: load, how hard, speed of
each rep, rest, bar-speed lines). The session's own numbers (rest, % of max, kg, RPE → reps left, a slow lowering in
seconds, the item's `vlCap`, the block's `vbt` card) always win; lota 7's lines for the lift's profile only fill an open
line, and only for heavy squat/deadlift, RDL, loaded jump squat, weightlifting pulls and the Nordic. Free-text
template lines get a table only for an exact library lift with sets × reps. Derived at render time, never stored.
The serializer adds one optional field, `vlCap` (speed-loss stop from `ExerciseDose.velocityLossCap`).

**Rest timer (2026-11-14):** the between-sets timer in "Start session" reads the RAW item's `rest`
(`ParsedExercise.restText` → `restSecondsFromText`, lower end of a range: "2-3 min" = 2:00). A contrast/complex step
uses the block's "between sets" rest, else the longest member rest. Then the rest written in the line's text, then
90 s as before. The player can still add +30 s.

**Coach view (2026-11-14):** the /coach/strength card (`PlayerStrengthSessionCard`) shows the same table under each
exercise via `rxForPrescribed` (the item shaped exactly as the send writes it, with the block's bar-speed card when
`blockTakesVbt`), in coach mode: every line with where it comes from. A test holds coach table = player table.

**PT plans (2026-11-15):** the same table in the PT plans, through `strengthProgramming/ptLiftRx.ts` (`rxForPtLift`).
Client: each row of the plan on the /client home card (`/api/client/today` now also sends the prescription's
`load_value`, `rpe_target`, `tempo` and `notes`; individual plans and Explosive Power rows). Trainer, coach mode with
sources: under each lift in the plan builder (live while editing) and in the plan overview (`ProgramOverviewModal`).
The plan's own numbers win: % / kg / RPE from the load fields or the notes ("80% 1RM", "VBT 0.65 m/s (cut 0.5525,
0.15)" → target and stop speed), the tempo code in plain words ("3010", "X0X0", "ISO 45s"), "controlled", rest in
seconds (0 = straight on, no line). A load of 0 is "not set"; a bar-speed load stays out because the client never gets
it (the assign route stores no velocity), so trainer view = client view (tested). Jumps, throws, sprints, planks and
plyo push-ups get no table. Not a Today source and not a writer.
