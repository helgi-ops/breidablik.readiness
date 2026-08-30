# Runbook — verify the nightly RPE-imputation cron (without waiting for 23:00)

**What this covers:** how to prove the nightly RPE-autofill cron will run clean, on demand,
without waiting for it to fire or mutating production data.

## The cron path

- Schedule: `vercel.json` → `{ "path": "/api/notifications/rpe-autofill", "schedule": "0 23 * * *" }` (23:00 UTC daily).
- Target date: `resolveTargetDate()` in [`src/app/api/notifications/rpe-autofill/route.ts`](../../src/app/api/notifications/rpe-autofill/route.ts)
  returns **today** unless the run fires **before noon Iceland** (`APP_TZ`, UTC+0) — then **yesterday**
  (lag-aware: a cron that slips past midnight must not autofill the new day before players check in).
- Two passes, in order:
  1. **Pass 1 `auto_fill`** (route TS): for every non-OFF team with ≥1 real submission that day,
     insert the **team average** for each **non-GPS** player with no row yet (`source='auto_fill'`,
     `is_imputed=false`). GPS-trained players who forgot RPE are **deferred to Pass 2**
     (`status: deferred_to_pass2`, `gps_deferred` / `total_gps_deferred` counters).
  2. **Pass 2 `imputed`** (`fn_impute_team_day` → `fn_impute_missing_rpe`): GPS-trained players
     (`player_external_load_daily.total_distance > 0`) get a per-player, MD-day-aware
     estimate — same-MD-tag median → 10-day median → day's real team average (`is_imputed=true`).

Both passes compute their **baselines over REAL submissions only** (`source is distinct from 'auto_fill'`,
and never `imputed`). Neither pass ever reads or writes the readiness colour.

### The one invariant that matters

A player must **never** end a night with two rows for the same session date (e.g. an `auto_fill`
row *and* an `imputed` row). Pass 2's "who still needs imputing" check therefore skips anyone who
already has any `is_imputed = false` row — real submission **or** a Pass-1 auto_fill. (History
`20260830120000` briefly excluded auto_fill from that existence check too, which risked a double row;
`20260830130000` restored it. Excluding auto_fill from the *baseline math* is correct and stays.)

## The verification (read-only, self-rolling-back)

Run this one block against the DB. It replays **both passes** for the cron's target date, counts the
things that must be zero, then `RAISE`s so the whole transaction rolls back — **nothing persists**.
Read the numbers straight out of the error message.

Set `v_target` to what `resolveTargetDate()` would return right now (today, unless it's before noon
Iceland → yesterday).

```sql
do $$
declare
  v_target date := current_date;   -- or current_date - 1 if verifying a pre-noon-Iceland run
  v_autofill int := 0;
  v_imputed int := 0;
  v_collisions int := 0;
  v_dupany int := 0;
  r record;
  imp jsonb;
begin
  -- Pass 1: auto_fill missing NON-GPS players on submitting non-OFF teams. GPS-trained
  -- players are deferred to Pass 2 (the extra not-exists on player_external_load_daily).
  insert into session_rpe_entries (player_id, team_id, session_date, session_type, session_name, duration_minutes, rpe, source, is_imputed)
  select p.id, p.team_id, v_target, 'team_training', 'Auto-fill (team average)', ta.avg_dur, ta.avg_rpe, 'auto_fill', false
  from players p
  join (
    select team_id,
           round(avg(rpe)::numeric,1) as avg_rpe,
           greatest(1, least(300, round(avg(duration_minutes))::int)) as avg_dur
    from session_rpe_entries
    where session_date = v_target and is_imputed = false
      and source is distinct from 'auto_fill' and source is distinct from 'imputed'
    group by team_id
  ) ta on ta.team_id = p.team_id
  where not exists (select 1 from session_rpe_entries s where s.player_id = p.id and s.session_date = v_target)
    and not exists (select 1 from player_external_load_daily el
                    where el.player_id = p.id and el.date = v_target and el.source = 'catapult' and el.total_distance > 0)
    and not exists (select 1 from week_plans wp where wp.team_id = p.team_id and wp.day_date = v_target and wp.day_type = 'OFF');
  get diagnostics v_autofill = row_count;

  -- Pass 2: fn_impute_team_day per non-OFF team (imputes readiness + RPE).
  for r in
    select distinct team_id from players p
    where p.team_id is not null
      and not exists (select 1 from week_plans wp where wp.team_id = p.team_id and wp.day_date = v_target and wp.day_type = 'OFF')
  loop
    imp := public.fn_impute_team_day(r.team_id, v_target);
    v_imputed := v_imputed + coalesce((imp->>'rpe_imputed')::int, 0);
  end loop;

  -- must-be-zero invariants
  select count(*) into v_collisions from (
    select player_id from session_rpe_entries where session_date = v_target
    group by player_id having count(*) > 1 and count(*) filter (where source='imputed' and is_imputed) > 0
  ) x;
  select count(*) into v_dupany from (
    select player_id from session_rpe_entries where session_date = v_target
    group by player_id having count(*) > 1
  ) y;

  raise exception 'SIMDONE target=% pass1_autofill=% pass2_rpe_imputed=% imputed_collisions=% any_dup_playerdays=%',
    v_target, v_autofill, v_imputed, v_collisions, v_dupany;
end $$;
```

