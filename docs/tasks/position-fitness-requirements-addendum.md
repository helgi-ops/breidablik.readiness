# Addendum — position-fitness-requirements brief (quality-mapping corrections)

Verified against the live code after the brief was handed to Code. Two things to get right; one trap.

## Confirmed QualityId set (athleteProfile.ts)

`speed · acceleration · deceleration · reactive_power · max_strength · vbt_power ·
change_of_direction · work_capacity · mechanical_power · peak_demands · aerobic_endurance ·
anaerobic_reserve · robustness`

**No new QualityId is needed.** The role-demand weights (`roleModel.ts` — `ROLE_DEMAND_FIT` per JuGroup,
and `GAME_PLAN_ROLE_DEMAND`) already reference exactly these ids, and each has a position percentile in
`AthleteProfile`. So the per-quality pass/fail is a presentation layer over percentiles that already
exist — do not add profile qualities.

## Fitness-test → quality mapping (use these, exactly)

| Test-derived value | Maps to existing quality | Notes |
|---|---|---|
| **MSS** (max sprint speed / GPS top speed) | **`speed`** | `speed` = "top running speed reached in games" — that IS measured MSS. Use its position percentile for the MSS pass/fail. |
| **MAS / Critical Speed** | **`aerobic_endurance`** | Already fed by `fitnessTestSignals.ts` (MAS→CS, 0.875). |
| **D′** (distance reserve above CS) | **`anaerobic_reserve`** | Already computed from the GPS power curve. |

## THE TRAP — ASR ≠ `anaerobic_reserve`

`anaerobic_reserve` in the profile is **D′ — a DISTANCE reserve (metres) above Critical Speed**. The
**ASR** from the speed-zones work is **MSS − MAS — a SPEED reserve (km/h)**. They are different
constructs. **Do NOT map ASR onto `anaerobic_reserve`.**

Handle ASR as a **derived reference read** (`computeAnaerobicSpeedReserve` in `criticalSpeed.ts`) shown
alongside — it explains *why* a player passes/fails the `speed` requirement (a big ASR means room above
his aerobic pace), but it is not itself a position-percentile pass/fail. The three pass/fail rows that
carry the fitness-test signal are `speed` (MSS), `aerobic_endurance` (MAS/CS) and `anaerobic_reserve`
(D′); ASR is context next to `speed`.

## Which demand table

Use **`resolveRoleFit(juGroup, subRole).demand.weights`** (the richer JuGroup/sub-role model in
`ROLE_DEMAND_FIT`) — the same source `roleDemandFit.ts` uses — not `GAME_PLAN_ROLE_DEMAND`. Keeps this
card consistent with the RoleDemandFit card it sits inside.

## Elite reference values — keep honest

Well-established positional match facts to anchor the elite column (cite in the card):
- **Max sprinting speed** is highest for wide players (FB/wingers) and forwards, lowest for centre-backs
  and central midfielders (Di Salvo 2007; Djaoui 2017; Haugen 2014 on sprint by level).
- **High-intensity / high-speed running** highest for wide midfielders + fullbacks, lowest for
  centre-backs (Di Salvo 2007/2009; Bradley 2009).
- **Total distance / aerobic demand** highest for central midfielders (Di Salvo 2007; Bradley 2009).

Exact elite **MAS/ASR by position** are not cleanly established across studies — keep those as tunable
ranges (`provisional: true`) with squad/league-relative as the primary pass/fail, elite as aspiration.
Don't present a single MAS-by-position number as authoritative.

## Net effect

The feature is mostly presentation over data that already exists: existing position percentiles ×
existing role weights, with the fitness-test values (`speed`/MSS, `aerobic_endurance`/MAS,
`anaerobic_reserve`/D′) surfaced as meets/below/above, ASR as context, elite as a labelled reference.
No new quality, no readiness coupling.
