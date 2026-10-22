# Claude Code brief — stage4_decisions stopped writing on 2026-09-14 (dropped-constraint regression)

## Symptom
Coach Today (Command Center) shows **0 READY / 0 MODIFIED / 0 RECOVERY** and **total = 0** ("7/0 checked
in") even on days with real check-ins. Verified: on 2026-10-08 Breiðablik (team `94b52a06…`) has **7 real
check-ins today** in `v_coach_readiness_today_v8` (5 green, 2 yellow, 0 imputed), yet the KPI tiles are 0.

## Root cause (confirmed in the DB)
The tiles read from `teamSignal` = view **`v_team_readiness_today`**, which aggregates
**`stage4_decisions_final`** → **`stage4_decisions`** (counts `final_decision` FULL/REDUCED/RECOVERY). That
chain is a plain view (live), but:

- `stage4_decisions` (base table) **max `entry_date` = 2026-09-14; 0 rows since 2026-09-15**.
- `readiness_entries` is healthy (max = today; 1628 rows since 2026-09-15). So check-ins keep landing, but
  **no stage4 decision rows are being created**.

Why it stopped on exactly 2026-09-14: the stage4 bootstrap/resync functions do
`INSERT ... ON CONFLICT ON CONSTRAINT stage4_decisions_player_date_uniq`:
- `supabase/migrations/20260812120000_stage4_ensure_decision_resync.sql:75`
- `supabase/migrations/20260812130000_stage4_resync_genuine_lock_only.sql:74`

…but `supabase/migrations/20260914130000_dedupe_unique_constraints.sql` ran on 2026-09-14 and did
`ALTER TABLE public.stage4_decisions DROP CONSTRAINT IF EXISTS stage4_decisions_player_date_uniq;`
(keeping the twin `stage4_decisions_player_id_entry_date_key`). The function now names a constraint that no
longer exists, so every insert raises *"constraint … does not exist"* and no stage4 row is written. The
dedupe migration's own comment ("no application code references these constraint names") was wrong — it
didn't check the DB functions.

(The readiness **colour** is sourced from `readiness_entries` → `v_coach_readiness_today_v8`, which is why
the per-player list + "checked in" count still work. Only the stage4 **decision/action** layer —
FULL/REDUCED/RECOVERY, Decision Summary, `v_team_readiness_today` — is dead.)

## Fix
1. **Repoint the ON CONFLICT targets off the dropped constraint.** In the two functions above (recreate them
   with `CREATE OR REPLACE FUNCTION`), change
   `on conflict on constraint stage4_decisions_player_date_uniq`
   → `on conflict (player_id, entry_date)` (column-based; backed by the surviving
   `stage4_decisions_player_id_entry_date_key`). **Audit every function/trigger that writes
   `stage4_decisions`** for the same dropped name — also check the bootstrap functions in
   `20260812140000_stage4_bootstrap_unconfirmed_before_checkin.sql` and
   `20260528103000_stage4_bootstrap_respects_readiness_color.sql`, and `/api/stage4/coach` + the dev
   dashboard upserts (`DevCoachDashboardClient.tsx:3663/3712`) — fix any that reference
   `stage4_decisions_player_date_uniq`. Save as a new timestamped migration under `supabase/migrations/`.
   (Do NOT just re-add the dropped constraint — the dedupe removal was intentional; point at the twin.)

2. **Confirm the invocation path still fires.** Determine how these functions run (trigger on
   `readiness_entries` insert, a scheduled job, or an app call). If it's a trigger, verify it exists and now
   succeeds; if the failures were being swallowed, add a test that a new check-in produces a
   `stage4_decisions` row. If it's a cron/edge function, confirm it's scheduled and green.

3. **Backfill the gap.** Regenerate `stage4_decisions` for **2026-09-15 → today, all teams**, by running the
   (now-fixed) resync/bootstrap over the existing `readiness_entries` for those player-days. Idempotent
   upsert on `(player_id, entry_date)`. This repopulates ~3.5 weeks so history, ACWR-adjacent reads, and the
   team aggregate aren't blank. Save the backfill as a migration or a one-off script invoked once.

## Verify
- `select max(entry_date) from stage4_decisions;` → today.
- `v_team_readiness_today` for `94b52a06…` on `2026-10-08` returns a row with `n_players`≈squad,
  `n_full/n_reduced/n_recovery` summing to the checked-in squad (today: FULL≈5, the 2 yellows map per the
  decision engine). Coach Today tiles then show non-zero READY/MODIFIED/RECOVERY and a real `total`.
- A fresh test check-in immediately creates a matching `stage4_decisions` row.

## Guardrails
- **Boundary:** `stage4_decisions.final_decision` is the training **action** (FULL/REDUCED/RECOVERY), not the
  readiness colour. This fix restores the action layer only; it must not change
  `readiness_entries.color` / `v_coach_readiness_today_v8.final_color`. Per CLAUDE.md the tiles are the
  action counts — correct — while the verdict colour stays sourced from the canonical colour view.
- Idempotent backfill; no duplicate rows (unique on player_id, entry_date).
- Migration saved under `supabase/migrations/` with timestamp prefix (CLAUDE.md rule).
- Add a regression test / check so a future constraint rename can't silently kill stage4 writes again
  (e.g. a smoke test: insert a check-in in a test tx → assert a stage4 row appears).
