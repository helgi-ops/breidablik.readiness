# Claude Code task — Coach Adoption Assistant (a chat-bubble that nudges coaches on how well they're using MicroPulse)

Paste to Claude Code (or `@docs/tasks/coach-adoption-assistant-claude-code-brief.md`).

## What it is

A per-coach "are you getting the most out of MicroPulse?" assistant. It surfaces as a **chat
bubble / icon on the coach dashboard**. On a weekly cadence (or first login of the week) it reads the
coach's **own** usage against benchmarks and shows **one** plain-language nudge + one concrete next
step, tied where possible to outcomes. Rules decide which nudge fires; the AI only phrases it. Same
explainability manifesto as the rest of the app.

Goal: raise adoption (logins, breadth of use, check-in compliance) because those are exactly the
inputs the readiness verdict rests on — a coach who doesn't check in his squad or never opens Today
gets a weaker product, and today nothing tells him so.

## The data is ALREADY there — verified 2026-07-24 (no new instrumentation needed)

The key finding: page-level usage telemetry already exists and is populated. Do **not** build a new
event pipeline.

| Signal | Source (verified) | Notes |
|---|---|---|
| Login cadence + which pages the coach uses | **`usage_events`** | `event_type='page_view'`, `role='COACH'` — 1,277 rows, 10 coaches, 40 distinct `path`s over 2026-07-01→07-24. Columns: `occurred_at, user_id, team_id, role, path, event_type, feature, meta(jsonb)`. Real paths seen: `/coach`, `/coach/load-intelligence`, `/coach/week-setup`, `/coach/return-to-training`, `/coach/player-game-report`, `/coach/ima-intelligence`, `/coach/catapult-upload`, … |
| Check-in compliance (the input the whole verdict rests on) | `v_player_submission_compliance`, `readiness_entries` | % of squad checking in, and the trend |
| RPE compliance | `session_rpe_entries` / `player_session_rpe` | submissions vs squad |
| Upload / sync freshness | `integration_logs` | Pro = sync healthy; Lite = CSV upload cadence |
| Week set up | `coach_week_setup` | is the week configured |
| Match minutes entered | `match_player_minutes` | a required coach input |
| Engaging with decisions | `decision_override_log` | is the coach acting on / overriding verdicts |
| Who to score, and their teams | `coaches`, `team_coaches`, `coach_teams` | one adoption read per coach |
| Existing notification channel to REUSE | `coach_notifications` | surface the nudge here — do NOT build a new channel |
| Existing aggregate surface (superadmin) | `/coach/usage-analytics` page | same `usage_events` queries already power it — reuse the query patterns |

## The signals (per coach, rolling ~14–28 day window)

Compute these from the sources above:

1. **Login cadence** — days since last `usage_events` row for this `user_id`; sessions/week.
2. **Breadth of use** — distinct `path`s opened; is `/coach` (Today) opened most days; are ANY of the
   deeper `/coach/*-intelligence` pages ever opened; is `/coach/week-setup` hit ~weekly.
3. **Check-in compliance** — squad check-in %, and whether it's falling (e.g. 80% → 30%).
4. **RPE compliance** — same.
5. **Data freshness** — Catapult sync healthy / CSV uploaded recently (`integration_logs`).
6. **Inputs kept fed** — week setup present; match minutes entered after matches.
7. *(optional)* **Decision engagement** — any overrides / acting on verdicts.

## The utilisation tier

A per-coach read — e.g. **strong / partial / dormant** — derived from the signals with **explicit,
auditable threshold constants** (mirror the `dataQuality.ts` pattern: constants stated at the top with
a one-line comment, not magic numbers buried in a comparison). A brand-new coach with < ~2 weeks of
history returns **`insufficient` / low confidence**, never a low score.

## The nudges — rules decide, AI explains

Fire **only** when a real gap opens (a threshold breach), never as background noise. Examples (the
rule owns the trigger; keep the copy bilingual EN/IS):

- Dormant: *"You haven't opened MicroPulse in 6 days — the morning verdicts only help if you check
  them each day."*
