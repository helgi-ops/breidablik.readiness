# Bar-speed (VBT) methods

The six "commonly used velocity-based training methods" from Weakley, Mann, Banyard, McLaren, Scott &
García-Ramos 2021, *Velocity-Based Training: From Theory to Application*, Strength Cond J 43(2):31–49,
Table 5. Data and wording: `src/lib/micropulse/vbtMethods/index.ts`.

| # | Plain name (key) | Sets / Reps / Weight | Coach sets |
|---|---|---|---|
| 1 | Set speed target (`set_avg_velocity`) | fixed / fixed / on the day | target speed; ±0.06 m/s window, 4–5% of max weight step |
| 2 | Speed zone + stop rule (`set_avg_velocity_vl`) | fixed / on the day / on the day | speed zone + speed drop |
| 3 | Start speed + stop rule (`target_velocity_vl`) | fixed / on the day / on the day | start speed or zone + speed drop; first rep off by >0.06 → 30 s extra rest, then 4–5% |
| 4 | Fixed sets + stop rule (`fixed_set_vl`) | fixed / on the day / fixed | speed drop |
| 5 | Total reps + stop rule (`fixed_total_reps_vl`) | on the day / fixed / fixed | total reps + speed drop |
| 6 | Stop rule + rep cap (`fixed_set_vl_rep_cap`) | fixed / on the day / fixed | speed drop + rep cap (optional start speed) |

- One stored shape, `VbtPrescription`, cleaned by `sanitizeVbtPrescription` (unknown method or missing
  number → null). `formatVbtForPlayer` gives the plain card (headline, ≤3 facts, steps, device note, cite);
  no "VL", "LVP" or "1RM" in player text; Icelandic uses a decimal comma.
- The app does not measure bar speed. The prescription is an instruction the athlete follows with their own
  device; every surface says so.
- Table 5 says the weight "is adjusted"; the direction (too fast → heavier, too slow → lighter) is our reading
  and is labelled as such (`LOAD_DIRECTION_NOTE`).
- Table 2 (bar speed at a one-rep max) is `V1RM_TABLE2`. It differs from `LV_EXERCISES` in
  `src/lib/lvProfile` (bench 0.15 vs 0.17, deadlift 0.18 vs 0.15), which cites another source; not aligned yet.
- The paper's caveat is shown with the library: predicting a max from bar speed is not accurate for free-weight
  squats and deadlifts.

Library: `/coach/vbt-methods`, also the "Bar-speed methods" tab of `/coach/programme-library` (football and PT).

## Where the coach picks it, and what the player sees

**Team (Strength hub → Training principles, `src/app/coach/strength-rules/page.tsx`).** One method per
block × phase, stored as `CoachBlockRule.vbt` inside `coach_strength_rules.rules` (no migration). The PUT
route and `applyBlockToSession` both sanitise it, so an incomplete pick is dropped. It travels on
`BlockEmphasis.vbt` → `strengthSessionToTodayStructure`, which puts a pre-localised `VbtPlayerCard` on blocks
with main lifts only (`blockTakesVbt`: compound strength, Olympic/explosive, ballistic). No new writer to
`player_today_strength_override`. The player's Today card shows a "Bar speed" strip (rule + up to two facts),
the steps under "How to perform", and the rule on the focus screen; the sent text replaces the per-lift
`stop @ −N%v` with the rule. The rule applies to every strength day of that block (no per-MD-day choice yet).

**PT (plan builder, `src/components/trainer/PlanBuilder.tsx`).** "+ Bar-speed method" on any exercise, stored
on the template exercise as `vbt`. Assigning the plan writes `individual_training_prescriptions.vbt` (migration
`20261112120000_prescription_vbt.sql`) after sanitising. The client sees the rule under the exercise on Today
(`/client`) and in the session runner (`/client/log`). Assigning also maps the plan builder's load types to the
DB vocabulary (`toDbLoadType`: kg → absolute_kg, %1RM → pct_1rm, RPE → rpe_target, velocity → null); before
this, a plan built with "kg" would have failed the `load_type` check constraint on assign.

Not built: checking measured bar speed after a set, turning a target speed into kg from a player's profile,
VBT on Custom Programmes, one shared set of velocity zones (four definitions still disagree).
Descriptive only; never the readiness colour, never a load decision.
