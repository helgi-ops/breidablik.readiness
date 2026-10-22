# Role-demand fit — validation on real data (before the UI ships)

Goal: confirm `roleModel.ts` + `roleDemandFit.ts` produce **coach-believable** output on real Breiðablik
players before building the card/roster. Run this after the lib + API exist, before wiring the UI. It's the
practical extension of the ship-gate in `role-demand-fit-spec.md`.

## Step 1 — build the real-data sample
Pick a spread that exercises the model (≥ 8 players, ≥ 4 positions incl. a wide, a central mid, a centre-back,
a striker). For each, pull from the live system:
- engine percentiles (athlete-profile source), IMA movement summary, output per-90 (`player_match_stats` /
  `player_season_stats`), position + sub-role.
Dump a table: `name, pos, subRole, engineFit, band, driverFit, outputRead, watchItem, confidence`.
Keep it as a fixture (`__tests__/roleDemandFit.realsample.json`) so re-runs are comparable.

## Step 2 — face validity (does it match what the coach already knows)
Eyeball the dump against coach intuition. It PASSES only if:
- The known athletic wingers/full-backs read **elite/solid**, not average.
- A centre-back with low top speed is **NOT** dinged for it (low speed-weight) — reads on robustness/aerobic.
- At least one genuine **mismatch** or **watch-item** appears (if everyone reads "elite", the model is
  flattering — bug, not a pass).
- Each `watchItem` is genuinely `high demand-weight AND low percentile` for that position (spot-check 3).

## Step 3 — discrimination + ranking
- `engineFit` must **spread** (not clustered 80–90). Report min/median/max and the distribution.
- Rank the squad by `engineFit` within one position and compare to the coach's own eye-ranking (informal). A
  broadly matching order = pass; wild disagreement = investigate weights or the percentile source.
- Sanity: no goalkeepers in the output; players with < N sessions/matches flagged low-confidence, not scored
  confidently.

## Step 4 — sensitivity + counterfactual
- Nudge one weight (e.g. winger aerobic 0.6 → 0.8) and confirm fit moves in the expected direction and size —
  not wildly. Confirms the demand-weighting actually drives the number.
- Counterfactual check: for a flagged player, "if {watch quality} were mid-tier → band improves" holds
  arithmetically.

## Step 5 — confidence + missing data
- Drop GPS for one player → verdict softens, confidence falls, UI would grey it (test the coverage path).
- Drop output for one player → Engine/Driver still read, Output tile shows "insufficient" (not zero).

## Step 6 — reconcile with the prototypes
The three rendered prototypes are the expected shape:
- an elite athletic winger ≈ Ágúst (≈ 85+, watch = aerobic/robustness),
- a box-to-box mid ≈ solid (~65, low speed NOT flagged),
- a mislabelled winger ≈ below (~48, role-change suggestion).
If real players in those buckets land far off, the weights or percentile mapping need a look.

## Step 7 — coach sign-off loop (the real acceptance test)
Show the Step-1 dump (or the roster prototype filled with real names) to Helgi / the coach. For each player:
thumbs up / down + a word. Any consistent disagreement → tune the position weights in `roleModel.ts` (it's
data, not logic) and re-run. **Two passes of this loop, ending in mostly thumbs-up, is the acceptance test** —
more than any unit test, because fit is a judgement the coach owns.

## Only after Steps 1–7 pass
Build `RoleDemandFitCard.tsx` + `RoleDemandFitRoster.tsx`. The lib is now trusted; the UI is just the layered
read on top. (Manifesto: rules decide — here the "rule" is the weighted fit, validated against the coach's eye —
and the card only explains it.)

## Guardrails during validation
- All read-only / descriptive; no writes into readiness or the daily decision.
- Keep the real-sample fixture out of any shareable/anonymised output (real names) — internal only.
- Log the weight version used per run so a tuning change is traceable.