### Reading the result

The block always ends in an error whose message is the report, e.g.:

```
SIMDONE target=2026-08-30 pass1_autofill=20 pass2_rpe_imputed=0 imputed_collisions=0 any_dup_playerdays=0
```

- **`imputed_collisions = 0` and `any_dup_playerdays = 0`** → clean. This is the invariant.
- `pass1_autofill` / `pass2_rpe_imputed` are informational (how much each pass fills). Since Pass 1
  now defers GPS players, a healthy night typically has **`pass2_rpe_imputed > 0`** — those are the
  GPS-trained forgetters getting their per-player MD-day estimate. `pass1_autofill` covers only the
  non-GPS missing players.
- `pass1_autofill > 0` with `imputed_collisions = 0` is the proof the hardened existence check holds:
  the auto_filled players are **not** re-imputed.
- Optional: break down which method the Pass-2 rows resolved to by aggregating `imputed_method`
  (`player_md_tag_median` / `player_rolling_10d_median` / `team_session_average`) on the newly
  inserted rows before the RAISE — the more `player_md_tag_median`, the more the day-awareness bit.

### Confirm nothing leaked

The `RAISE` rolls the simulation back, but confirm the target day has no fabricated rows yet (it should
be pre-cron):

```sql
select count(*) filter (where source in ('auto_fill','imputed')) as fabricated_today
from session_rpe_entries where session_date = current_date;   -- expect 0 before 23:00 UTC
```

## Last run

- **2026-08-30** (after the GPS-defer change, MD-1) — target `2026-08-30`; `gps_deferred=7`,
  `pass1_autofill=13`, `pass2_rpe_imputed=7`, `imputed_collisions=0`, `any_dup_playerdays=0`;
  6 of the 7 resolved to `player_md_tag_median` (their own usual MD-1 value), 1 to team average.
  0 rows leaked. Clean.
- **2026-08-30** (before the GPS-defer change) — `pass1_autofill=20`, `pass2_rpe_imputed=0`,
  `imputed_collisions=0`, `any_dup_playerdays=0`. Clean, but the 7 GPS forgetters got the flat team
  average — the reason Pass 1 now defers them.

## Related

- Migrations: `supabase/migrations/20260830120000_rpe_impute_md_day_aware.sql`,
  `supabase/migrations/20260830130000_rpe_impute_existence_check_fix.sql`.
- The coach-facing RPE-vs-plan flag (`src/lib/micropulse/rpeExpectation/`,
  `/api/coach/team/rpe-expectation`) reads sRPE excluding `auto_fill`/`imputed`, so a forgotten RPE
  reads as "not logged" — never a fabricated over/under/top-up.
