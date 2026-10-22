# Brief — Periodization Hub (Team Planning): data-driven macro / meso / micro cycles

**Goal:** a Team-Planning page where a coach builds a **season periodization plan — macro → meso →
micro** — that is generated from **this team's own data**, not a generic template. The system
**recommends** the structure and **tells the coach what data it needs** to make each part individual.
Modelled on the coach's own annual plan (`Annual Training.xlsx`) — a VBT, force-velocity-spectrum,
MD-anchored plan — but every number sourced from the squad's data instead of assumptions.

The coach's frustration with the spreadsheet was explicit: *"I built it with no data to follow."* Now the
data exists. This hub closes that loop.

## Why it's feasible now — the data is already there
Map of the coach's plan → existing tables (nearly everything he needs is in the system):

| Plan layer / row | Data source (existing) |
|---|---|
| Season phases, MD structure, taper | `match_schedule`, `team_matches`, `v_week_matches`, `match_player_minutes` |
| Season load curve, ACWR, deload timing | `player_external_load_daily` (HSR/IMA/PL/distance), `player_session_rpe`, `session_rpe_entries` |
| Block fatigue / push-vs-recover | `readiness_entries`, `v_coach_readiness_today_v8`, `readiness_levels` |
| Þolþjálfun (Type 1–5 interval **speeds** at VincTest/VIFT/MAS) | `player_cs_test` (Critical Speed), `player_running_test`, `player_fitness_test`, `player_test_personal_bests`, `submax_hr_test` |
| Styrktar/VBT (velocity ranges, %max, velocity-drop) | `gymaware_vbt_sessions`, `vald_test_metrics`, `vald_daily_player_snapshot` |
| Power / jumps / asymmetry (readiness to load) | `vald_forcedecks_results`, `vald_forceframe_results`, `vald_nordbord_results` |
| Micro weekly plan (MD+1 ISO, MD+3 Heavy, MD-2 Light…) | already built: `week_plans`, `v_week_plan_grid(_intent)`, `training_plan_templates`, `individual_training_plans`, `player_plan_items`, `coach_plan_rules`, `saved_sessions` |
| Position/player conditioning targets | role-demand fit + `player_peak_window` + Power Curve (this session's work) |

So the **micro (weekly) engine already exists**. This hub adds the **macro + meso layers on top** and the
**"recommend from the team's data"** intelligence, and ties them together in one view.

## Works for EVERY club — data tiers & graceful degradation (must-have)
The periodization framework needs **no expensive hardware**. It is built on the fixture calendar + any
load signal + readiness — so a Vector Core club (GPS only), or even an RPE-only club, still gets a real
data-driven plan. More hardware only enriches the *individualisation* and raises *confidence*; it is
never a gate on building the plan. Build the hub tier-aware from the start (reuse `catapultTier` /
`get_catapult_data_tier`), and let each layer degrade cleanly:

| Tier | What the club has | Periodization it drives |
|---|---|---|
| **Tier 0 — no GPS** (every club) | session RPE (`player_session_rpe`), check-in readiness, minutes | Full macro (fixtures) + meso (ACWR from **sRPE** = RPE × duration) + micro MD-structure + deload from sRPE + readiness. Individualisation = perceived load + minutes + any tests. |
| **Tier 1 — Vector Core** (GPS) | distance, **HSR** (velocity bands → 19.8 km/h works on Core), speed, accel/decel (`player_external_load_daily`) | Everything above, but load curve + ACWR from **real external load**, and HSR-based conditioning targets. **No IMA** → no directional/movement individualisation (hidden, not broken). |
| **Tier 2 — Vector Pro / ELITE** (IMU) | + IMA directional, RHIE, running symmetry | + movement-signature individualisation + robustness watch-items on top of Tier 1. |

**Cross-cutting add-ons, independent of Catapult tier** (a Core club can have these; a Pro club can lack
them): VALD force plates → strength/power caps; Critical-Speed / MAS tests → endurance interval speeds;
GymAware VBT → strength loads. Present → individualise; absent → fall back to squad default **and flag it
in the data-readiness panel** ("add a Critical Speed test to individualise his intervals").

Rule for Code: **never hide the plan behind a missing feed.** Show the layer with the best signal the
club has, label the confidence, and name what would unlock more — the same graceful-degradation pattern
already used for the LITE/Core surfaces (`LITE_HIDDEN_HREFS`, the imputed-verdict labelling). This is also
the honest workshop message: *every club can periodize from its data; the hardware just adds detail.*

## Three load axes — running is NOT enough; mechanical/IMA is first-class
Every target in the hub is expressed on **three axes**, not just running. GPS distance/HSR alone misses the
dimension where training actually *over-shoots* the match and where hamstring/posterior-chain risk lives:

1. **Running (Locomotive)** — total distance, HSR (>19.8 km/h), sprint distance, top speed. GPS.
2. **Mechanical / IMA** — the axis Figueiredo shows running **131–166% of match for accels / 108–134% for
   decels**, so it is the most easily overloaded and must be planned explicitly (Mechanical day-type).
   Use the **fuller IMA set already ingested** (`api.ts` free-running + running-mechanical params), not just
   accel/decel counts:
   - accel / decel counts + **Acc/Dec Band 2–3 efforts** (`accel_b2_3_tot_effs_gen2`,
     `decel_b2_3_tot_effs_gen2`, `decel_b3_plus_tot_effs_gen2`) — the high-intensity effort count;
   - **IMA Free Running bands** (`ima_fr_band1–8`: stride count, stride rate, player load, distance) — running
     mechanics per intensity band;
   - **Stride** metrics (stride count / rate / length) and **footstrikes** — impact / ground-contact load
     (bone-tendon), a fatigue + return-to-play signal;
   - **RHIE** (repeated high-intensity efforts: bouts + efforts/bout) — the repeated-sprint capacity axis for
     the work-capacity block;
   - **Change of direction** (COD left/right, high/med/low) and **running symmetry / deviation / imbalance** —
     directional load + **left/right asymmetry** (injury/fatigue flag);
   - **Metabolic power** (di Prampero) — captures the energy cost of accel/decel, a running↔mechanical bridge;
   - **the directional clock** (`ima_clock_gen2`, forward / backward / lateral) — the *shape* of the load.
   Buchheit's recent "closing the directional gap in run-based compensatory training" is exactly this: hitting
   the running metric while **missing the angles** — so plan the directional split and asymmetry, not just the
   count.
3. **Internal** — sRPE, HR (where present), readiness. Caps the external axes by how the player is coping.

**Tier handling for the mechanical/IMA axis (so it works for Core too, but is never dropped):**
- **Vector Pro (IMU):** the full set — IMA Free Running / stride, RHIE, running symmetry/footstrikes, COD
  L/R, the directional clock (`ima_clock_gen2`) → plan the *shape* and *asymmetry* of mechanical load (e.g.
  over-lateral, forward-deficient, or a left/right imbalance building).
- **Vector Core (GPS):** accel/decel **counts + Acc/Dec Band 2–3 efforts** (`*_b2_3_tot_effs_gen2`), sprint /
  HS efforts, and **metabolic power** are all GPS/Gen2-derivable — so the mechanical axis is still real and
  intensity-aware, just without the IMU stride/directional/symmetry breakdown (hide those panels, keep the
  accel/decel + effort-count targets).
- **RPE-only:** the mechanical axis rides on the drill-stimulus tag (Mechanical vs Locomotive) + perceived
  intent, not a measured count.

Rule: a running-only plan is incomplete. Show all three axes at the best signal the club's tier gives, and
**flag when a coach is loading running but neglecting the mechanical axis** (the common failure mode).

## The three layers

### Macro — the season map
- A season timeline anchored to the real fixtures (`match_schedule`). Auto-detect phase boundaries
  (pre-season / competitive / off-season) from fixture density and gaps; let the coach adjust.
- Overlay the **actual season load curve** (`player_external_load_daily`) so build-up and taper are the
  team's real trend, not a drawing.
- Recommend phase goals in the coach's own language (Accumulation → Transmutation → Realization) with a
  one-line rationale each ("6-week competitive block, 2 matches/week — maintenance + freshness").

### Meso — 4–6 week blocks
- Progressive-overload targets derived from the team's **own rolling load** — ramp the **training:match
  ratio (TMr)** sensibly week to week, with **deload weeks flagged** from the load + readiness trend.
  **Do NOT lean on ACWR as the target:** the club's own folder ("Time to Dismiss ACWR…") shows ACWR is a
  rescaling of acute load with no predictive advantage. Use acute-load trend + TMr + readiness; if ACWR is
  shown at all, label it a contested view, not the goal.
- Per block: primary goal (Max Strength / Strength–Power / Work Capacity — his structure), weekly volume
  targets, and the strength emphasis from `gymaware_vbt_sessions` (velocity ranges, %max) + endurance
  emphasis from `player_cs_test`/MAS.

### The match is the reference unit — pre-season multiplies it, in-season is constrained
Load targets are **expressed relative to the team's own match load**, not textbook numbers. The match is
the single greatest physiological stimulus, and across a normal week **~80% of the load comes from
training and ~20% from the match** (Teixeira et al. 2021, systematic review; the review lists the
`weekly-load / match-load` ratio as a monitoring metric). So the match is the unit, and the week is a
multiple of it — computed from the team's match-day load (`player_external_load_daily` on match dates).

- **Pre-season — build ABOVE the match, scaled by session count.** No competitive match "spends" load, and
  there are more sessions per week, so the weekly target is a **higher multiple of one match's load**,
  distributed across the number of training sessions the coach plans that week. Concretely: coach sets
  the week's session count (and enters friendlies as MD anchors, per below); the hub sets a weekly load
  target as a % of match (a supra-match capacity block) and splits it across the sessions on the
  MD-relative day-types. More sessions → the per-session dose drops; fewer sessions → each carries more.
- **In-season — you cannot freely multiply, especially for high-minute players.** The match already
  contributes its ~20% *and* is the hardest single day, and recovery caps what can be added. So a
  high-minute player's weekly target ≈ **match load + a modest, readiness-gated training increment**, not
  match × N. Low-minute players (`match_player_minutes`) are **topped up** to reach the same weekly team
  target — their match contribution is small, so the training add-on is larger. This is exactly why the
  same weekly number is easy to hit in pre-season and hard in-season for a starter: the hub must show the
  target as *match + headroom*, not a flat multiple, and cap it by readiness.
- **The multiplier is DIMENSION-SPECIFIC — this is the key refinement (Figueiredo et al.).** In a normal
  microcycle, relative to match: **accelerations run 131–166% and decelerations 108–134% (OVER match), while
  high-intensity runs are 36–61% and sprints 57–71% (UNDER match)** — wing-backs reach only ~64% of match
  sprint-peak. So a single "% of match" doesn't exist: **mechanical work (accel/decel) already exceeds the
  match in ordinary training; HSR and sprint fall well short.** The hub sets a **separate match-relative
  target per dimension** and flags a player carrying an **HSR / sprint deficit** going into a match. HSR is
  the one to protect and top up (Locomotive MD-4, pre-season friendlies), because training rarely reaches
  match HSR on its own.
- **Never stack HSR and mechanical work on the same day (hamstring).** When a tactical session already has
  high HSR, program mechanical (low-HSR) work that day, and vice versa — this is the rationale behind the
  Mechanical (MD-5) vs Locomotive (MD-4) split, and it protects the posterior chain (Buchheit-style HSR/MW
  programming; the club's `research/Football/` HSR-implementation papers).

**Defining the match unit per player (the coach's question — do you take all 80+ min matches?).** Yes,
near-full matches — but not one game, and not all appearances raw:
- **Filter to near-full matches** (default ≥ ~80 min, configurable; use `match_player_minutes`). A partial
  appearance under-represents true match demand, so it does not set the reference — but it is exactly what
  drives **top-up** need (a player who came on for 25 min is short of his match unit → top him up).
- **His position only**, over a **rolling window** (last ~8–12 weeks) so the unit reflects current form,
  not last season.
- Derive **two references, not one**: a **typical match** = the *median* of his near-full matches (the
  reference for weekly targets), and a **peak match** = his *max / ~90th-percentile* near-full match on each
  metric (the "worst case he must be prepared for" — the ceiling for capacity building). This mirrors the
  peak-window benchmark logic already in the system.
- **Per metric / per axis** (running, mechanical/IMA, internal) — his HSR unit, his accel/decel unit, his
  RHIE unit — because they don't scale together (§ dimension-specific above).
- Compute on **full-match totals** for the weekly multiple, but keep **per-minute** intensities too, so a
  partial match can still inform intensity even if it doesn't set the total.
- Small sample honesty: if he has fewer than ~4–5 near-full matches in the window, widen to the season or
  fall back to the position reference, and flag lower confidence (the data-readiness panel).

So "150% of match" = 150% of *his typical near-full match in his position over the last ~10 weeks*, per
axis — and it works on Vector Core (GPS) and on sRPE for RPE-only clubs.

### Micro — the week, ANCHORED TO MATCHDAY (MD)
Every micro number is **relative to the match**, not the calendar — this is the core requirement. Reuse
the day-type model already in `src/lib/drill-stimulus.ts` (Mechanical / Locomotive / Mixed / Technical)
plus the MD+ recovery types (Restart / Top-up), mapped to MD-relative days:

| MD day | Day-type | Emphasis (from drill-stimulus.ts) | Load shape |
|---|---|---|---|
| **MD+1** | **Restart** (played) / **Top-up** (played <30 min) | recovery / re-activation; Top-up adds a match-load dose for non-players | low; Top-up = medium |
| MD+2 | OFF / optional | — | off |
| **MD-5** | **Mechanical** | tight-space, high accel/decel — ASD prep | highest accel/decel |
| **MD-4** | **Locomotive** | open-space, high HSR — running capacity | highest HSR/distance |
| **MD-3** | **Mixed** | match-like stimulus, match-prep | peak overall load |
| MD-2 | **Technical** | low physiological load, both dimensions | taper down |
| MD-1 | **Technical** | activation only | lowest (pre-match) |

The **taper shape is set by the team's own MD-averages**, not a textbook curve: compute the squad's (and
each position's) typical load per MD-relative day from `player_external_load_daily` + `player_session_rpe`,
then the block scales them (progressive overload). The research backs this exact structure: **MD-1 is
significantly lower than MD-2/-3/-4 with a structured taper, and the load is position-specific** (Owen et
al. 2017); the **MD-relative distribution and congested-week variants (1-, 2-, 3-game weeks) shift the
whole micro** (Oliveira et al. 2019); and **ACWR / monotony / strain by position hold on sRPE *and* HSR**
— so the MD anchoring works on Core and RPE-only clubs too (Oliveira et al. 2021).

- **Congested weeks:** when two matches fall in one week (from `match_schedule`), collapse the micro to
  the 1-/2-/3-game-week template — the loading days between the two matches become recovery + short
  match-prep, not a full MD-5→MD-1 build (Oliveira 2019).
- **Individualise each MD day:** MD+1 isometrics; MD-4 Locomotive HSR at the player's own CS/MAS speed;
  MD-5 Mechanical accel/decel dosed to his tolerance; Top-up sized to the minutes gap
  (`match_player_minutes`); emphasis shifted by his role-demand watch-items.

### Pre-season — friendlies ARE the MD anchor
In pre-season there is no league match to anchor to, so **the coach inputs friendly / practice matches**
(`match_schedule` with a `friendly` flag). Each friendly then acts as MD-0, and the same MD-relative
numbers and day-types (Mechanical / Locomotive / Mixed / Technical, Restart / Top-up) build the week
around it — so a coach planning pre-season sees the load referenced to the next friendly, exactly as
in-season. Between friendlies (longer gaps), the block runs an accumulation micro (higher volume, more
Mechanical/Locomotive capacity days) until the next friendly pulls the taper back in. **No friendly
entered → the hub prompts the coach to add one** ("add your friendlies so the plan can anchor to MD"),
rather than inventing a match.

## Individualisation (the "would be great" part — and it's data-ready)
For each player, derive targets from **his own data**, not the squad default:
- **Endurance intervals:** interval speeds from `player_cs_test` / running test (his Type 1–5 targets in
  km/h, exactly as the spreadsheet intends — but per player, not one number).
- **Strength loads:** velocity ranges + %max from his `gymaware_vbt_sessions` profile.
- **Volume caps / readiness to load:** VALD asymmetry + CMJ trend + his readiness history → cap or green-
  light volume.
- **Emphasis from role-demand watch-items:** e.g. a player flagged for anaerobic reserve / mechanical
  power (this session's Power Curve read) gets more Type 4 / repeated-sprint + power work in the block.
- **Top-up:** players who played <30 min (`match_player_minutes`) get an MD+1/MD+2 top-up automatically.

## The system recommends — and says what's missing
A **"Setup & data readiness"** panel per player and per block, so the hub is honest about coverage:
- "To individualise his endurance, you need a **current Critical Speed test** — last one is 90+ days old
  / missing."
- "VBT profile is 45 days old — refresh for accurate strength loads."
- "No VALD data this block — volume caps fall back to squad default."
This is the manifesto's confidence idea applied to planning: recommend from what exists, and name the
gap rather than faking a number.

## Explainability & house rules
- The hub **recommends**; the coach **decides and overrides** (logged). Rules recommend, not AI. Targets are
  a data-anchored starting point, **never a norm to obey** — chasing GPS norms/load-management can itself
  cost performance (Little & Buchheit, "Slaves to (GPS) norms"). Frame every number as "your data suggests…",
  overridable.
- English default + Icelandic toggle; the coach's row labels (Þjálfunartímabil, Styrktarþjálfun,
  Hraðaþjálfun, Þolþjálfun) as the section language.
- **Never overrides the daily readiness colour** — periodization sets the plan; readiness modulates the
  day. Where they conflict (planned heavy day, red readiness), surface both and let the coach decide.
- Every recommendation cites its data source + a paper where relevant (his plan already leans on VBT +
  Type 1–5 interval models — carry those citations).

## Meso planning UI + comprehensive PDF report (coach's explicit ask)
- **Plan-ahead editor:** the coach schedules a **4–6-week mesocycle** ahead — set the session count per week
  (default 5), the friendlies/fixtures (MD anchors), the block goal, and the progressive-overload ramp
  (reuse the existing progressive-overload page; deload every ~4th week). The hub fills each week with the
  MD-anchored day-types and per-axis targets scaled from each player's match unit.
- **Export a detailed PDF report** of the block: a cover overview (team/player, phase, session count, the
  match unit, the weekly overload ramp per axis) + a **session-by-session breakdown of the whole month**
  (every session's day-type + the three-axis targets as % of match and absolute + focus), plus the honest
  notes (per-dimension caveat, HSR/mechanical not same day, top-up, Core fallback, recommend-not-dictate).
  A worked example already exists — `MicroPulse-Periodization-Manudur1-Demo.pdf` (Óli Valur, 5 sessions/week,
  4-week block from his real match unit) — match its structure. Individual (per-player) and team versions.

## Build shape
- New route `src/app/coach/periodization-hub/page.tsx` under Team Planning.
- A `season_plans` + `season_plan_blocks` table (macro/meso), linking down to the existing `week_plans`
  (micro). Save migrations under `supabase/migrations/`.
- Read-heavy: compose from the tables above; the weekly engine stays the source of truth for the micro.

## Acceptance
- For Breiðablik, the hub renders a season macro timeline from real fixtures + the real load curve, a
  meso block breakdown with a deload flagged from the data, and drills into the existing weekly grid.
- At least one fully individualised element works end-to-end (endurance interval speed from a player's
  Critical Speed test; strength %max from his VBT).
- The "data readiness" panel correctly flags a player with a missing/stale test. EN/IS toggle; lint clean.
- **All three axes render**, including the mechanical/IMA axis: on Pro the directional clock + RHIE +
  accel/decel targets; on Core the accel/decel counts (directional panel hidden, not broken); on RPE-only
  the Mechanical/Locomotive tag. The hub flags a plan that loads running but neglects the mechanical axis.
- **Tier check:** a Vector Core club still gets a full macro/meso/micro plan — GPS load curve + HSR +
  accel/decel targets present, IMA-directional/RHIE panels hidden not broken. An RPE-only club (no GPS)
  still builds the plan from sRPE + readiness. Confidence reflects the tier. Verify against a real Core club
  (e.g. Fylkir / Afturelding) — the plan renders, nothing errors on the missing IMU feed.

Ref: `Annual Training.xlsx` (the coach's model — match its structure + language),
`src/lib/drill-stimulus.ts` (the Mechanical/Locomotive/Mixed/Technical MD day-type model to reuse),
`player_cs_test` / `gymaware_vbt_sessions` / `player_external_load_daily` / `player_session_rpe` /
`match_schedule` / `match_player_minutes` / `v_week_plan_grid`, `docs/explainability-first.md`, the Power
Curve role-demand-fit + peak-window work (this session).

**Evidence base — full synthesis in `docs/research/football-periodization-evidence.md`** (the club's own
`research/Football/` folder + Buchheit blog). Key papers:
- **Figueiredo et al., Positional Differences in Peak- and Accumulated Training Load Relative to Match Load
  in Elite Football** — accel/decel OVER match (108–166%), HSR/sprint UNDER (36–71%); the dimension-specific
  multiplier + HSR deficit. (The most load-bearing paper for this hub.)
- Rago/Oliveira et al., Training:Match External Load Ratios (full-season) — TMr; higher in 5- vs 3/4-session
  weeks. Teixeira et al. 2021 review — ~80/20 training/match split; weekly:match ratio metric.
- "Time to Dismiss ACWR and Its Underlying Theory" — why the hub uses TMr + acute trend, not ACWR.
- Owen et al. 2017, *Int J Sports Sci Coach* 12(5):665–676 — mesocycle + positional load; MD-1
  significantly lower than MD-2/-3/-4, structured taper. (The MD taper shape.)
- Oliveira et al. 2019, *Physiol Behav* 201:146–156 — TL of 1-, 2-, 3-game weeks by days-from-match;
  load drops on MD-1 across all microcycles. (The congested-week variants.)
- Oliveira et al. 2021, *BMC Sports Sci Med Rehabil* 13:126 — in-season monotony, strain, ACWR from
  sRPE + TD + HSR by position across mesocycles. (ACWR/monotony on Core + RPE; positional.)
- Teixeira et al. 2021, *Int J Environ Res Public Health* 18:3906 — systematic review of accumulated
  training + match-load monitoring. (The monitoring framework.)
