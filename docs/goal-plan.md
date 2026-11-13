# Goal plans ("I want to improve my top speed / acceleration / braking / jump")

Status: **lota 1 + 1b + 2 shipped 2026-11-13.** A player can ask; the coach approves, changes the start or declines.
The approved plan does not reach Today yet (lota 3). Nothing is sent (no push, no email).

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
| `player_goal_plans` | status `requested → approved / declined / cancelled` (paused / completed reserved for lota 3–4), proposal, frozen plan, start override, dates, notes, reason |
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

## Next (not built)

- Lota 3: Today card for the player, day placement, pause on injury/RTT, lighter version on yellow.
- Lota 4: retests, end of plan, restart, PDF. Idea: `max_deceleration` from Catapult as a direct braking outcome
  (Marvin 2024 notes GPS decelerations are the only direct braking measure in the literature).
