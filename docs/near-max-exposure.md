# Top speed due — days since a run at 90% of top speed

A Today coach signal (`near_max_exposure`) that names players who have not reached 90% of their own top speed
for a while. Beside the readiness colour, never it. Code: `src/lib/micropulse/nearMaxExposure/`
(`index.ts` pure rule, `signalLoad.ts` team read), copy in `coachSignals/index.ts`
(`deriveNearMaxTeamSignal`, `derivePlayerNearMaxSignals`).

## The rule

| | |
|---|---|
| Speed of the day | higher of `max_velocity` / `max_vel` (km/h), best row of the day, all GPS feeds, previous-club rows included |
| Measured day | 10–38 km/h. A day with Player Load but under 200 m (indoors, no GPS) is **unmeasured**: neither a run nor "no run" |
| Top speed | third-fastest measured day in the last 12 months (needs 10 days); a measured `sprint_max` test wins when higher |
| A run that counts | a day at ≥ 90% of top speed |
| Due | more than 10 days since the last one |
| Long gap | more than 21 days ("build back in steps, not straight to a flat-out sprint") |

Not flagged: goalkeepers; players whose `player_injuries.status` is injured / rehabilitation / rtp_training;
players with no measured GPS day in the last 10 days (away, off-season, indoors only: unknown is not overdue).
A player in a sustained HIGH sprint-speed drop does not get "due" (that signal says avoid flat-out sprints);
a long gap is still shown.

## Why 10 and 21 days

No study gives a day count:

- Malone et al. 2017 (J Sci Med Sport 20:250–254, elite Gaelic football): >95% of max velocity at least once
  in training → lower injury risk than <85%; under- and over-exposure both raise risk. Weekly unit.
- Buchheit, Settembre, Hader & McHugh 2023 (Biol Sport; 627 players, 96 match hamstring injuries): no match
  hamstring injuries when >95% exposures happened at D-2. Observational.
- Edouard et al. 2019 (Sport Perform Sci Rep 48): sprinting as a "vaccine" for hamstring injury.

The marks are the coach's choice (12 Nov 2026) on Breiðablik's 2026 season: 23 players, 627 player-days at
≥90%; median gap between such days 5 d, 75% of gaps ≤ 9 d. Third-fastest day rather than the best day because
one GPS spike sets the best day (median best 32.4 km/h vs third-best 31.2; one player's best is 37.9).

Replay with the real loader (`scripts/validate-near-max-signal.ts`, May–Oct 2026, every 3rd day): 4.2 players
flagged per day, 1.5 of them in a long gap, nobody flagged on 5% of days; 20 players flagged at some point, the
most-flagged on 45% of days. Off-season (no GPS since 24 Oct) → nobody flagged.

## What the coach sees

- Team chip "Top speed due": "4 haven't reached 90% of top speed in 10+ days: Ari (23 d), Jón (12 d) …".
- Per-player pill on the attention row for both marks: "Last at 90% of top speed: 12 days ago (29.4 km/h that
  day)"; a long gap adds the build-back line.
- Counterfactual: "A run at 28.1+ km/h resets this: 90% of a 31.2 km/h top speed (3rd-fastest GPS day in 12
  months)", then the evidence and "advisory, never the readiness colour".
- Confidence: high when top speed rests on 30+ measured days or a sprint test, else moderate.

## What the player sees

The same reminder on the player's own Today (`PlayerTopSpeedDueCard`, in the signal slot under the session),
only when flagged. Route `/api/player/near-max` (self-scoped) → `loadPlayerNearMax` → `formatNearMaxForPlayer`
(`nearMaxExposure/playerCopy.ts`).

- One sentence: "12 days since you last ran near your top speed."
- Facts: the last such run (speed and date), the speed that counts, and "Your coach sees this reminder too and
  decides when a fast run fits the week." After a long gap: build back over a few sessions, not straight to a
  flat-out sprint. The card never tells a player to go and sprint alone.
- How sure, then "Behind the numbers": where the top speed comes from, indoor days, the studies, and "It does
  not change your readiness colour."

Same read as the coach: `loadTeamNearMaxSignals` and `loadPlayerNearMax` share `loadRosterReads`, and the
player read applies the sprint-speed-drop rule too. `scripts/validate-near-max-signal.ts --parity <date>`
compares the two for a whole team (0 differences on four Breiðablik days and on HK). A FREE club's players get
no card, because their coach does not see the signal either. No push or email is sent.

Not built: a notification to the player, a planned-week suggestion (e.g. MD-3), a 95% mark.
`resolveMss` (speed zones) still uses the all-time best day, so the Movement card's top speed can be a little
higher than the top speed this reminder uses.

## Related fix (same day)

The "Sprint speed drop" pill showed speeds 3.6× too high ("102.9 vs 117.8 km/h"): stored speeds are km/h but
were multiplied as if m/s. The drop % was always right. Fixed in `sprintSpeedDrop/index.ts` (`roundKmh`),
`coachSignals/index.ts` and the inline Today computation in `DevCoachDashboardClient.tsx`.
