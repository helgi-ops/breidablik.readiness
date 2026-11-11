# Fitness tests in the Periodization Hub

The hub and Conditioning use **one list of tests and one reading of results** (2026-11-11).

## One list

`AEROBIC_TESTS` in `src/lib/micropulse/periodization/testingSchedule.ts` is built from the shared registry
`FITNESS_TESTS` (`src/lib/micropulse/load/fitnessTests.ts`): the six aerobic tests Conditioning records.

| Test | Key | What the number gives the plan |
|---|---|---|
| 30-15 IFT (default) | `ift_30_15` | VIFT for %VIFT intervals; MAS from it is an estimate (× 0.86, Buchheit 2008) |
| Yo-Yo IR1 / IR2 | `yo_yo_ir1`, `yo_yo_ir2` | A distance: a capacity trend, no running speed |
| Beep test (20 m MSFT) | `msft_beep` | MAS from the final running speed |
| VAMEVAL / UMTT | `mas_vameval` | MAS directly |
| 4-min max run | `mas_run_4min` | MAS = distance ÷ 4 |

The coach picks the team's test on the hub's **Testing** tab. It is saved in `season_plans.overrides.aerobicTest`
(validated on POST; GET returns the loaded season's choice, else the newest season that set one, else 30-15 IFT).
The choice names the "Aerobic" chips, the protocols in the pre-season and block schedules, and Week setup's
"Testing this week" (`PreseasonStartWeekCard`). The three hand-written protocols (30-15, Yo-Yo IR1, VAMEVAL)
stay; the others are built from the registry text, so no protocol text is invented.

## One reading of results

`loadPeriodization` reads MAS through `resolveMas` (`load/speedZonesData.ts`, the same resolver as Conditioning's
speed zones): a measured MAS (VAMEVAL / beep / 4-min run, either store) beats a 30-15 estimate. Each player also
carries `latestTests` (latest result per test type, all nine tests) and `aerobicTestAgeDays` (freshest aerobic
test of any kind). "Due now" and the stale-test gap read `aerobicTestAgeDays`, so a fresh Yo-Yo counts as tested
even though it gives no speed. Pure helpers: `src/lib/micropulse/periodization/fitnessTestRead.ts`.

The Players tab shows the MAS with its test, age and an "estimate" tag, the latest tests, and the Conditioning
entry form (`FitnessTestCard`, preselected to the team's test); saving reloads the plan.

Not changed: `coach_test_schedule.test_key` stays `aerobic` (no migration); the readiness colour is never touched.

Before this change the hub read only `player_running_test` (4-min runs), so Demo Lite's 21 30-15 results gave
no MAS in the hub; now all 21 do. Breiðablik: all 17 current players with a test have a MAS (the store's other
3 players have left the squad).
