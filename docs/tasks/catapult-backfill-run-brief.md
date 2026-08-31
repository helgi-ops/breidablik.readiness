# Catapult backfill run — flow the new params (RHIE / running-symmetry / MII peak windows)

Operational runbook (not feature code — the mapping already ships). The newer Catapult params —
**RHIE** (repeated high-intensity efforts), **running symmetry/asymmetry**, and **MII peak-period /
rolling-window** metrics — are requested, parsed, and persisted end-to-end (`api.ts` →
`normalize.ts` → `sync.ts` / `miiPeakPeriod.ts`). They only *arrive* once the club enables them in
its **OpenField Reporting_Parameters**. This is how to confirm that and backfill history when it's on.

Descriptive load data only — the sync never reads or writes the readiness colour.

## The gate (why this is operational, not code)
Catapult returns a param **only if the org enabled it** in OpenField. So the sequence is always:
1. Club enables the params in OpenField (their action, not ours).
2. **Probe a recent date** to confirm Catapult now returns them non-zero (below).
3. **Backfill** the desired range.
4. **Verify** the columns persisted.
Running the backfill before step 1 just re-writes rows with the params still absent — harmless, but pointless.

## Step 0 — env / preconditions
- `CATAPULT_TEAM_ID` set (or the team's row-stored config) — GPS sync stalls silently without it
  (see `catapult-team-id-env-required.md`). Per-team creds resolved via `getConfigForTeam(teamId)`.
- Auth for the endpoints below: EITHER `CATAPULT_CRON_SECRET` (header `x-cron-secret:` or `?secret=`),
  OR a COACH bearer token (`getCoachContext` — the coach's `profiles.team_id` is the default team).
- Know the `teamId` to backfill (defaults to the caller's team; pass `teamId` to target another).

## Step 1 — confirm the org enabled the params (probe, read-only)
Pick a date with a known session. These probes call Catapult live and report what it actually returned.

```bash
# RHIE / running-symmetry / IMA / effort fields for one date:
curl -s "$APP/api/integrations/catapult/debug-fields?date=2026-08-30&teamId=$TEAM" \
  -H "Authorization: Bearer $COACH_JWT" | jq

# MII / rolling peak-window availability (ROLLING_PEAK_KEY verdict):
curl -s "$APP/api/integrations/catapult/debug-peak-period?date=2026-08-30&teamId=$TEAM" \
  -H "Authorization: Bearer $COACH_JWT" | jq
```
- `debug-fields` aggregates the candidate field names — **non-zero** RHIE / running-symmetry values =
  the org enabled them. All-zero / absent = not enabled yet → stop, tell the club to turn them on.
- `debug-peak-period` returns a plain verdict on whether a true rolling peak-window param
  (`peak/max/rolling/worst` × `1/2/3/5/10-min` or `30/60/90/300-s`) is present. AVERAGE-rate fields do
  NOT count (they are not a rolling peak).

## Step 2 — run the backfill
Idempotent: both paths call `syncCatapultDailyMetrics` per date (upsert on player+date), so a re-run
overwrites the same rows — safe to repeat. Manual GPS rows are NOT touched (source='manual' wins; see
`manual-gps-overrides-catapult.md`).

**Prod (coach-auth or cron secret) — the range route:**
```bash
curl -s -X POST "$APP/api/integrations/catapult/backfill?secret=$CATAPULT_CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"teamId":"'"$TEAM"'","dateFrom":"2026-06-01","dateTo":"2026-08-31"}' | jq
# → per-date [{date, status, stored, warning?}]; watch for status!="ok" or stored=0 on a training day.
```

**Dev / localhost — the day-loop script** (posts `{date}` to `daily-sync` for the last N days;
needs the dev server running and no `CATAPULT_CRON_SECRET` set, else add the `x-cron-secret` header):
```bash
bash scripts/backfill-catapult.sh 90 http://localhost:3000
```

Backfill wide but sane — the season to date is typical. Large ranges are many Catapult calls; if it
rate-limits, chunk the range (e.g. month by month) and re-run — idempotency makes overlap free.

## Step 3 — verify it persisted
```sql
-- New running-mechanical params landed. Columns (verified): rhie_bouts,
-- rhie_efforts_per_bout_{mean,min,max}, rhie_effort_duration_mean_s,
-- rhie_effort_recovery_mean_s, rhie_bout_recovery_mean_s, running_symmetry, footstrikes.
select count(*) filter (where rhie_bouts is not null)       rhie_rows,
       count(*) filter (where running_symmetry is not null) sym_rows,
       count(*) filter (where footstrikes is not null)      footstrike_rows
from player_external_load_daily
where team_id = '<TEAM>' and date between '2026-06-01' and '2026-08-31';

-- MII peak-period rows written (storePeakPeriodRows → player_load_peak_period).
-- NB: this table's date column is `date` (not session_date).
select count(*) peak_rows, count(distinct player_id) players
from player_load_peak_period
where team_id = '<TEAM>' and date between '2026-06-01' and '2026-08-31';
```
Non-zero where you expect training days = success.

## Guardrails
- Descriptive only — no readiness-colour read/write anywhere in the sync path.
- Idempotent upsert; safe to re-run and to overlap ranges. Never `git add -A` if you commit a helper.
- If values are still zero AFTER a confirmed-enabled probe, it's an OpenField param-name mismatch, not a
  bug here — add the alias in `api.ts` (`CATAPULT_RUNNING_MECHANICAL_PARAMETERS` /
  `CATAPULT_PEAK_PERIOD_PROBE_PARAMETERS`) and re-probe; do not fabricate values.
- This backfill unblocks the consumers already built: peak-period / mechanical-power reads, the
  movement-signature path, and (once IMA present) the IMA-clock cards — but it changes no verdict.

## Where these surface once flowing
`player_load_peak_period` → Peak Period + Mechanical Power reads and `/coach/power-curve-intelligence`
(peak curve); `rhie_*` / `running_symmetry` → robustness inputs (running-asymmetry, RHIE). All beside
the colour, never it.

Ref: `src/lib/integrations/catapult/{api,normalize,sync,miiPeakPeriod}.ts`,
`src/app/api/integrations/catapult/{backfill,daily-sync,debug-fields,debug-peak-period}/route.ts`,
`scripts/backfill-catapult.sh`, `catapult-new-params-mapping.md`, `catapult-team-id-env-required.md`.
