# Claude Code task — diagnose why HK gets 0 IMA jumps (and how Catapult sync is configured)

Paste to Claude Code (or `@docs/tasks/diagnose-hk-ima-jumps-claude-code-brief.md`).
**This is a DIAGNOSTIC first — do not change ingestion logic until the root cause is confirmed.**

## Context (verified this session)
- **Breiðablik jumps are correct.** `player_external_load_daily.jumps` for Breiðablik is populated with
  plausible values (1–52, median 10), from `ima_band{n}_jump_count`. So the ingestion path *can*
  capture jumps. (An earlier hypothesis that "the API never requests jumps" was WRONG — retract it.)
- **HK gets 0 jumps.** For HK men (`team_id = 252f66c6-2ad0-4f92-9706-f7b83243cb45`),
  `jumps = 0` on all 707 rows, even though accel/decel/CoD/IMA-clock are all fully populated
  (full Catapult tier). HK's OpenField org/customer_id = **4218**.
- In HK's OpenField the jump parameters DO exist: display names **"IMA Jump Count Low/Med/High Band"**
  → slugs `ima_band1/2/3_jump_count`, plus `"Total Jumps"` → `total_jumps`.
- `src/lib/integrations/catapult/normalize.ts` (~line 674) sums `^imaband[1-8]jumpcount$` into `jumps`
  and deliberately excludes `total_jumps`.
- **Architecture flag:** `fetchActivitiesForDate` / `fetchActivityStatsDetailed` in
  `src/lib/integrations/catapult/api.ts` read `requiredEnv("CATAPULT_ORG_ID")` and
  `requiredEnv("CATAPULT_API_KEY")` — a **single global org from env**. Yet HK (a different org) got
  707 rows via backfill, and `team_integrations` has **no** row for HK. So per-team Catapult creds must
  live somewhere else. **Find where.**

## Step 1 — Map how Catapult sync is actually configured (per-team vs global env)
- Grep for where `catapult_api_key` / `catapult_org_id` are **stored and read** (e.g. `/api/team/settings`
  writer, any `catapult_configs`/`team_settings` table, or columns on `teams`). The
  `CatapultSetupWizard` POSTs to `/api/team/settings` — trace where those land.
- In `src/app/api/integrations/catapult/daily-sync/route.ts` and `.../backfill/route.ts`, find how they
  "collect all DB-configured teams" and "resolve per-team Catapult config", and how that per-team
  org/key is passed into the `api.ts` fetch (does it override the env, or does `api.ts` always use env?).
- **Report the answer plainly:** is sync per-team (each team's own org/key) or global-env (one org)?
  This matters for multi-club scaling and for interpreting the jump result below.

## Step 2 — Run a diagnostic for HK specifically
Goal: see whether HK's Catapult response for a match actually contains jump values.
- Use HK's config: `team_id = 252f66c6-…`, `org_id = 4218`, date **2026-06-26** (the "Game vs Fylkir"
  match; also try 2026-06-24 training).
- Reuse the existing `debug-fields` diagnostic (`src/app/api/integrations/catapult/debug-fields/route.ts`),
  but make it target **HK's** config rather than the global env — the cleanest way is a **temporary,
  clearly-marked** optional query param (e.g. `?teamId=…` / `?orgId=…&apiKeyFromConfig=1`) that resolves
  the same per-team config the backfill uses. If that's too invasive, write a one-off Node script under
  `scripts/` that calls the per-team fetch + `normalizeCatapultActivityStats` for HK and prints:
  - the aggregate for `ima_band{1-8}_jump_count` and `total_jumps` (nonZeroAthletes, max, sample),
  - a control aggregate for `IMA Accel High` / `ima_accel` (must be > 0 — proves the fetch works),
  - the exact raw key names in the merged payload matching `/jump/i`.

## Step 3 — Conclusion + fix (only after Step 2)
Decision tree from the HK diagnostic:
- **Jump fields present with values > 0** (but DB shows 0) → **ingest bug for HK.** Compare HK's fetch to
  Breiðablik's working one: likely a param-list or key-mapping difference (e.g. HK's per-team fetch
  requests a narrower parameter set than Breiðablik's, so jump slugs never come back). Fix the request/
  normalize so HK's jumps are captured, then **re-run the HK backfill** (~75 days,
  team `252f66c6-…`) and verify `jumps > 0`.
- **Jump fields absent / all 0 in HK's response** (while the accel control is > 0) → **data-capture
  issue, not code.** HK's activities simply don't carry IMA jump values (parameter is in the OpenField
  library but wasn't applied/computed for HK's sessions, or the vests/firmware didn't record it). Action
  is on HK's OpenField side (enable + reprocess), not MicroPulse. Document this and stop.

## Constraints
- **Diagnostic first, no ingestion changes until Step 2 confirms the cause.**
- Any temporary debug param/script must be clearly labelled and easy to remove; don't leave a debug
  backdoor in a shipped route without auth (the existing `debug-fields` already gates on coach/admin or
  cron secret — keep that).
- No destructive DB changes. If a fix + backfill runs, spot-check one HK match day afterward.
- `npx tsc --noEmit` and `npx eslint` clean on anything you touch. Save any migration `.sql` per repo
  convention (none expected — `jumps` column already exists).

## Acceptance criteria
- A plain answer to: (1) is Catapult sync per-team or global-env, and where per-team creds live;
  (2) does HK's Catapult response contain IMA jump values for the Fylkir match — yes/no with the
  aggregate numbers and the control accel number proving the fetch worked.
- A clear verdict: **ingest bug** (with the fix + re-backfill done and jumps now > 0 for HK) **or**
  **data-capture issue** (documented, action handed back to the club's OpenField).
