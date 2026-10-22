# Claude Code task — count a transferred player's previous-club history for HIM, not for the team

Paste to Claude Code (or `@docs/tasks/previous-club-history-filter-claude-code-brief.md`).

## Why
When a player transfers in, we import his GPS history from his previous club so his individual
baseline / return-to-training / readiness norm work from day one. Those rows are tagged in
`player_external_load_daily.raw_payload_json` with `"previous_club": true` (and
`"club_era": "pre_breidablik"`). Real example applied in prod: Hlynur Freyr Karlsson
(`d9f1e2a0-2d3a-4624-b5c3-6e1039a0723f`, Breiðablik) — 29 sessions 2026-05-02 → 2026-07-05 from his
previous club (Catapult Core); his actual Breiðablik data starts 2026-07-08.

**The tag currently does nothing** — no query filters on it. So these sessions still leak into
Breiðablik team-level aggregates on dates before he joined. Fix: the flag must mean
"count for the player, not for the team".

## The rule
A row where `raw_payload_json->>'previous_club' = 'true'`:
- **INCLUDE** in the player's OWN surfaces: personal load history, ACWR / chronic baseline,
  return-to-training healthy baseline (`buildRttForPlayer` / `rttForPlayer.ts`), readiness personal
  norm, Player Game Report, Match Movement, `player/today-load` personal target — anything scoped to
  one player. (It's his real body data; his baseline needs it.)
- **EXCLUDE** from TEAM-level aggregates that roll multiple players together by date: the Today
  command center / daily briefing team totals, `buildLoadPlanForTeam` squad aggregation, team
  averages / "typical training day", Reporting Center team rollups, KSÍ team report, any
  "team Player Load today" style sums.

Rationale: he wasn't on Breiðablik on those dates, so his old-club sessions must not inflate
Breiðablik's team numbers — but they ARE his history for his own trend.

## Where to change
Grep team-level reads of `player_external_load_daily` that aggregate ACROSS players (not the
single-player reads):
```
grep -rn "player_external_load_daily" src/app src/lib src/components --include=*.ts --include=*.tsx
```
For each aggregation that sums/averages over a team's players by date, add to the query:
```
.not("raw_payload_json->>previous_club", "is", "true")   // supabase-js
-- or SQL: and (raw_payload_json->>'previous_club') is distinct from 'true'
```
Do NOT add this filter to per-player reads (baseline, RTP, personal history, game report).

Add a tiny shared helper so intent is explicit and consistent, e.g.
`src/lib/micropulse/load/previousClub.ts`:
```ts
// SQL fragment / predicate: a row that belongs to the player but not to the team's aggregates.
export const EXCLUDE_PREV_CLUB_SQL = "(raw_payload_json->>'previous_club') is distinct from 'true'";
export const isPrevClubRow = (r: { raw_payload_json?: Record<string, unknown> | null }) =>
  String(r?.raw_payload_json?.["previous_club"] ?? "") === "true";
```
Use it (or the supabase `.not(...)` form) at every team-aggregation site; filter in JS with
`isPrevClubRow` where the rows are already fetched.

## Likely sites to check (verify each)
- `src/lib/micropulse/loadPlan/forTeam.ts` — `buildLoadPlanForTeam` pulls the team's GPS window and
  the per-player rows feed both per-player targets AND any squad summary. Keep per-player use;
  exclude prev-club rows from any team/day rollup or "typical day" baseline.
- The Today command center / daily briefing team totals (dev-coach dashboard + `DailyBriefingCard`).
- Reporting Center, KSÍ report endpoint (`/api/coach/...ksi...`), any "team average distance/PL" card.
- Match Movement / Player Game Report are per-player → leave prev-club rows IN.

## Follow-up (optional, note for owner)
The jsonb flag is fine now; a cleaner long-term model is a real column
`player_external_load_daily.prior_club boolean default false` (or `source_team_id`), set at import,
with the same include/exclude rule. Migration + backfill from the jsonb flag. Do only if the owner
wants to harden it.

## Acceptance criteria
- Hlynur's pre-2026-07-08 sessions appear in HIS personal history / baseline / RTP / readiness norm,
  but do NOT appear in any Breiðablik team-level total or average for those dates (prove: a team
  per-day distance/PL sum for e.g. 2026-06-15 excludes his old-club row; his own 28-day baseline
  still includes it).
- The rule is applied via one shared predicate, not copy-pasted ad hoc.
- `npx tsc --noEmit` + `npx eslint` clean on touched files; stage specific files (no `git add -A`);
  user manages git checkpoints.
