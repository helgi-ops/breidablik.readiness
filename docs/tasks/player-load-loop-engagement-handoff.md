# Handoff — Player "load loop" engagement (close the anticipation → resolution loop)

For Claude Code. Paste, or `@docs/tasks/player-load-loop-engagement-handoff.md`.

## Background / intent
We're making the Player app a healthy daily habit (not a manipulative "addiction"). The strongest
lever is the anticipation → resolution loop: a **morning** "here's what today looks like for you"
(anticipation) and an **evening** "here's how it actually went vs plan + one insight" (resolution).
Two touchpoints a day give a reason to return, without dark patterns.

Hard framing rules (do not violate — this is a health product, some users are minors):
- **Never gamify load as a score to maximise.** No "beat your distance" leaderboard, no streak that
  rewards higher load. Frame engagement around plan-adherence, readiness, and personal insight —
  "you followed the day well", "smartest day this week" — never "you topped your load".
- **Explainability-first.** Every number labelled (estimate vs measurement), shows its "why",
  carries provenance. AI (if used for a line of copy) is labelled AI and cites the signals.
- **Wellbeing over engagement.** If a choice trades player health/anxiety for stickiness, don't.

## What already exists (do NOT rebuild — reuse)
- **Morning estimate (built, good):** `GET /api/player/today-load`
  (`src/app/api/player/today-load/route.ts`). Reuses `buildLoadPlanForTeam`
  (`src/lib/micropulse/loadPlan/forTeam.ts`) so the player's outlook can never disagree with the
  coach plan. Returns effort `band`, `durationMin`, `loadType`, `matchPct`, plain `rationaleEN/IS`,
  `personalTarget`, and **eases the personal target when the player's own check-in is yellow/red**
  (`eased`, `flag`, `flagReason`). Self-hides (`{show:false}`) on off-days/no-MD/errors.
- **Planned-vs-actual engine (built):** `src/lib/micropulse/loadPlan/plannedVsActual.ts` (coach
  side). Reuse this for the evening comparison — do not write a new one.
- **Personal records engine (built):** the PB/records lib + endpoint (tasks #28–29) for the
  "one insight / small win" line.
- **Canonical color:** `v_coach_readiness_today_v8.final_color` (per repo CLAUDE.md).
- **Push infra (built):** `src/lib/notifications/sendTrainingDataReady.ts`, the pt-cron route, and
  `player_push_*` subscriptions — reuse for touchpoint notifications.

## Task A — the evening "close the loop" touchpoint (the main gap)
A player-facing card + endpoint that fires after the session's load lands, showing **predicted vs
actual** for today plus **one** positive, honest insight.
- `GET /api/player/today-recap` (`nodejs`, self-scoped like today-load): returns
  `{ show, plannedTarget, actual, adherencePct, verdict, insight, insightKind }` where
  - `plannedTarget` = the same personal target the morning card showed (from the load plan, readiness-eased).
  - `actual` = the player's own `player_external_load_daily` for today (source catapult), **excluding
    estimated rows** (`raw_payload_json->>'estimated' is distinct from 'true'`).
  - `verdict` = plan-adherence framing, NOT maximise: e.g. "on plan", "eased (your check-in was
    yellow)", "lighter than planned", "big day — recover well". Use `plannedVsActual.ts`.
  - `insight` = one line from the PB/records engine OR a movement note (e.g. "your best high-speed
    day in 3 weeks", "smart, controlled session"). Label AI copy as AI if generated.
  - `show:false` when there's no actual yet, off-day, or error (never nag).
- Component `PlayerTodayRecapCard.tsx` mounted on the player Today/home, appearing only once actual
  data exists. Layered read: verdict first (1 line) → planned vs actual (2 numbers) → "details" toggle.
- **Guardrail:** if `actual` >> `plannedTarget`, DO NOT celebrate "you smashed it" — surface a gentle
  "bigger than planned — prioritise recovery" (ties to the readiness/recovery messaging). Overshooting
  load is not a win.

## Task B — audit the morning card's framing (quick)
Confirm the existing morning outlook (and wherever `today-load` renders) presents the target as an
**outlook/estimate**, not a command or a number to beat: label it (e.g. "today's outlook" / "áætlað
álag í dag"), keep the plain `rationale` visible (not behind a click), and ensure no copy implies
"hit this number or else". The readiness-easing is already correct — keep it and surface *why* it was
eased when it is. No leaderboard, no per-player load ranking.

## Task C — the two-touchpoint cadence (optional, opt-in, gentle)
Wire a **morning** outlook nudge and an **evening** recap nudge via the existing push infra, opt-in
only, respecting team breaks / vacations (reuse `getTeamsOnBreak`, client_breaks). Copy is warm and
low-pressure — no FOMO, no guilt, no "you broke your streak". One tap to open; easy to turn off.
Skip on off-days. This is where the loop becomes a habit — but it must feel like a helpful teammate,
not a slot machine.

## Principles checklist (run before shipping — from the manifesto)
1. Does each surfaced number carry provenance (estimate vs measured, source)?
2. Can the player get the verdict at a glance and the plain "why" without a click?
3. Does it answer "why", not just "what"?
4. Is any AI copy labelled AI and grounded in real data?
5. Does the framing protect the athlete (readiness/plan-adherence), never reward maximising load?
If any is "no", it's not ready.

## Files (suggested)
- `src/app/api/player/today-recap/route.ts` (Task A)
- `src/components/player/PlayerTodayRecapCard.tsx` + mount in the player Today/home
- reuse `src/lib/micropulse/loadPlan/plannedVsActual.ts`, the PB/records lib, `sendTrainingDataReady.ts`
- copy in `src/app/player/playerCopy.ts` (bilingual EN default + IS — English-first per repo)

## Acceptance criteria
- Morning outlook + evening recap form one loop: the recap shows the SAME planned target the morning
  card showed, vs the player's real actual, with a plan-adherence verdict and one honest insight.
- No surface rewards higher load; overshoot triggers a recovery nudge, not a celebration.
- Everything self-hides gracefully (off-days, no data, errors) and never blocks Today.
- Estimated load rows excluded from the "actual"; canonical color used for easing.
- Bilingual (EN default, IS toggle), jargon behind tooltips.
- `npx tsc --noEmit` + `npx eslint` clean on touched files; stage specific files (no `git add -A`).
