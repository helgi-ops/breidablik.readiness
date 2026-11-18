# Goal plans ("I want to improve my top speed / acceleration / braking / jump")

Status: **lotur 1 + 1b + 2 + 3 + 4 shipped 2026-11-13; 4b + 5 + 6 on 2026-11-14.** A player can ask; the coach approves, changes the start or
declines. From its start date the plan's sessions show on the player's Today, placed around the team's matches, in a
lighter version on a yellow day and skipped on red. The player ticks each session done / not done. It pauses itself on
injury and ends after 8 weeks; then the coach's tests (and VALD jump height) give the outcome, shown to the player for
14 days and printable as a PDF; after that the player keeps it under "Earlier goals". Nothing is sent (no push, no
email).

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
- **GPS context, never the verdict.** Top speed: fastest days (same validity filter as the top-speed signal).
  Braking and acceleration (lota 4b): the count of hard efforts in Catapult's top band, **IMA Dec / Acc band 3**
  (`ima_band3_decel_count` / `ima_band3_accel_count`), when the player has any band-3 day; otherwise the peak in m/s²
  (`max_deceleration` / `max_acceleration`). Teams carry one or the other, never both (12 months: Breiðablik 2,757 of
  2,823 days band 3 and 11 peak; HK and the Demo Pro teams band 3 only; Keflavík, Grindavík, Fylkir, Þór, Afturelding
  peak only), and the two are never mixed in one line. The band-3 line says it is a count of how often, not how hard.
  A day with more than 40 band-3 efforts is dropped as a recording fault (MicroPulse rule: 99th percentile 15 decel /
  18 accel a day; days of 45–200 sit beside implausible totals). `decel_b3_plus_tot_effs_gen2` is empty everywhere
  and not used. Marvin 2024: GPS deceleration in game-like drills was the only direct braking measure in the
  studies. Same-length windows: the 4 weeks before the start vs plan weeks 5–8, mean of the top 3 days, nothing
  with fewer than 3 days.
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

## Lota 5: the player's earlier goals (2026-11-14)

Helgi picked "player history" for lota 5 (reminders stay unbuilt: they need the coach's OK).

- **Where:** Today → See more → My goal → **"Earlier goals (n)"** at the bottom of the sheet. The sheet's first load
  reads a count only (`historyCount` on `GET /api/player/goal-plan`); the list (`GET /api/player/goal-plan/history`,
  read only) is fetched when the player opens it.
- **What counts:** plans that ran on the player's **current team**: finished after 8 weeks, or stopped by the coach
  after approval (`isHistoryRow`: has a start date). Withdrawn and declined requests never ran, so they are not
  history (a decline still shows for 21 days as before). Newest first, at most 8 (`HISTORY_MAX`).
- **Layered read per goal** (`history.ts`, pure): (0) verdict in the player's own numbers, the same outcome the coach
  sees ("All 8 weeks done. 10 m: 1.92 → 1.87 s, 2.6% faster — a clear change", or "No retest was entered", or "Your
  coach stopped the plan in week 3"); (1) sessions ticked + the coach's note to the player; (2) behind "Show details":
  the other test lines, how a change is read, "rules, no AI".
- **Not shown to the player:** the coach's reason for stopping (it was entered as the coach's own reason, never labelled
  as a message to the player), GPS numbers, colour.
- Progress is the coach panel's `loadGoalProgress` with `{ gps: false }`. Verified on Demo GPS Pro: a finished plan, a
  stopped plan and a withdrawn request → 2 items (the withdrawn one left out), the stop reason not in the payload, 0 for
  another team, about 0.3 s; cleanup to 0 rows.

## Lota 6: reminding the coach about tests (2026-11-14)

Helgi picked "reminder to the coach" (nothing to players). Without a start test and a retest a plan has no outcome.

- **Rule** (`testsDue.ts`, pure): *start test missing* while approved from the start date to the end of week 3
  (start + 20 d) with no start result on any of the plan's tests; *retest due* while approved from week 7 (start +
  42 d), or finished within the 3 weeks a retest can still be entered (`RESULT_AFTER_END_DAYS`), with no retest.
  Retest wins if both are missing. Paused, stopped and declined plans are never asked about. VALD jump height counts
  (read live), so a jump plan with a fresh CMJ needs nothing typed. The windows are MicroPulse's, said on the chip.
- **Where it shows** (`loadTeamGoalTestsDue`, read only):
  - Today chip + **morning digest**: coach signal `goal_tests`, level `task`, confidence high (facts, not estimates),
    one line ("Retest due: Jón (top speed, 4 days left) · Start test missing: Anna (vertical jump)") because the
    digest shows a signal's first line only. Links to `/coach/goal-requests`. The digest opts in with
    `computeAdminSignals(..., { includeGoalTests: true })`; **threshold push alerts do not** (a test to book is a
    morning to-do, not an alert). The digest is still the coach's own opt-in on /coach/settings.
  - **Goal requests page**: a tag per plan ("Retest due · 4 days left", "Start test missing") and "n tests to enter"
    in the header (`testDue` on each list item).