- Compliance dropping: *"Check-ins are down to 30% (were 80%). The colour is running on low
  confidence — a start-of-day reminder is what drives it back up."* (our own data: a coach's reminder
  beats automated push — see the usage analysis.)
- Never used a key surface: *"You've never opened Load Intelligence — it's where overload shows up
  before it bites."*
- Input not fed: *"No week setup for this week — without it the system can't tell a match from a
  session."*

Each nudge carries: **the signal that fired**, **the why**, **a concrete next step** (deep-link into
the relevant page), and — the part the user specifically asked for — an **outcome tie-in**: *"clubs
that keep check-ins above 70% and open Today daily keep their verdict confidence high"* — **computed
from real usage × outcome (`usage_events` × compliance × injury/readiness history), NEVER invented.**
If the sample is too thin to support the claim, omit it and say confidence is low.

## Explainability (same five rules as every other surface)

- **Says why + cites the usage signal** it's based on.
- **Counterfactual:** *"if you kept check-ins above 70%, verdict confidence would rise from low to
  high."*
- **Confidence:** thin data (new club, few weeks) = low confidence, stated plainly — do NOT scold in
  week 1.
- **AI labels itself as AI** and only phrases what the rules decided; it invents no numbers.
- **Warm, not accusatory** — same tone as the RPE reminders. "help you get more out of it", never
  "you're doing it wrong". This is a coach, not a defendant.

## The surface

- A **chat-bubble / icon** on the coach dashboard shell (visible on `/coach`). Badge only when a real
  nudge exists — otherwise quiet.
- Click → the one message + the next step + a "how" deep-link into the relevant page. **Dismissable**,
  with a **snooze** (respect it — don't re-fire the same nudge for N days).
- Cadence: weekly, or on first login of the week. **At most one nudge at a time** — the single worst
  gap, worst-first.

## Where (build layout)

- **Pure scoring module** — e.g. `lib/micropulse/adoption/coachAdoption.ts`: reads the signals, applies
  the threshold constants, returns `{ tier, confidence, topNudge | null, why, nextStep, citationOfSignal }`.
  No I/O in the pure core; tested. Model it on `dataQuality.ts` / `imputedVerdict.ts`.
- **Data access** — a query/view that assembles per-coach signals from `usage_events` +
  `v_player_submission_compliance` + `coach_week_setup` + `integration_logs` (+ the rest). If you add a
  DB view, save a timestamped `.sql` under `supabase/migrations/` (CLAUDE.md).
- **Surface** — reuse `coach_notifications` for delivery; the bubble component sits on the coach shell.
  Do NOT invent a second notification system.
- **Bilingual** — EN default, IS toggle, like the rest.

## Acceptance

- The pure module, given synthetic inputs, produces the right nudge:
  - a coach with no `usage_events` in 6+ days → the dormant nudge;
  - a coach whose check-in % dropped below the threshold → the compliance nudge;
  - a brand-new coach with < 2 weeks history → `insufficient` / low confidence, **not** a scold.
- The bubble shows **at most one** nudge, dismissable, snooze respected, bilingual.
- Confirms it runs on **existing** data: `usage_events` already carries `role='COACH'` + `path` — no new
  event logging added.
- The outcome tie-in is computed from real data or omitted (never fabricated).
- `npx eslint` clean on touched files; `npm test` passes; stage specific files only.

## Do NOT

- **Do not nag.** One nudge at a time, only on a real threshold breach, snooze honoured. A quiet
  bubble on a well-used account is correct behaviour.
- **Do not scold a new club** with thin data — low confidence, encouraging tone.
- **Do not invent the outcome tie-in.** Compute "clubs that do X see Y" from real usage × outcome, or
  leave it out and say confidence is low.
- **Do not build a new notification channel** — reuse `coach_notifications`.
- **Do not add new event logging** — `usage_events` already captures page views per coach.
- **Do not touch** the readiness trigger, `v_coach_readiness_today_v8`, or the load/analysis pages.
