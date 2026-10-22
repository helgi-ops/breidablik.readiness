# Code brief — player app shows NO strength workout, though the plan exists

## Symptom

A player finishes their daily check-in and **no strength session appears in the app** ("kemur ekkert").
Confirmed live on **Anton Ari Einarsson** (Breiðablik men). Signing out/in and refreshing did **not**
fix it. Not a one-off — recurring.

## This is a player-app resolution/display bug, NOT missing data

Every backend layer HAS the plan for Anton today. Verified 2026-08-20 (service role):

- Player: `bbb32297-5df1-4dc2-b4aa-0cbc66d6bfa0`, active, team Breiðablik `94b52a06-...`, **single record**
  (no duplicate), user `anton.ari25@gmail.com` (last fresh sign-in 2026-03-21 — old persistent session).
- **`v_player_today_microdose_final`** (the view PlayerClient reads) for `entry_date = 2026-08-20`:
  `readiness_level = GREEN`, `md_day = MD-4`, `plan_title = "🟢 MD-4 — Lower Body Contrast"`,
  `is_locked = true`, **`plan_structure` = 3 blocks (has content)**.
- `player_microdose_plan_locks`: 168 rows, latest dated **2026-08-20**, `readiness_level = GREEN`.
- `v_player_session_today_v2` for today: `md_day_resolved = TRAIN` (**not OFF**).
- `v_player_today_microdose_resolved_v2` for today: **NULL** (the legacy resolved path is empty — expected;
  the app was already re-pointed to `_final`).

## Ruled out (don't chase these)

- **Duplicate identity** — Anton has ONE active record; his check-in + plan are on it. (NB: a *different*
  player, Arnór Tristan, DOES have a duplicate-identity bug — check-in lands on his inactive Breiðablik
  record while his active Helgi-team record stays empty. That is a **separate** issue; don't conflate.)
- **OFF-day branch** — today is TRAIN for him.
- **`pt_plan_visibility`** — read only by the PT/client flow (`api/client/programme`), NOT by the
  football PlayerClient. All Breiðablik players are `visible = null` and it doesn't gate them.
- **Stale client bundle** — sign-out/in + refresh did not fix it.
- **Missing data** — the plan is present at every layer above.

## Where it breaks (investigate)

`src/app/player/PlayerClient.tsx` (~L4358–4413) reads:

```ts
const { data: finalRow } = await supabase
  .from("v_player_today_microdose_final")
  .select("... md_day, plan_title, plan_structure, is_locked ...")
  .eq("player_id", playerId)
  .eq("entry_date", safeDay)     // ← prime suspect
  .maybeSingle();
```

Since `_final` HAS the row for `2026-08-20`, the only ways the player sees nothing are:

1. **`safeDay` ≠ the plan's `entry_date` (top suspect).** `safeDay = sanitizeDay(day)`. If the app's
   notion of "today" resolves to a different date than the plan (timezone — UTC vs Iceland local; or a
   stale locked "day"/week-context on an old session), the `.eq("entry_date", safeDay)` misses and
   `finalRow` is null → blank. **Instrument `safeDay` and `day` for the affected player and compare to
   `current_date` (Atlantic/Reykjavík).** Make "today" timezone-safe and independent of any stale
   session day.
2. **The override branch above the `_final` read** (stage4 / `player_today_strength_override`, ~L4340–4356)
   throws or short-circuits and the catch swallows it, leaving nothing rendered. Verify the fall-through
   actually reaches the `_final` read and renders it.
3. **A downstream render gate** drops `resolved` even when non-null. Trace from `resolved` → the Today
   strength card render.

Add temporary logging of: `safeDay`, `playerId`, `finalRow` (present?), the branch taken, and the final
rendered plan — reproduce as an affected player.

## Secondary bug (real, fix too)

The locked plan is **GREEN / MD-4** but Anton's **check-in today was YELLOW / REDUCED** (08:42). The lock
did not refresh after the yellow check-in → even once display is fixed he'd see a green full plan instead
of a reduced one. **On a new/changed check-in, re-resolve or invalidate the locked plan so the plan
matches the current readiness.**

## Fix + guardrails

- Make the player "today" date timezone-safe (Iceland local) and not dependent on a stale session/week
  day; ensure the `_final` read uses the same date the plan is written under.
- Re-resolve/invalidate the lock when readiness changes so the shown plan matches the check-in.
- **Never render a silent blank when `_final` returns a row** — if a plan exists but can't be shown,
  surface a diagnostic/fallback (and log), so this class of failure is visible, not invisible.
- Descriptive/plan flow only — do not touch the readiness colour or the daily verdict.

## Verification

1. Reproduce as Anton (or seed a player with a yellow check-in + a locked plan today) — confirm the
   strength session renders.
2. A YELLOW check-in yields a REDUCED plan, not the stale GREEN one.
3. Cross-timezone: a device an hour off UTC still resolves the correct local "today" and shows the plan.
4. Unit/e2e test for the date-resolution + lock-refresh so it can't regress.

## Immediate workaround (coach-side, today)

Coach can use **"Send strength session"** (`api/coach/player/[id]/send-strength-session`) for Anton — it
writes `player_today_strength_override`, which PlayerClient reads FIRST (before `_final`), so the player
gets today's session while the root cause is fixed.