- Verified on Demo GPS Pro: day 5 without a start test → start test; week 7 without a retest → retest; finished with
  a retest and week 5 → nothing; another team 0; not in the threshold-alert set; digest line present; cleanup to 0.

## Lota 7: "your data points more to …" (2026-11-14)

Helgi: a player picks top speed, but the data says their main weakness is something else, so the system suggests
that instead. The player decides; the coach sees the same read and what the player did.

- **Rule** (`priority.ts`, pure, rules not AI): each quality gets one number per player, ranked against the same
  position on the team (whole team when fewer than 4 share it) with Total Player Analysis' own percentile, pools and
  confidence (`buildAthleteProfile`). A suggestion shows only when another quality is in the **bottom third (≤30th
  percentile)** and the picked one is in the **top half (≥50th)** (`CHOSEN_MIN_PCTL`). Two candidates → the lowest.
  Never for a blocked quality (top speed for goalkeepers / basketball), a low-confidence read, or a pick with no
  number. Goalkeepers are ranked only against goalkeepers (none of our teams has 4, so they get no suggestion).
- **Numbers:** top speed = 3rd-fastest GPS day in 12 months or a faster sprint test (the plan's own reference); jump
  = latest CMJ on the force plates ≤12 months, mean of its jumps; acceleration / braking = **Acc / Dec band 3 per 90
  min of GPS time**, 12 months, ≥3 days. GPS time = stored session length, else PlayerLoad ÷ PlayerLoad per minute
  (Breiðablik has a session length on only 73 of 2,844 days; the derived minutes cover 98%). A day counts with 20–150
  min (stubs and all-day files out) and ≤40 band-3 efforts. A team with no band 3 (Keflavík) uses the 3rd-highest day
  in m/s². One column per team, never mixed.
- **Why "top half":** on 2026-11-14 the first rule ("pick not in the bottom third") suggested something on 45% of
  Breiðablik's picks (18 of 25 players), HK 26%, Keflavík 23%. A stricter weakness mark (20th) changed almost nothing;
  requiring the pick to be in the top half did: Breiðablik 35%, HK 22%, Keflavík 15%. Helgi chose that.
- **Player** (My goal sheet): on the first pick the sheet reads `/api/player/goal-plan/suggestion` (read only, own
  numbers and percentiles only, never another player's). Card: verdict → two facts → "Switch to …" / "Keep …" →
  details (how each number is counted, band 3 = how often not how hard, the comparison group, what would make the
  suggestion go away, the rule). Nothing new when there is no suggestion.
- **Coach** (Goal requests): the POST reads the suggestion again server-side (the body only says which quality the
  player switched from) and stores a snapshot on the "requested" event (`detail.priority`): "MicroPulse suggested
  acceleration (18th percentile in position). The player kept top speed (64th)." or "… first picked top speed and
  switched." The four numbers sit behind "Show details". Stored when sent, so it does not change later. If the read
  fails the request still goes through without it. No DB change.
- Verified on Demo GPS Pro: kept and switched requests stored and read back as the coach sees them; cleanup to 0
  rows. Real teams read only. About 0.7 s per read from a laptop.

## Lota 7b: why each quality matters, for the player (2026-11-14)

Helgi: explain to the player why a quality is worth improving and what improves it (explainability for the player).

- `qualityWhy.ts` (pure, fixed text, not AI): per quality one **"why it matters"** line (shown without a click) and
  3–4 **"what improves it"** lines behind "What improves …?", each with its study. Braking also says what the research
  does not show yet (Marvin 2024). Every line uses a study the plans already cite, read through the same reference
  maps (`SPEED_REFS`, `ACCEL_REFS`, `BRAKING_REFS`, `JUMP_REFS`), so a short name can't drift from its citation.
- Injury lines say "associated with" (top speed: Malone 2017, Buchheit 2023) or "may help, not proven" (braking:
  McBurnie 2022). The sled line keeps the plans' rule: no better than the same sprints without one (Alcaraz 2018).
- Where: under the picker for the picked quality, and inside the suggestion card for the suggested quality.
- Tests (`qualityWhy.test.ts`): every line cites a known study, no prevent/predict/cause wording, no jargon or
  placeholders, titles in both languages.

## Programme Library "Speed & power" tab, lota 1 (2026-11-14)

Helgi: the library had a tab for top speed only; the other goals need one too. Chosen: one tab, four pills; methods
first.

- The tab `speed` is now **"Speed & power" / "Hraði og kraftur"** (key and links unchanged) with pills Top speed ·
  Acceleration · Braking · Jump (`SpeedPowerLibrary.tsx`). Top speed shows the existing library unchanged (methods,
  three plans, PDF).
- Acceleration, braking and jump (`QualityMethodLibrary.tsx`, data `goalPlan/qualityLibrary.ts`): verdict, 2–3 plain
  facts with their study, method cards grouped Tested → From a review → MicroPulse rule (dose in one line; findings,
  "full paper / abstract only" and full citations behind "Show details"), then "What the research does not show".
- The methods are the goal plans' own `ACCEL_METHODS` / `BRAKING_METHODS` / `JUMP_METHODS` and reference maps, so the
  library and a player's plan can't disagree. Coach-only; nothing is sent to players.
- Tests (`qualityLibrary.test.ts`): same method arrays as the plans, every reference resolves, every method in one
  group, no prevent/predict/cause, a sled is never better than sprints, no jargon in the verdict/facts.
- Lota 2: see below.

## Programme Library "Speed & power" tab, lota 2: plans + PDF (2026-11-14)

Coach's choices: in season = a **6-week block** (what the trials tested), not a fixed maintenance week; **one adult
team plan per quality + explicit under-18 rules** (the youth level is under "Individual").

- `goalPlan/qualityPlans.ts` (pure): per quality, In season (6 weeks, match Saturday, MD-4 = the force /
  accel-decel day in both Periodization Hub week models; braking adds MD-2 as in the goal plan), Pre-season
  (6 weeks, Monday + Thursday) and Individual (the goal plan's own 8 weeks for the chosen start, via
  `accelWeeks` / `brakingWeeks` / `jumpWeeks` + `applySupervision`). Team plans are built from the goal plans' own
  blocks (`ACCEL_BLOCKS`, `BRAKING_BLOCKS`, `JUMP_BLOCKS`, exported for this; goal-plan output unchanged).
- Braking = Dos'Santos 2019's 6 weeks as two sessions in place of the warm-up; jump pre-season = Sánchez-Sixto
  2021's tested rebound sets and bar-speed squats; jump in season uses fewer sets (MicroPulse's). Acceleration sled
  is optional in season, 60–120 m in pre-season (inside Petrakos' 60–340 m).
- UI: "Three plans" box between the facts and the methods (`QualityMethodLibrary.tsx`), start picker under
  Individual, "Rules in every plan" (MD-1/MD+1, one quality at a time, U18 limits, colour read-only).
- PDF: `components/coach/QualityPlanPdf.tsx` on the shared brand kit.
- Tests (`qualityPlans.test.ts`): methods/refs resolve, no MD-1/MD+1, ≥2 days apart (72 h in pre-season), sled
  60–340 m and never at youth level, youth ≤120 contacts and all supervised, hard blocks supervised, individual =
  goal-plan weeks, wording rules.

## "Speed & power" lota 3: how-to lines, power-first order, jump papers (2026-11-14)

- `GoalMethod.howTo?: Bi[]`: 3–5 "How to run it" lines on all 13 acceleration/braking/jump method cards, rendered
  under "Hvernig" in `QualityMethodLibrary.tsx` (same as the top-speed cards). They reuse the card's own doses; a
  cue that is coaching practice, not a study, says so. Not in the PDFs (top speed's PDF has none either).
- Coach's rule: power before strength in a session. Fixed where heavy lifts came before jump squats or jumps:
  acceleration "balanced" gym session (goal plan + in-season team plan), top-speed goal plan "balanced" gym session,
  top-speed library in-season MD-4. `__tests__/sessionOrder.test.ts` checks every plan (contrast and
  strength-plus-sprint pairs are their own method and not checked).
- Jump evidence (8 papers the coach sent). Read in full: Sáez de Villarreal 2009, Markovic 2007, Pardos-Mainer 2021,
  Thapa 2021, Ma 2025, Oliver 2024 (jump results). Abstract only (paywalled): Ramirez-Campillo 2020, Oxfeldt 2019.
  The jump verdict changed: jumps alone reliably work; weights on top add little on average, except a lift paired
  with a similar jump in the same session (Ma 2025, +2.9 cm CMJ). The old "jumps + squats beat jumps alone" was one
  trial (Sánchez-Sixto 2021) and is now worded as that.
- Dose questions for the coach (NOT changed): team blocks are 6 weeks / 12 sessions and ~34–59 contacts a session;
  reviews found more with ≥8 weeks (Thapa 2021) and suggest >10 weeks, >20 sessions, >50 jumps a session (Sáez de
  Villarreal 2009). `GOAL_CONTENT_VERSION` → 2026-11-14.

## "Speed & power" lota 4, step 1: jump doses (2026-11-14, coach approved)

- Jump team plans (in season, pre-season) run **8 weeks** (tests weeks 1, 4, 8; week 8 lighter). Every full-week
  jump session reaches about **55 foot contacts** (`ADULT_SESSION_CONTACTS`): the tested rebound/drop jumps first
  get topped up with squat jumps + countermovement jumps (`jumpMix` / `withTopUp`, new method `squat_cmj_jumps`,
  basis "review": Sáez de Villarreal 2009 Table 3 mix 1.46 vs one type 0.40–0.66; Markovic 2007 no clear
  difference by programme type).
- Adult individual jump starts (= player goal plans) session A, weeks 1–6, get the same top-up (minutes 15 → 20).
  New goal plans only; approved plans keep their frozen copy. `GOAL_CONTENT_VERSION` → 2026-11-14.2.
  Session C (short, out of season) and weeks 7–8 unchanged. Youth jump unchanged.
- Acceleration and braking team blocks stay 6 weeks (what those trials tested).
- `__tests__/goldenWeeks.test.ts` hashes every other goal plan's weeks (accel, braking, top speed, youth jump) so
  the library's levels/swaps (steps 2–3) cannot change a player's plan by accident.

## "Speed & power" lota 4, step 2: beginner · intermediate · advanced (2026-11-14, coach approved)

- `goalPlan/levels.ts`: `TrainingLevel`, labels, who each level is for (MicroPulse guidance, said so),
  `LEVEL_BASIS` ("the studies tested the intermediate level; beginner/advanced are MicroPulse's, within the doses the
  studies used"), `LEVEL_CHANGES` (one line per quality per level), `JUMP_LEVEL_CONTACTS` (50 / 55 / 70).
- **Intermediate = the plans as they were, word for word.** `goldenWeeks.test.ts` also hashes every library plan at
  intermediate (team plans, individual starts, the three top-speed plans).
- Builders take an optional `level` (default intermediate): `accelWeeks`, `brakingWeeks`, `jumpWeeks`, plus the team
  plans in `qualityPlans.ts` (now functions of level, cached) and the top-speed plans (`speedPlan(key, level)` in
  `speedMethods/index.ts`, built from per-level number tables; `SPEED_PLANS` = intermediate).
  Player goal plans call without a level, so they stay at intermediate (levels for goal plans = next lota).
- What changes:
  - Top speed: beginner 2 build-up weeks at 90–95%, flying zones 10–15 m, technique-first lifts; advanced 20–30 m
    zones, never over 150 m flat out, heavier lifts.
  - Acceleration: beginner one sprint fewer, all 10 m, no sled, low bounds, technique-first lifts; advanced one sprint
    and one sled run more (sled still 60–340 m), single-leg bounds, lifts at 80–90%.
  - Braking: the drills never change; only effort/pace (`EFFORT` table: beginner ~2 more weeks at 50–75%, advanced
    full effort / reacting a week sooner) and landings (two-leg / single-leg).
  - Jump: beginner ~50 contacts, one rebound set fewer, landings held still, no drop jumps (fast-jumps start not
    offered), technique-first squat; advanced ~70 contacts, drop jumps 30–40 cm from week 3, squat one tested step
    heavier.
- Youth start ignores the level (picker hidden, youth note shown). All safety tests run on every level.
- UI: `LevelPicker` under the plan tabs (both libraries); level kept per quality in `SpeedPowerLibrary` (saved per
  team in step 3). Non-intermediate plans name the level in the title, put `LEVEL_CHANGES` first among the facts and
  `LEVEL_BASIS` first among the limits. `SpeedPlanPdf` now takes the plan object (`leveled` adds the level basis).

## "Speed & power" lota 4, step 3: exercise swaps, saved for the team (2026-11-14, coach approved)

- `goalPlan/swaps.ts`: the swap registry. Each slot matches blocks by method + planned wording, lists the planned
  exercise first, then the alternatives. A swap replaces whole phrases in both languages (never word by word,
  Icelandic case endings) in the exercise name and dose line. **Only the exercise changes**: method, dose numbers and
  every counter (flat-out m, contacts, sled m, hard stops) stay, so every safety check is unchanged.
  | Slot | Qualities | Options |
  |---|---|---|
  | heavy_legs | accel, jump, top speed | squat or trap bar (planned) · back squat · trap-bar deadlift · front squat · leg press |
  | jump_squat_load | accel, jump, top speed | any light load (planned) · bar · dumbbells · trap bar |
  | bounds | accel | forward bounds (planned) · hurdle hops · power skips |
  | rebound_jumps | jump | rebound jumps (planned) · over low hurdles · tuck jumps |
  | squat_cmj | jump | CMJ (planned) · box jumps (step down) |
  | sled | accel | sled (planned) · hill sprints |
  | start | accel, top speed | standing (planned) · split stance · falling · three-point |
  | eccentric_single_leg | braking | split squat (planned) · reverse lunge · single-leg box squat |
  Never swappable: tests (incl. the 10 m test's start), the tested braking drills and landings, flying sprints,
  Nordic, squat by bar speed, drop jumps, youth hops.
- `applySwaps(plan, quality, choices)` returns the library's copy with a `swap` mark on swappable blocks
  (`swapMark(b)`). Since lota 5 goal plans use it too, marking only swapped blocks (golden test unchanged).
  The page and PDF say "swapped by coach", show the planned exercise and `SWAP_NOTE` ("not tested in the studies;
  the dose is the same").
- Table `team_quality_plan_prefs` (team, quality, level, swaps, updated_by/at; migration `20261114170000`):
  read-only for coaches of the team and admins (`can_read_team_coach_prefs`, no staff_users), writes via service role.
  Route `/api/coach/team/quality-plan-prefs` (GET / POST, `requireCoachAccessForTeam`, level and swaps validated by
  `isTrainingLevel` / `validateSwaps`; FREE-locked). `SpeedPowerLibrary` reads it once, saves each level / swap
  change, shows who changed it last; without a team (or 401/402) the choices hold on the screen and it says so.
- Tests: `__tests__/swaps.test.ts` (every option changes both languages, keeps numbers/counters, never touches the
  never-swappable blocks, validation).

## "Speed & power" lota 5: levels and team swaps in player goal plans (2026-11-14)

The coach asked for the library's levels and swaps in player goal plans ("settu stig og skipti í markmið leikmanna").

- **Level, picked per player at approval.** `/coach/goal-requests` shows a Level select under the start select
  (`levels` from `allowedLevels`). Default = the team's saved level for that quality (`team_quality_plan_prefs`,
  via `loadTeamQualityPrefs` in `teamPrefs.ts`); the coach can change it for this player, no reason needed (it is
  a dose choice, not overriding a rule). Under 18 or age unknown: no level (the youth plan is its own level).
  Jump with the `fast_jumps` start: no beginner (that start is for players who already have a strength base).
  An unknown or not-allowed level is refused (`parseDecision` "Unknown level.", `decideGoal` 422).
- **Swaps, as the team saved them.** The team's swaps for the quality are applied when the plan is built
  (`applySwaps(..., { onlySwapped: true })`): only swapped blocks change and get `GoalBlock.swap`; the dose
  numbers, counters and safety fields never change. Swaps are not per player; the coach changes them in the
  Programme Library. `SWAP_NOTE` goes into `limits` when any block was swapped.
- **What the plan stores.** `GoalPlan.level` and `GoalPlan.swaps` (only the slots that changed a block). Old
  plans have neither = intermediate, no swaps. The approved event's `detail` logs `level`, `team_level` and
  `swaps`. Frozen at approval like everything else: a later library change never touches an approved plan.
- **Engine.** `buildGoalPlan` → `resolveLevel(input)` → `partsFor({ ...input, level })` → the level builders
  (`topSpeedWeeks(start, emphasis, level)`, `accelWeeks`, `brakingWeeks`, `jumpWeeks`). A non-intermediate
  level replaces one fact with its level line (`LEVEL_FACT_SLOT`) and puts `LEVEL_BASIS` ("the studies tested the
  middle level") first in `limits`. Top speed got its own levels here (zone 10–15 m beginner, 15–30 m advanced
  with one extra rep in session A, still ≤150 m flat out; gym B by level, power before strength).
  Intermediate with no swaps is the old plan exactly (golden hashes unchanged). `GOAL_CONTENT_VERSION` 2026-11-14.3.
- **Shown in.** Coach plan view (`GoalPlanPreviewCard`: level chip, "N exercises swapped by the coach", "swapped
  by coach · planned: X" on the block), the goal PDF (level line, "(swapped by coach; planned: X)") and the
  player's Today goal card ("chosen by your coach" on a swapped block).
- Tests: `__tests__/goalPlanLevels.test.ts` (intermediate = old plan, youth ignores level, fast_jumps without
  beginner, every level × start × shape keeps the safety limits incl. sled 45–340 m and never at beginner, top
  speed zones, swaps change only the swapped blocks, invalid swaps ignored, approval level parsing);
  `sessionOrder.test.ts` now runs top speed over all levels.

## "Speed & power" lota 6: bar speed (VBT) and weightlifting pulls (2026-11-14)

The coach asked whether `research/Velocity Based Training` and `research/Weightlifting Derivatives` could make the
plans better. Chosen: bar speed on the cards only (no device setting, no per-block line); pulls as a swap + a card.
**No plan's numbers changed** (golden hashes unchanged); `GOAL_CONTENT_VERSION` 2026-11-14.4 because new goal plans
list more sources.

- **Bar speed on the gym cards** (acceleration + jump `heavy_strength`, acceleration `jump_squat`, jump
  `squat_bar_speed`, top-speed `heavy_strength` / `jump_squat`): one "How to run it" line each ("keep sets short:
  about half the reps possible, or 2s with 30 s rest; with a device, stop at about 10–20% speed loss"; jump squats:
  "with a device, show the speed after every jump"; squat by bar speed: "stop at about 15%"). No target speed is
  given for jump squats (no study tested one). Speed-loss cards carry a caution: studies almost all men, mostly
  Smith machine.
- **New refs (all read in full)**: Pareja-Blanco 2017 (16 pro footballers, VL15 vs VL30: CMJ 33.7→35.5 vs
  34.4→33.5 cm, no 30 m change), Hernández-Belmonte 2022 (10 studies, 308 men; between-group sprint p = 0.12, jump
  p = 0.23), Randell 2011 (13 rugby players, feedback: 30 m 4.20→4.14 s; only 30 m and long jump significant),
  Jukic 2022 (acute, clusters keep reps under 20% loss), González-Badillo 2015 (U16/U18, on the youth hops card),
  Berton 2022 (pulls vs jumps in novices: jumps won), Suchomel 2022 (pulls vs catch in experienced men),
  Suchomel 2017 (loads 30–45% of hang power clean max). `hernandezbelmonte2022` / `randell2011` live in
  `SPEED_REFS` and are copied into `ACCEL_REFS`.
- **Card `pulling_derivatives`** (`PULLING_DERIVATIVES` in `acceleration.ts`, also in `JUMP_METHODS`): basis
  "trial", Berton and Suchomel side by side, teaching order mid-thigh pull → jump shrug → hang high pull, caution
  "not a replacement for jumps or bounds; nothing in under-18s, women or in season". Never a plan block.
- **Swaps**: `jump_squat_load` (now "Jump squats: load or exercise") gets `jump_shrug` and `hang_high_pull`, each
  with a `note` ("teach it first") shown in the picker (`SwapOption.note`, `SwapBlock`). `ADULT_ONLY_SWAPS`: an
  under-18 goal plan never gets a pull even when the team chose one (top speed's youth plan has jump squats);
  other team swaps still apply to youth.
- Tests: `__tests__/vbtAndPulls.test.ts`; `qualityLibrary.test.ts` card count 14 → 16.

## "Speed & power" lota 7: every training variable for the gym lifts (2026-11-14)

The coach asked for the strength part to be "very detailed, with all the acute variables, VBT ones too". Chosen:
scope = the four "Speed & power" qualities (library, goal plans, PDFs; not the team Strength hub, not PT); bar speed
always as its own "With a bar-speed device" lines; every number labelled where it comes from. **No plan's numbers
changed** (`what` / `dose` untouched, golden hashes unchanged). `GOAL_CONTENT_VERSION` 2026-11-14.5.

- **`goalPlan/liftRx.ts`** (pure): `rxForBlock(block, ctx)` reads a gym block (method + exercise + the dose line,
  swaps included) and returns `LiftRx[]`: load, how hard, speed of each rep, rest, warm-up, when to add weight, how
  often, order in the gym, note, plus bar-speed lines (target, stop the set, adjust, feedback, or "not used"). Nine
  lift profiles: heavy, technique-first, Romanian deadlift, jump squat, pull (jump shrug / hang high pull), Nordic,
  slow-eccentric split squat, squat by bar speed, youth. `%` and rest are read from the dose when it states them,
  so the table can never disagree with the short line. `withRx(plan, ctx)` adds `rx` to the blocks and computes order
  ("power first, strength after") and frequency from the week.
- **Source on every line**: "From the studies behind this method" (the ref is on the method card), "From another
  study" (ref read in full, `RX_REFS`), or "MicroPulse guide, not tested". New refs, all read in full: Vanderka 2020
  (jump squats with speed feedback, 3 min rest, ~45% of 3RM), Weakley 2021 (±0.06 m/s → change load 4–5%; in-season
  speed loss <20%, power work 10%), Thompson 2021 (players differ >10% at heavy squat loads → use the player's own
  speed, no group table), Cuthbert 2021 (frequency matters little when volume matches; 1×/wk keeps strength),
  Cormie 2007 (jump squat power peaks at body weight). Pareja-Blanco 2017 gives the bar-speed squat targets
  (1.0 m/s ≈ 55–60%, 0.9 ≈ 65%, 0.8 ≈ 70%) and 4 min rest; Ishøi 2018 now `verifiedFrom: "full_text"`.
- **Never stored.** Storing `rx` made goal plans about 3× bigger (top speed 21.9 → 72.7 kB), and Today reads the
  plan every morning (see the morning DB overload). `goalPlanWithRx(plan)` derives it on read from the frozen blocks:
  coach preview (`GoalPlanView`), `GoalPlanPdf`, and `buildGoalTodayCard` (today's week only, so only today's lifts
  reach the player payload). Older approved plans get the table too.
- **Where it shows**: "All the details" toggle under each gym block (`LiftRxDetails` in `LiftRxTable.tsx`) in the
  library (`SwapBlock`), goal preview and the player's goal card; the player sees four plain rows (load, how hard,
  rep speed, rest) and the device lines, no sources. PDFs get a "Strength: every variable" section
  (`LiftRxPdf.tsx`, one table per distinct lift + the sources), before "Rules that always apply".
- Tests: `__tests__/liftRx.test.ts` (every plan × level × start; sets × reps, % and rest match the dose; sources;
  no m/s target on jump squats; youth ≤75%; no RIR/RPE/1RM or injury words; stored goal plan has no `rx`).

## Lota 8: the same table on the player's Today session (2026-11-14)

`rxForProfile(profile)` (liftRx.ts) exposes the lota 7 profile lines outside a plan (intermediate level, never a light
week). `strengthProgramming/todayLiftRx.ts` reads each Today item and fills only what the session leaves open; new
source `session` ("Set in this session"), new bar line `coach` (the coach's bar-speed rule), new profile `general`,
new ref Zourdos 2016 (RPE → reps left, read in full). See `docs/session-delivery-model.md`. Tests:
`strengthProgramming/__tests__/todayLiftRx.test.ts`.

## The coach starts a plan from the Programme Library (2026-11-15)

The coach asked for Óli Valur's top speed plan to go to his app with his name on the PDF. On the "Speed & power" tab the
coach can pick a player ("For a player"):

- **PDF with the name:** every library plan's PDF (in season, pre-season, individual; all four qualities) carries the
  player's name as the masthead and running header (`SpeedPlanPdf` / `QualityPlanPdf`, `forPlayer`).
- **Send to the app:** `GoalPlanSendPanel` shows the player's OWN goal plan for that quality, built from their data by
  the same rules as a player's request (start, the library's level, the team's swaps), with the start, first Monday and
  a note. "Send" → `POST /api/coach/goal-plans/start` → `startGoalByCoach` (store.ts): same checks as approving a
  request (one open goal, safe starts only, offered levels, rebuilt and frozen on the server), written as **approved in
  one step** so the player never sees a "waiting" request they did not make. Events: `requested` by the coach
  (`detail.by_coach`, `source: programme_library`) + `approved`; history and PDF read it as "Coach started the plan"
  (`eventLabel`). Approval logic is shared with `decideGoal` (`approvedPlan`, `approvalCols`, `logApproval`).
- The goal plan is an add-on (2 sessions a week, on the team's training days), so for top speed it differs from the
  library's 4-day "Individual" plan; the panel says so. Nothing else is sent (no push, no email). FREE-locked: 402.

## Goals start without approval when player choices are on (2026-11-17)

Lota 3 of "player choices" (picks → strength goal → this). Helgi decided: no coach approval; the coach sees everything
and can stop a plan.

- **Switch:** the same one as exercise picks and the strength goal: `team_strength_palette.player_picks_enabled`, or the
  coach's one-player test `player_strength_picks.test_enabled` ("Test with one player first" on `/coach/goal-requests`).
  Read on the server in the player route (`goalsWithoutApprovalFor`), never from the body; a failed read falls back to
  the request + approval flow. Since lota 4 (same day) **no exercise list is needed**: every team can switch it on;
  without a list only the 8-week goals change (picks and the strength goal still need the list). A team with no
  palette row gets one holding only the switch (empty slots / MD structures = same as no row for every reader).
- **What starts:** `createGoalRequest({ autoStart: true })` → `startGoalByPlayer` builds the plan an approval with no
  changes would freeze (`approvedPlan`: rule start, the team's saved level and swaps, the same safety checks — injured /
  returning still 422, under 18 youth plans), starting the Monday on or after today (`autoStartDate`). Row
  `auto_started = true`; events `requested` (player, `detail.auto_start`) + `approved` (actor_role `system`,
  `detail.auto`), shown as "Started right away (player's choice)". No push, no email.
- **Player:** button "Start my plan" with the start date; once set, "Cancel before it starts" until the first Monday
  (`playerMayWithdraw`), then "talk to your coach".
- **Coach:** "Player's choice" tag in the list, a count in the header, a note on the plan; stop with a reason as before.
  Pause on injury, the Today card, ticks, tests and outcome are unchanged.
- Tests: `__tests__/autoStart.test.ts`.

## Gym-only goals, step 1: Maximal strength, Explosive power, Strength + power (2026-11-18, coach preview only)

Three 8-week goals with no running session: both goal days (A and B) are lifts for the team's strength session. They
are meant to replace the +1 set "Stronger legs" / "More explosive" picks (step 3); "Stronger hamstrings" stays.
Step 1 ships the rules and the coach's preview card only: `OPEN_GOAL_QUALITIES` (types.ts) still lists the four pitch
goals, so the player's picker, the request / start routes (`isGoalQuality` in requests.ts), the team prefs route and
the Speed & power library do not offer them. The database checks on `player_goal_plans.quality`,
`team_quality_plan_prefs.quality` and `player_goal_plan_results.measure` are widened in step 2, with the delivery.

- **Module:** `gymGoals.ts` (one file for the three, not three files: they share doses, tests and sources).
  `GYM_REFS`, `GYM_METHODS` (heavy strength, jump squats, the pulls card, the strength test).
- **Doses (read in full):** Cormie 2010a (heavy squats 90/75/80%, 5 min rest: squat max +31% vs +4.5%; jump and
  40 m about the same in both groups), Cormie 2010b (jump squats 7×6 at body weight + 5×5 at 30%; strength fell
  without heavy lifting, so a short heavy lift stays in every power plan), Smilios 2013 (most power at 20–37% of max
  with body mass counted), Cuthbert 2021 (frequency), Stone 2002 (associations only, no target strength).
  Never above 90% of max; beginner never above 85%; under 18 technique-first at about 60% (never above 75%),
  body-weight jumps only, no heavy lift test.
- **Weeks:** 1–6 build, 7 eases off, 8 tests. Two goal days a week in and out of season (`GYM_GOAL_SESSIONS`).
- **Starts (MicroPulse rule; strength test first, DSI second, per Suchomel 2020):**
  - Maximal strength: `heavy` (adult) or `youth`.
  - Explosive power: weak pull (below / average) → `strength_first` (3 heavier weeks, then jump squats); no pull test
    and a high DSI → `strength_first`; else `power`.
  - Strength + power: weak pull or high DSI → `strength_led`; strong (or no) pull and a low DSI → `power_led`; else
    `even`.
  - Force-plate reads older than 12 months are not used (the ratio included, which the loader does not drop): the
    plan names "a new force-plate test" as missing. Every Breiðablik force-plate test is from Dec 2024, so today no
    Breiðablik player gets a DSI-based start.
- **Tests:** strength = mid-thigh pull on the plates or the heaviest 3–5 reps on the main lift (weeks 1, 8); jump
  test weeks 1, 4, 8 (Explosive power). New measures `imtp_nkg`, `lift_test_kg` (5% = clear change, MicroPulse rule).
- **Swaps:** heavy-leg swaps apply to all three; jump-squat swaps to Explosive power and Strength + power.
- **Lift lines:** `liftRx` reads them unchanged; body-weight jump squats get their own lines (no added weight,
  Cormie 2010a). The weakest-quality suggestion (`priority.ts`) stays with the four pitch goals.
- **Tests:** `__tests__/gymGoals.test.ts` (starts, youth, levels, power before strength, ≤90%, test weeks, golden
  hashes). The four pitch goals' golden hashes did not move.
- **What the research does not show** (on every plan): the dose trials were men, mostly not team sport, out of
  season, 3×/week; choosing by strength test + DSI is untested; strength-then-power blocks were not tested against
  power alone (Marshall 2021 is order within a session).

## Gym-only goals, step 2: delivery (2026-11-18)

The three gym-only goals are open: `OPEN_GOAL_QUALITIES` = all seven, so the player's picker, the request / start
routes and the team prefs route take them. Database checks widened by
`supabase/migrations/20261118091500_gym_only_goal_qualities.sql` (quality on `player_goal_plans` and
`team_quality_plan_prefs`, measure `imtp_nkg` / `lift_test_kg` on `player_goal_plan_results`; no data change).

- **Placement** (`today.ts` `rank`): both goal days use the coach's weekday plan when no match is near (MicroPulse rule):
  day 1 (A) on a strength day, then a power day; day 2 (B) on a power day for Explosive power and Strength + power,
  a second strength day for Maximal strength; light / rest last. In a match week: A from MD-4, B from MD-2 (`PREFS`),
  2 days apart, never MD / MD-1 / MD+1. The pitch goals are unchanged (the weekday plan still steers only their B).
- **Into the strength session** (`gymForSession.ts`): a gym-only goal merges whichever of its sessions is placed today;
  the pitch goals still merge B only. `GoalPlanGym.slot` → `PrescribedExercise.goalPlan.slot` → the Today item's
  `goalPlan.slot` (`toTodayStructure.ts`; absent = B on rows sent before). `goalPlanGym.ts` rules unchanged (in
  place of the matching lift, all or nothing, yellow half the sets, red none, in season nothing); its "why" line names
  "goal day 1 / 2".
- **Today card** (`today.ts`, `todayLoader.ts`): the card reads the slot the sent session holds
  (`goalGymInTodaySession`) and shows "In today's session" for that day; the automatic tick on finishing the strength
  session ticks that slot (a test-week day keeps its test on the card, so the player ticks it). Gym-only goals are
  named "Goal day 1 / 2" (pills "Day 1 / 2"). In season, or season not known, the card is the hold card: "your team
  strength session holds what you built", no session, nothing to tick. Season = `goalSeasonForTeam`: the coach's
  season-plan block (`resolveCurrentBlock`), else the week setup's season phase, by the same rule as the merge
  (`goalSeasonOf`). The 8-week count keeps running in season.
- **Results** (`progressLoader.ts`): mid-thigh pull read live from VALD (`vald_test_metrics`, IMTP relative peak
  force, trial mean, same windows as jump height); jump height for Explosive power and Strength + power. The lift test
  is typed by the coach on Goal requests (the form lists each plan's measures).
- **Copy:** player picker subs say "in the team gym session"; "What happens next" says two goal days inside the team
  strength session; "My goal" row names strength; PDF stat "Goal days a week · Inside the team strength session".
- **Not in step 2:** the coach's "Send to a player" in the Programme Library (Speed & power pills) still lists the
  four pitch goals only: the gym goals have no library page yet. Coaches approve them on Goal requests.
- **Tests:** `__tests__/gymGoalsDelivery.test.ts`.

## Next (not built)

- A push to players to tick sessions or book the retest: needs the coach's OK (nothing is sent to players today).
