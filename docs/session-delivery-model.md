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
   per `(player_id, entry_date)`, locked ("sent = seen"), no readiness re-adjust. **This is the layer
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

Shared writer: `persistTodayStrengthOverride` (`src/lib/micropulse/strengthProgramming/persistTodayOverride.ts`),
which now takes an `origin`. The block route upserts inline but with the same columns/conflict key.

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
