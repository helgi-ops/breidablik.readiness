# Claude Code task — ingest IMA jumps from Catapult (bug fix)

Paste to Claude Code (or `@docs/tasks/catapult-ingest-ima-jumps-claude-code-brief.md`).

## Problem (root cause, verified against live OpenField)
IMA **jumps** are enabled in the club's OpenField Reporting Parameters, but `jumps` is **0** for every
synced row. Cause is ingestion-side, not OpenField config:

- `src/lib/integrations/catapult/api.ts` → `CATAPULT_IMA_PARAMETERS` requests
  `"IMA Impacts Band 1–8 Count"` (impacts) and does **NOT** request the jump-count parameters.
- `src/lib/integrations/catapult/normalize.ts` (~line 674–695) IS ready to store jumps — it sums
  entries matching `^imaband[1-8]jumpcount$` into the `jumps` field. But since jumps are never
  requested, they never arrive → `jumps = 0`.

## Verified facts (from HK OpenField, customer 4218, /api/v6/parameters)
The jump parameters exist under these **exact display names → slugs**:
- `"IMA Jump Count Low Band"`  → `ima_band1_jump_count`
- `"IMA Jump Count Med Band"`  → `ima_band2_jump_count`
- `"IMA Jump Count High Band"` → `ima_band3_jump_count`
- (aggregates also exist: `"Total Jumps"` → `total_jumps`, `"Total Jump Count"`)

## Fix
1. **Request the jump parameters.** In `src/lib/integrations/catapult/api.ts`, add a jump parameter
   list and include it in the Stats-API request. Prefer a **separate fire-and-forget batch** (exactly
   like `CATAPULT_IMA_CLOCK_PARAMETERS`) so an unrecognised name at another org can't poison the core
   IMA request:
   ```ts
   export const CATAPULT_IMA_JUMP_PARAMETERS = [
     "IMA Jump Count Low Band",
     "IMA Jump Count Med Band",
     "IMA Jump Count High Band",
   ];
   ```
   (Do NOT remove the existing Impacts Band params — impacts are a separate metric; just add jumps.)

2. **Verify request → response → normalize mapping.** Confirm how the v6 Stats API keys the returned
   values for these display-name parameters:
   - If the response keys come back as the **slugs** (`ima_band1_jump_count` …), the existing
     normalizer regex `^imaband[1-8]jumpcount$` already matches → jumps populate. Done.
   - If the response keys come back as the **display names** (`"IMA Jump Count Low Band"` …), the
     normalizer will NOT match (its canonical would be `imajumpcountlowband`). In that case, add an
     alias in `normalize.ts` so those display-name canonicals also map to the jump sum. Check the
     other IMA params (accel/decel) to see which keying the code already relies on and match it.
   - Add a tiny unit test (once the test runner exists) or a `debug-fields` check to assert jumps
     parse from a sample HK activity.

3. **Re-run the backfill for HK** after deploying, so historical rows get jumps
   (`/api/integrations/catapult/backfill` for team `252f66c6-2ad0-4f92-9706-f7b83243cb45`, ~75 days).

## Acceptance criteria
- After the fix + backfill, `player_external_load_daily.jumps > 0` for HK match/training rows that had
  jumps in OpenField (spot-check a match day).
- Impacts bands still ingest as before (not removed).
- Core IMA request (accel/decel/CoD/clock) unaffected if the jump batch fails at another org.
- `npx tsc --noEmit` and `npx eslint` clean on changed files.
- If any applied DB change (none expected — `jumps` column already exists), also save the migration
  `.sql` per repo convention.

## Note
`jumps` feeds Post-match Recovery, Player Game Report, Position Comparison, KSÍ report, robustness and
football-drills endpoints — all currently getting 0 for jumps. This one fix lights up jumps across all
of them.
