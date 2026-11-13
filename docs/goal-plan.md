# Goal plans ("I want to improve my top speed / acceleration / braking / jump")

Status: **lotur 1 + 1b + 2 + 3 + 4 shipped 2026-11-13.** A player can ask; the coach approves, changes the start or
declines. From its start date the plan's sessions show on the player's Today, placed around the team's matches, in a
lighter version on a yellow day and skipped on red. The player ticks each session done / not done. It pauses itself on
injury and ends after 8 weeks; then the coach's tests (and VALD jump height) give the outcome, shown to the player for
14 days and printable as a PDF. Nothing is sent (no push, no email).

## What it does

`buildGoalPlan(input)` (`src/lib/micropulse/goalPlan/`) turns one player's own data into an 8-week **add-on**
plan for one quality. In season that is 2 short sessions a week, out of season up to 3. Both numbers are MicroPulse
rules, not from a study. The coach sees all four plans on Total Player Analysis ("Goal plans" card, after the
strength plan).

- Rules decide; there is no AI.
- The plan never reads or writes the readiness colour. It never writes `player_today_strength_override` and is not
  a Today source.

| Quality | What picks the start | Evidence label |
|---|---|---|
| Top speed (football outfield only) | Days since a run at 90% of own top speed: over 10 days (or none) → 2 build-up weeks first. Gym session emphasis comes from the strength read: DSI (squad-relative), else the IMTP band | Researched (doses from `speedMethods`) |
| Acceleration | Under 18 / age unknown → youth: short starts + low hops + technique strength, no sled (Wang K 2026). Else IMTP band: low → strength first; good → starts first; else DSI; else balanced | Partly researched |
| Braking | McBurnie hard-braking load yellow/red → technique only at 50–75%, no extra hard stops. A VALD single-leg test with ≥10% difference → one extra set on the weaker leg | Partly researched (Dos'Santos 2019/2021 progression) |
| Vertical jump | Under 18 / age unknown → Bedoya youth hops. Low IMTP → strength first. Strong but slow off the ground (RSI) → drop + rebound jumps. Else squats by bar speed + rebound jumps (Sánchez-Sixto 2021) | Partly researched |

No study tested choosing the start from IMTP, DSI or RSI. Every plan says so, and that choice is labelled as
MicroPulse's rule.

Every ok plan also carries `limits` ("What the research does not show"), shown behind "Show details".

## Lota 1b: second research batch (2026-11-13)

Nine more papers read in full (numbers checked against the paper text, not a summary):

| Paper | What changed |
|---|---|
| Alcaraz 2018 (sled, 13 studies) | Sled helps the first 10 m (2.3%, effect 0.61) but only trivially more than the same sprints without a sled (0.09, ns). Copy no longer implies the sled is better, in the plan **and** the live speed library. >20% body mass "not for inexperienced" → heavy sled is a coach's option for experienced players only |
| Petrakos 2016 (sled, 11 studies) | Sled "no more effective" than normal sprints; 60–340 m per session. Default load is now "slows the run by 15–30%", volume 4–5 × 15–20 m (60–100 m) plus normal sprints. Openly under Alcaraz's >160 m, because this is a 20-min in-season add-on |
| Myrvang 2024 (21 studies) | Covers sled, vest, parachute, slope, towing: a small edge at 10 m only. Copy fixed |
| Seitz 2014 (strength → sprint) | r = −0.77, 2 sessions/week, 60–85% of max, tests <30 m. Gym dose 3–4 × 3–5 at ~75–85%, 2–3 min rest. A 2022 re-analysis found the effect sizes inflated; said in `limits` |
| Wang K 2026 (youth football, 74 studies) | Plyometrics + short sprints top for youth acceleration; strength alone uncertain; low certainty. Youth acceleration branch added. "No sled under 18" stays, labelled as a MicroPulse rule |
| Marvin 2024 (braking, adults, 12 studies) | No pooled gain in braking (SMD −0.04); none trained braking on purpose; high risk of bias. Now fact 2 on the braking plan; label stays "Partly researched" |
| Chen 2025 (COD, youth, 36 studies) | Supports the cutting drills; slow-lowering (eccentric) work tops only sharp turns ≥90°. **The abstract's numbers differ from the tables; we use the tables** |
| Silva 2022, Harper 2022 | Already used; no change |

Braking safety sentence corrected: high **cumulative** braking load over 2–4 weeks (as cited by McBurnie 2022) is
associated with more overuse injuries — not "a sudden rise".

## Safety rules (tested in `__tests__/goalPlan.test.ts`)

- Blocks, in this order: inactive → injured / rehab / return-to-train → sport not football or basketball → top
  speed in basketball → top speed for goalkeepers.
- Under 18, or age unknown, gets the easier level: every block is supervised, there is no sled (MicroPulse rule),
  and drop jumps appear only in week 7 of the youth jump plan.
- Adult sled blocks in normal weeks are 60–100 m at a 15–30% slow-down; no copy may say a sled beats normal sprints.
- Flat-out sprints, hard stops and drop jumps are always supervised.
- Session limits:
  - at most 150 m flat out per session;
  - at least 2 days between top-speed days;
  - no session over 20 min.
- Wording:
  - no "prevents / predicts / causes" injury claims;
  - no jargon in the verdict or facts;
  - no gendered pronouns.

## Data (loader.ts, server-only, read-only)

- **Top speed:** the same GPS rows, reference and 90% rule as "Top speed due", but **without** the "GPS day in the
  last 10 days" gate. Off-season a player still has a top speed; the gap is just long.
- **VALD jump/strength and sprint times:** used only if the test is ≤12 months old (MicroPulse rule). Older tests
  are listed as missing.
- **DSI:** used only when squad-relative. An absolute DSI tier reads everyone as "max strength".
- **Braking:**
  - `get_mcburnie_decel_status` gives the overload flag.
  - High-speed cutting L/R over 14 days is shown as context only. It says which way a player cuts, not which leg
    is weaker.

## Route

`GET /api/coach/goal-plans/[id]/preview`: coach of the player's team only, FREE-locked (402). The card sits on the
ELITE-gated Total Player Analysis page.

## Lota 2: request and approval (2026-11-13)

Flow:
1. **Player:** Today → See more → **My goal** (`PlayerGoalSheet`, reads nothing until opened). The player picks a
   quality (blocked ones are greyed with a plain reason) and adds an optional note.
2. `POST /api/player/goal-plan` reads the player from the token, runs the full engine read and refuses a blocked
   quality (422). It stores the rule's proposal (`proposal`) for the audit trail. **One open goal per player**: a
   partial unique index gives 409.
3. **Coach:** sidebar → Strength Training Intelligence → **Player goal requests** (`/coach/goal-requests`, badge =
   number waiting). Total Player Analysis' goal card links there when the player has an open goal. The review
   rebuilds the plan from today's data.
4. The coach approves (first Monday within 28 days), declines (reason required) or stops an approved plan
   (reason required).
5. The coach may choose **another start, only from `allowedStarts`**, and must give a reason (≥5 characters). The
   safety rules decide the list:
   - under 18 / age unknown keeps the youth level;
   - McBurnie yellow/red keeps braking at technique only;
   - flying sprints from week 1 need a run at 90% within 21 days.

   An unsafe choice falls back to the rule. The plan then says "The coach chose this start…" and drops the
   data-based counterfactual.
6. Approval **rebuilds the plan on the server and freezes it** in `plan` (engine + content version). The browser
   never sends a plan. The player sees "approved, starts <date>" plus the coach's note, or the decline reason.

Tables (migration `20261113170000_player_goal_plans.sql`):

| Table | What it holds |
|---|---|
| `player_goal_plans` | status `requested → approved / declined / cancelled`, `approved ↔ paused`, `approved → completed`; proposal, frozen plan, start override, dates, notes, reason, pause week |
| `player_goal_plan_events` | audit trail: who (player / coach), what, why |

Access:
- **Reads:** `can_read_goal_plan` (definer) allows admin, a coach of the team (profiles or `coach_teams`), and the
  player themselves. There is no `staff_users` shortcut.
- **Writes:** server only (service role, `store.ts`). Tested: a player can't read a teammate's or another team's
  row, and a coach of another team can't read the team's rows.
- **FREE lock:** FREE-locked teams get 402. The player route checks `is_free_locked_team`; the coach routes are in
  `freeLockApi`.

Plan tier: PRO and up (any team that isn't FREE-locked). The Total Player Analysis card itself stays on the ELITE
page; the request page and review are PRO.

## Lota 3: on the player's Today (2026-11-13)

Card: `PlayerGoalTodayCard` in the deferred Today slot below the session (with the recovery and "Top speed due"
cards), so Today's first load is unchanged. It reads `GET /api/player/goal-plan/today` and is silent with no plan, on
an error, and for FREE clubs. Pure rules in `today.ts`; server reads in `todayLoader.ts`.

**Day placement** (`placeWeek`, MicroPulse rules, no study):
- Candidates are the team's TRAIN days in `week_plans`. A week with no TRAIN day set counts every day not marked
  off / recovery / game.
- Never on a match day, MD-1 or MD+1 (matches from `match_schedule` + week_plans GAME; labels in the same order as the
  strength engine's MD context). Sessions at least 2 days apart, also across Sunday → Monday.
- Preferred days per quality:

  | Quality | Session A | Session B |
  |---|---|---|
  | Top speed | MD-3, MD-4 | gym: MD+2, MD-4 |
  | Acceleration, jump | MD-3, MD-4, MD+3 | gym: MD+2, MD-4 |
  | Braking | MD+3, MD+2 | MD-2 |

  No match near: weekday order (A Tue/Wed, B Thu/Fri).
- When not all fit, A wins over B. A session with no free day is left out, not made up. A week the team is off says
  "the team is not training", not "busy match week".

**Today's version** (the colour is only read, from `v_coach_readiness_today_v8.final_color`):

| Colour | Version |
|---|---|
| Green | Full session |
| No check-in | Full session, with "check in first" |
| Yellow | Lighter: no flat-out or sled sprints, hard stops, box drops or tests; the rest at half the sets. A session that is all such work is skipped |
| Red | Skip; not made up |

**Pause and end** (`syncGoalStatuses` in `store.ts`, applied lazily whenever the plan is read: player Today, player
request screen, coach list):
- Approved and the player is in `player_injuries` as injured / rehabilitation / rtp_training → `paused`, with
  `paused_at` and `paused_week` (migration `20261113200000_player_goal_plans_pause.sql`). Event `paused` (system).
- After `end_date` → `completed`, event `completed` (system). The player can then ask for a new goal.
- Only the coach restarts a paused plan (`/coach/goal-requests` → "Restart the plan", decision action `resume`):
  - picks a week up to the paused week; the rule suggests the paused week, or week 1 after more than 21 days;
  - picking a later week than the suggestion needs a reason;
  - refused while the player is still marked unavailable.

  The start date moves back so the chosen week lands on the restart Monday.

The coach's review of an approved plan shows the plan week and where this week's sessions land (`weekView`).

Player-facing errors now carry Icelandic text (`error_is`).

## Lota 4: ticks, tests, outcome, PDF (2026-11-13)

Migration `20261113220000_player_goal_plan_progress.sql`: two tables, read-only from the browser
(`can_read_goal_plan`), written only by `store.ts` with the service role; two new history kinds
(`result_added`, `result_removed`).

- **Tick (adherence).** `player_goal_plan_sessions`, one row per plan · week · slot. On Today the player marks today's
  session "Mark as done" / "Couldn't do it", answers "Did you do session A (Tue)?" for earlier days this week, and
  can tick a red/yellow skip day as "Skipped". `POST /api/player/goal-plan/today` places the week on the server and
  refuses a slot not placed on today or earlier (409), a finished plan (409) and a bad body (400). The version that
  day (full / lighter / skip, from the v8 colour, only read) is stored for information.
- **Adherence** = sessions the rules placed on a day that has passed (today's only once ticked), counted week by week
  with the same placement the Today card used (`placedSessionsUpTo`). "11 of 16 sessions ticked as done, 1 not done,
  4 not ticked."
- **Test results.** `player_goal_plan_results`, entered by the coach on `/coach/goal-requests`
  (`POST/DELETE /api/coach/goal-plans/requests/[id]/results`): start (week 1) or retest (week 8), only the plan's own
  tests, a plausible value, dated 4 weeks before the start to 3 weeks after the end. A later entry for the same test
  replaces the earlier one in the outcome; every entry and removal stays in the history.
  - Jump height also comes straight from **VALD** (CMJ, the mean of each test's valid trials, Claudino 2017): the
    latest test from 4 weeks before the start to the end of week 1 = start, from week 7 to 2 weeks after = retest.
    Not copied into the table. On the same day a coach entry wins.
- **Outcome** (`outcome.ts`, pure): retest vs start against the mark the plan already printed —

  | Quality | Test(s), main first | "Clear change" from |
  |---|---|---|
  | Top speed | flying 20 m, else a top-speed test (km/h) | 1% (MicroPulse rule) |
  | Acceleration | 10 m from standing | 2% (MicroPulse rule; no paper gives one) |
  | Braking | cut test, then 10 m | 3% cut test (MicroPulse rule: the cut's extra time varied 12–21% within one session in the trial), 2% 10 m |
  | Jump | jump height (CMJ) | 2% (MicroPulse rule; the trials used about 0.6–1.2 cm) |

  Below the mark = "no clear change"; beyond it the wrong way is said plainly. Never "caused" or "prevented".
- **GPS context, never the verdict.** Top speed: fastest days (same validity filter as the top-speed signal). Braking:
  `max_deceleration` (Marvin 2024: GPS deceleration in game-like drills was the only direct braking measure in the
  studies). Same-length windows: the 4 weeks before the start vs plan weeks 5–8, mean of the top 3 days, nothing
  with fewer than 3 days. **Breiðablik's Catapult rows almost never carry `max_deceleration`** (11 of 2,823 in a year);
  Keflavík, Grindavík, Fylkir and Þór do. So for Breiðablik the braking line is usually absent.
- **End of plan.** The plan still completes on its own after week 8. The player's Today card then shows the finished
  card for 14 days: the outcome in their own numbers (or "Last step: the retest with your coach" and the test named),
  sessions ticked, and how to ask for a new goal (a new request is the restart; one open goal at a time).
- **Coach.** `/coach/goal-requests` → "Progress and outcome" for a running, paused, finished or stopped plan: the
  verdict, sessions ticked, the mark, the results list (remove a coach entry), result entry, "Show details" (each
  test's line, GPS context, how it is counted) and **PDF** (`GoalPlanPdf.tsx`, brand kit: outcome verdict → facts →
  results → why this plan → the 8 weeks → safety → limits → history → sources).

Verified: Demo GPS Pro end to end (approve → ticks incl. refused future slot → results incl. refused wrong test and
future date, remove → outcome 1.92 → 1.87 s, 2.6% faster, clear change → end → finished card → no card after 14 days;
cleanup to 0 rows). Real data read-only: VALD jump start found for a Breiðablik player (42.6 cm, mean of 3), GPS top
speed context (30.8 vs 29.7 km/h), Keflavík braking context (5.5 m/s²). About 0.1–0.2 s per read.

## Next (not built)

- A push or reminder to tick sessions or book the retest: needs the coach's OK (nothing is sent today).
- Breiðablik braking context needs `max_deceleration` in their Catapult export.
- A player-side history of finished goals (today a finished goal shows 14 days, then only the coach sees it).
