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
Descriptive only; never the readiness colour, never a load decision.
