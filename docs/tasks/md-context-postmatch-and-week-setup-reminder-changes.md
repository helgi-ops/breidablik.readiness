# Change summary — MD context (post-match) + week-setup reminder + auto-send time

Status: **implemented directly in the repo** (not a to-do brief). Files are on disk; review the git
diff and commit a checkpoint. Verified: eslint clean on all changed files; MD mapping simulated across
a normal week, a congested week, and the "coach forgot" case. `vitest` was not run (the sandbox can't
run it — architecture binding); a coach should run the suite once.

## Why

The strength page showed **MD-3** the day after a match. Root cause: `fetchMdContext` only looked
FORWARD to the next game (`week_plans.day_date >= today`) and had **no MD+1/MD+2/MD+3 branch**, so with
the week unset it silently fell back to a hardcoded `MD-3`. Also the auto-send ran at 06:00, giving a
coach who forgot no time to react.

## What changed

### 1. Auto-send moved 06:00 → 09:00 — `vercel.json`

`{ "path": "/api/strength/auto-send", "schedule": "0 6 * * *" }` → `"0 9 * * *"`.
Iceland runs on UTC, so this is 09:00 local. Gives the coach the morning to set the week.

### 2. `fetchMdContext` is now post-match aware — `src/lib/micropulse/playerContext/domains.ts`

- Reads games from **both** the fixture list (`match_schedule`) **and** the training week
  (`week_plans.day_type = 'GAME'`), over a −3…+5 day window.
- Using `match_schedule` means MD context still resolves **when the coach forgot to set this week's
  training days**.
- Looks **back** as well as forward, so the day(s) after a game resolve to **MD+1 / MD+2 / MD+3**.
- Priority: day after a game is always recovery (**MD+1**) → then the countdown to the next game
  (MD-4…MD-1) → then extended recovery (MD+2 / MD+3). Matchday → OFF. Nothing scheduled → MD-3.
- The engine already supports MD+1/MD+2/MD+3, so returned values flow straight through.

Verified mapping:

| Normal week | Mon | Tue | Wed | Thu | Fri | Sat | Sun (game) |
|---|---|---|---|---|---|---|---|
| | MD+1 | MD+2 | MD-4 | MD-3 | MD-2 | MD-1 | OFF |

Congested (game Sat, next Wed): Sun **MD+1**, Mon MD-2, Tue MD-1, Wed OFF.
Coach forgot the week but the fixture has yesterday's game → **MD+1**. Nothing scheduled anywhere → MD-3.
(The normal-week forward mapping, incl. Wed = MD-4, is unchanged.)

### 3. New "week not set up" reminder — `src/lib/notifications/weekSetupReminder.ts`

- Runs in the morning outlook cron window (~08:00), **before** the 09:00 auto-send.
- For every team with `strength_auto_send = true`: if there is **no `week_plans` row for today**, push
  a reminder to the team's coaches (role-tagged `profiles` ∪ `coach_teams`, via
  `coach_push_subscriptions`) linking to `/coach/week-setup`.
- Message adapts: fixture found → "MD is guessed from the fixture until you set the week"; no fixture →
  "set the week so the sessions are correct". (Icelandic copy.)
- Deduped per (coach, `week_setup`, today) in `coach_notification_log`.
- Wired in `src/app/api/notifications/cron/route.ts` (import + call in the `daily_outlook` slot +
  `weekSetup` in the response JSON).

No DB migration — reuses `teams`, `week_plans`, `match_schedule`, `coach_push_subscriptions`,
`coach_notification_log`, `profiles`, `coach_teams`.

## Notes / follow-ups

- The reminder needs the coach to have an **active push subscription** (browser/app notifications
  enabled). No subscription → no push.
- Reminder copy is Icelandic only; bilingual EN/IS is a small follow-up.
- The per-player Context toggle on the strength page still resets to Auto on reload (ephemeral) — but
  Auto is now correct, so the day after a game it shows MD+1 by itself. Persisting a manual override is
  a separate change if wanted.
- Suggested test (not yet added): `fetchMdContext` returns MD+1 with a fixture yesterday and no
  week_plans; `runWeekSetupReminder` sends when today's plan is missing and skips when present.

## Files touched

- `vercel.json`
- `src/lib/micropulse/playerContext/domains.ts`
- `src/lib/notifications/weekSetupReminder.ts` (new)
- `src/app/api/notifications/cron/route.ts`
