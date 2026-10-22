# roleModel — position × sub-role demand weights (Code-ready seed)

Data for `src/lib/micropulse/roleModel.ts`, shared by Role-demand fit and Game-Plan Fit. Weights 0–1 = how
much the role physically demands each quality. Seeded from research; **coach-tunable per club** (store as data,
not hardcoded in components). Percentiles come from the existing athlete-profile source; qualities:
`speed, mechanicalPower, anaerobicReserve, reactivePower, peakDemands, aerobicEndurance, vbtPower, robustness`.

## Why sub-roles matter

Position alone under-specifies the demand. A **classic winger** (stay wide, beat man, cross) and an **inverted
winger** (cut inside, combine) have different driver signatures and slightly different demand. Same for
ball-playing vs stopper centre-backs, box-to-box vs deep-lying mids. So the model is keyed on
`position → subRole`, with `subRole = "default"` when unknown (falls back to the position baseline).

Also emit, per (position, subRole), the **driver archetype** the fit check compares the IMA signature against
(directional bias + accel/decel/CoD profile), and the **primary output metric** used for the output-confirmation
read.

## Weight table (seed)

| Position | Sub-role | speed | mech.pwr | anaerobic | reactive | peakDem | aerobic | vbt | robust | driver archetype | output metric |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Winger (WOP/WDP) | classic | 1.0 | 0.9 | 1.0 | 0.8 | 0.9 | 0.6 | 0.6 | 0.7 | high top-speed, straight-line, touchline bias | goals+assists, xG, successful crosses/dribbles |
| Winger | inverted | 0.9 | 0.9 | 0.9 | 0.9 | 0.9 | 0.6 | 0.6 | 0.7 | high CoD/decel, inside-cut bias | goals, xG, shots, key passes |
| Full-back | attacking | 0.9 | 0.8 | 0.9 | 0.7 | 0.9 | 1.0 | 0.6 | 0.7 | repeated up-down, high volume | progressive carries, crosses, OBV |
| Full-back | defensive | 0.8 | 0.8 | 0.8 | 0.7 | 0.8 | 0.9 | 0.6 | 0.8 | recovery-run heavy, decel | defensive actions, duels |
| Central mid | box-to-box | 0.6 | 0.7 | 0.7 | 0.7 | 0.8 | 1.0 | 0.6 | 0.8 | high-volume medium efforts, all directions | OBV, progressive passes, ball recoveries |
| Central mid | deep-lying | 0.5 | 0.6 | 0.6 | 0.6 | 0.7 | 0.9 | 0.6 | 0.8 | lower peak, positional | passes, progressive passes, interceptions |
| Central mid | advanced (#10) | 0.7 | 0.8 | 0.8 | 0.8 | 0.8 | 0.8 | 0.6 | 0.7 | burst + CoD in tight space | xG+xA, key passes, shots |
| Centre-back | ball-playing | 0.6 | 0.8 | 0.5 | 0.6 | 0.6 | 0.6 | 0.7 | 0.9 | low volume, jump/aerial | progressive passes, pass %, aerial win% |
| Centre-back | stopper | 0.7 | 0.9 | 0.6 | 0.7 | 0.6 | 0.6 | 0.8 | 1.0 | short sprints, aerial, physical duels | duels/aerials won, clearances, blocks |
| Striker | target/#9 | 0.8 | 1.0 | 0.8 | 0.8 | 0.8 | 0.6 | 0.8 | 0.8 | short bursts, hold-up, aerial | goals, xG, shots, aerials |
| Striker | mobile/runner | 1.0 | 0.9 | 1.0 | 0.8 | 0.9 | 0.7 | 0.6 | 0.7 | run-in-behind, top-speed | goals, xG, run-in-behind, sprints |

Notes: leave a `default` row per position = the more generic of its sub-roles. Weights are directional seeds —
the point is the *relative* profile (which qualities the role leans on), not exact decimals.

## Citations (attach per row / per quality)
- **Modric 2019** — position-specific relationship between running output and game actions (wingers: sprint
  r≈0.80; full-backs: decel r≈−0.43; centre-backs: accel r≈0.49). Justifies wide/forward = speed+anaerobic,
  centre = robustness/aerobic.
- **Ju 2022** — peak-period high-intensity demand by position: wide players (WDP/WOP) highest, centre-backs
  lowest. Justifies `peakDemands`/`anaerobic` weights.
- **Bradley & Ade 2016** — position- and sub-role-specific physical/tactical demands; integrated approach.

## Fit computation reminder (from role-demand-fit-spec)
`engineFit = Σ weightᵢ · percentileᵢ / Σ weightᵢ` (demand-weighted mean). Watch-item = quality with
`high weight AND low percentile`. Driver-fit = IMA signature vs the archetype above. Output read = primary
output metric vs position/league norm. Verdict + confidence per the spec.
