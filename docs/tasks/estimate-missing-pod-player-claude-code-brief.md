# Claude Code task — "Forgot pod?" one-tap estimate for a missing player

Paste to Claude Code (or `@docs/tasks/estimate-missing-pod-player-claude-code-brief.md`).

## Goal
When a player plays a match but forgot / didn't wear a GPS pod, let the coach fill that player's
match with an **estimate in one tap** instead of typing numbers. The estimate = **that player's
own match average, pro-rated by the minutes he played** (fallback: squad average for the match).
Both GPS and IMA columns get filled. Rows are clearly marked as estimates.

This productises a manual process that works today (proven in prod): the estimate for a
90-minute high-volume player must reflect HIS profile (e.g. ~10.5 km, 353 sprint m), not the
squad average — so per-player baselines are essential.

## UX
Best home: the **match-minutes page** (`src/app/coach/match-minutes/page.tsx`) — the coach already
sets who played and their minutes there. For each rostered player with **no GPS row** on the
match date, show a small "Forgot pod? Estimate" action. Flow:
1. Coach confirms/enters minutes played (already the page's job).
2. Tap **Estimate** → the row is created and the player appears in the match (Game Report /
   Match Movement) with an **"est."** badge.
3. Tap again / a "remove estimate" affordance deletes it (in case it was a mistake or real data
   arrives). Also expose "estimate all missing" for convenience.

## Estimation algorithm (server-side)
Given `(player_id, team_id, match_date, minutes)`:
1. **Personal baseline** = average of that player's real (non-estimated) match rows in
   `player_external_load_daily` (source='catapult'). Define "match rows" as dates in the team's
   `match_schedule` ∩ the player's GPS dates (preferred). Fallback if <3 matches: his sessions
   with `total_distance > 7000` (a full-match proxy). Fallback if still none: **squad average**
   = average of the pod-wearers on THIS `match_date`.
2. Build the row:
   - **Cumulative columns** (distance, HSR, sprint, velocity-band distances/efforts, tot_as/ds,
     accel_decel_efforts, total_player_load, ima_accel/decel/cod/total, ima_band*_count,
     ima_cod_left/right_*, high_metabolic_load_distance_m, metabolic_energy_kj): `baseline * minutes/90`.
   - **Peak / rate columns** (max_velocity, max_vel, max_acceleration, max_deceleration,
     player_load_per_minute): use the baseline value **as-is** (do NOT scale by minutes — peaks
     don't scale linearly). Use the player's *average* peak, not his season max (avoid overstating).
   - `source='catapult'`, `activity_count=1`, `session_duration_minutes=minutes`.
   - `raw_payload_json = { estimated:true, method:'personal_match_avg_pro_rated_by_minutes',
     fallback:'squad_avg', minutes, entered_by:<coach user id> }`.
   - `coalesce(personal_col, squad_col)` per column so thin-history players still get a value.
3. Upsert `player_external_load_daily` on `(player_id,date,source)`, and upsert
   `match_player_minutes (player_id, team_id, match_date, minutes_played, is_dnp=false)`.
The exact SQL that produced correct results is in
`docs/tasks/…` history / this session — mirror it (personal LATERAL avg + squad CTE fallback,
`round()` counts to 0 dp, distances/load to 1, peaks to 2).

## API
Add `POST /api/coach/estimate-pod` (service-role, `nodejs` runtime) with body
`{ teamId, playerId, matchDate, minutes }`. Auth: require the caller to be staff AND coach of
`teamId` — reuse the `coaches_team()` / `is_elevated_staff()` model (see
`supabase/migrations/20260704130000_team_scope_coach_week_setup_writes.sql`) or the existing
coach-team auth helper used by other `/api/coach/*` routes. Also add `DELETE` (remove an estimate:
delete the `player_external_load_daily` row where `raw_payload_json->>'estimated'='true'` for that
player+date; leave real rows untouched).

## Honesty / explainability (required — this is estimated data)
- Every estimated row MUST carry `raw_payload_json.estimated=true`. Surfaces that show the player
  (Player Game Report, Match Movement, share card) must render a small **"est."** badge and, on
  tap, "Estimated from <player>'s match average × <minutes> min — not a pod measurement." Never
  present an estimate as a real Catapult reading. This is manifesto principle #1 (provenance).
- **Real data wins.** If the Catapult sync later brings a real row for that player+date, it must
  overwrite the estimate (ensure the daily-sync upsert on `(player_id,date,source)` REPLACES, not
  `do nothing`). Optionally: after a sync, auto-clear any estimate that now has real data.
- Exclude estimated rows from anything that computes baselines/PBs/season-bests
  (`… where raw_payload_json->>'estimated' is distinct from 'true'`) so estimates never feed
  future estimates or personal records.

## Edge cases
- Player already has a real row for the date → hide the Estimate button (nothing to estimate).
- No pod-wearers on the match date AND no personal history → can't estimate; disable with a
  tooltip ("need at least one pod on this match, or match history for this player").
- Minutes missing/0 → require minutes before estimating.

## Files (suggested)
- `src/lib/micropulse/estimatePod.ts` — pure-ish builder: given baselines + minutes → the row
  object (+ unit test with a known personal avg and 60 min → half the cumulative, same peaks).
- `src/app/api/coach/estimate-pod/route.ts` — POST/DELETE, auth, the LATERAL/squad SQL.
- `src/app/coach/match-minutes/page.tsx` — the per-player "Forgot pod? Estimate" button + est. badge.
- Add the "est." badge read (`raw_payload_json->>'estimated'`) to the player game report / match
  movement player rows.

## Acceptance criteria
- On a match where a player has no pod row, entering his minutes and tapping Estimate creates a
  row that matches his personal profile scaled by minutes (verify: a 90-min high-volume player ≈
  his match average; a 30-min player ≈ ⅓ of cumulative, same peak speed).
- Estimated players appear in Game Report / Match Movement with an "est." badge; real players have
  no badge.
- Estimates are team-scoped (a coach can only estimate for their own team's players).
- Estimates are excluded from baseline/PR calculations; a later real sync overwrites the estimate.
- `pickHeroStat`-style unit test for the builder; `tsc`/`eslint` clean; stage specific files (no
  `git add -A`); no schema change expected (uses `raw_payload_json`).
