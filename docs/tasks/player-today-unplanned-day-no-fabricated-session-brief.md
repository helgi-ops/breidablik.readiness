# Claude Code brief — player Today must not fabricate a session (or MD-3) on an unplanned / OFF day

## Bug (confirmed live, with DB evidence)
A player (Arnór Tristan, Breiðablik) opened Today on **2026-10-08** and saw:
- hero "**Lighter day** — training with a controlled load is recommended", chip "**MD-3 · 3 to match**",
- a "Today's session · **DEFAULT STRENGTH SESSION**" with real exercises,

…on a day that is actually a **rest day / no training**.

Root cause — a single default cascades:
- `week_plans` has **zero rows** for this team this whole week (verified: empty 2026-10-04…10-12). No week
  was set up.
- `v_player_daily_decision_v3` (→ `v_player_session_today_v2`) therefore has **zero rows** for the team
  today, and there is **no check-in / readiness_entry** for the player today.
- `src/app/api/player/today-strength-default/route.ts` (~line 51:
  `mdContextOverride: null, // auto MD from week_plans (defaults to MD-3)`) — with no `week_plans` row, the
  engine's MD context **defaults to MD-3**, a training day, so it returns a full default strength session.
- The same MD-3 default drives the "MD-3 · 3 to match" chip and the "controlled load" hero.
- The OFF guard in `PlayerClient.tsx` (`isOffDay = sessionMdDay === "OFF"`, ~line 4731) reads
  `planned_day_type`, which only exists when a `week_plans` row says `OFF`. With no row, `isOffDay` is false,
  so nothing suppresses the fabricated session.

Net: the app **cannot distinguish "rest day" from "no plan"**, and on "no plan" it fabricates an MD-3
training day. This violates explainability-first (presenting fabricated content as a real plan/verdict).

## Principle
**No planned day ⇒ no fabricated session and no confident MD/verdict hero.** A default strength session is
only legitimate when there is positive evidence of a *training* day for today: a `week_plans` row whose
`day_type` is a training day, a coach-sent plan, a custom-programme override, or a resolved microdose. An
absent `week_plans` row and an explicit `day_type='OFF'` must behave the same way: show a neutral
"no session / rest" state. (The existing match-day handling already does this kind of suppression — see
`isMatchDay` at ~line 6502 — mirror it for OFF/unplanned.)

## Fix 1 — `today-strength-default` must not assume MD-3 when the week isn't planned
`src/app/api/player/today-strength-default/route.ts`:
- Before building anything, look up today's `week_plans` row for the player's team
  (`team_id` + `day_date = day`). If **no row exists**, return `{ ok: false, reason: "no_planned_day" }` —
  do **not** fall back to MD-3.
- If a row exists and its `day_type` is an OFF/rest type, keep today's behaviour (engine returns null →
  `{ ok: false }`); optionally pass `reason: "off_day"`.
- Only when the row is a *training* day (or an explicit `mdContextOverride` is supplied) proceed to build the
  default session, MD-tuned as today. Do not change the engine's existing OFF/MD+2/MD+3-rest null behaviour.

## Fix 2 — client: show a neutral "no session planned" state instead of fabricating
`src/app/player/PlayerClient.tsx`:
- In `fetchStage4Plan`, gate the default-strength call (~line 5436) so it is **not** called when there is no
  planned training day: i.e. skip it when there's no session context (`srow`/`session` null) AND no
  coach-sent plan / custom override / resolved microdose for today. (If the endpoint still returns
  `no_planned_day`/`off_day`, treat it as "no session".)
- Replace the two fabricating fallbacks for this case:
  - the `RUN_SESSION_FALLBACK` branch (~5483) and the "last-resort GREEN" branch (~5504) must **not** invent
    a training plan when the day is unplanned/OFF. Instead set a dedicated state (e.g. `planDayType = "OFF"` /
    `"UNPLANNED"`) that the Today view renders as a rest card.
- Add an explicit `isOffDay` path that also fires when the day is unplanned (no `week_plans` row), not only
  when `planned_day_type === "OFF"`.

## Fix 3 — hero + MD chip suppression on OFF/unplanned (mirror match-day)
`src/app/player/PlayerClient.tsx` (~line 6498-6506): today `isMatchDay` suppresses the training-decision
hero so it doesn't contradict the day. Do the same when the day is OFF/unplanned:
- suppress the "controlled load / Lighter day" training hero and the "MD-x · N to match" chip (the chip is
  only meaningful relative to a planned week);
- render a neutral card instead. Copy (both langs; adjust to house voice):
  - EN title "No session planned" · body "Rest day — no training is scheduled for today. Check with your
    coach if you expected a session."
  - IS title "Engin æfing skipulögð" · body "Frídagur — engin æfing er á dagskrá í dag. Hafðu samband við
    þjálfara ef þú áttir von á æfingu."
- A genuine coach-marked OFF day can use "Rest day / Frídagur"; a simply-unplanned day can use the same copy
  (don't expose "unplanned" as jargon to the player).

## Guardrails / tests
- **No fabrication test:** team with no `week_plans` row for today + no check-in + no coach-sent/override →
  `today-strength-default` returns `no_planned_day`; Today shows the rest/no-session card; **no** MD chip,
  **no** "controlled load" hero, **no** exercise list.
- Explicit OFF: `week_plans.day_type='OFF'` → same rest card (regression: OFF already worked when planned).
- Training day, no template (Lite): `week_plans` training row, no team template → default session still
  builds as today (don't regress the Lite default-session feature).
- Coach-sent / custom override / resolved microdose on an otherwise unplanned day → still shown (override
  precedence unchanged per `docs/session-delivery-model.md`).
- Match day unchanged.
- **Boundary:** none of this touches `readiness_entries.color` / `v_coach_readiness_today_v8`.
- `npx eslint src/app/player/PlayerClient.tsx src/app/api/player/today-strength-default/route.ts` —
  lint-clean; typecheck passes.

## Note for the owner (immediate, no code)
For the pilot right now: run **Week Setup** for this week and mark the days (incl. today = OFF). That writes
`week_plans` rows, the OFF guard fires, and Today renders correctly without waiting for this fix — so players
doing check-ins during the pilot don't see a fabricated session.
