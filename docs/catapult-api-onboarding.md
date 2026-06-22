# Catapult API onboarding — Þór / Grindavík / Afturelding (and beyond)

> **Key finding: the API sync is already built and already multi-team.** When the
> API keys arrive, onboarding a club is a **DB insert + verify**, not new code.
> The only genuinely new build here is the **data-freshness alert** (which is what
> would have caught Afturelding's stale GPS automatically).

## What already exists (reuse, don't rebuild)

- **Per-team credentials** live in `team_settings`:
  `catapult_api_key`, `catapult_org_id`, `catapult_api_base`
  (read by `getConfigForTeam(teamId)` and `getTeamsWithCatapultCredentials()` in
  `src/lib/integrations/catapult/api.ts`; env vars are the legacy fallback via
  `getConfigFromEnv()` — that's Breiðablik today).
- **The sync engine:** `syncCatapultDailyMetrics(date, { config })` pulls a team's
  activities and writes `player_external_load_daily` (same target table the CSV
  upload writes to).
- **The cron:** `/api/integrations/catapult/daily-sync` iterates EVERY team that
  has credentials in `team_settings` — so a newly-credentialed team is picked up
  automatically, no code change.
- **Helpers already there:** `/api/integrations/catapult/test-connection`,
  `…/backfill`, `…/unmatched-athletes`, `…/debug-fields`, `…/debug-activities`.
- **Athlete mapping:** `catapult_athlete_map` (Catapult athlete → MicroPulse
  player). New teams will need their athletes mapped (see step 3).

## Onboarding runbook (per club, once the key arrives)

1. **Store the credentials** for the team in `team_settings`
   (`catapult_api_key`, `catapult_org_id`, `catapult_api_base`). Do this via a
   secure path (Supabase dashboard or a service-role one-off) — **never commit the
   key, never log it, never put it in env/git.** team_ids:
   - Þór Ak: `53404233-9d49-45eb-9395-b0484e47929a`
   - Grindavík: `0b3239f0-4284-455c-9f0e-63ac754b158f`
   - Afturelding: `5a515036-0529-4e4d-97bf-469eca9b2296`
2. **Test the connection:** call `/api/integrations/catapult/test-connection` for
   that team. Confirm it authenticates and returns activities.
3. **Map athletes:** run `/api/integrations/catapult/unmatched-athletes` and map
   each Catapult athlete to the MicroPulse player in `catapult_athlete_map`. (The
   CSV path already created players for these teams, so most should match by name.)
4. **Backfill history:** `/api/integrations/catapult/backfill` for the season range
   so the API-sourced data lines up with / replaces the CSV history. Watch for
   double-counting if both CSV rows and API rows exist for the same day — dedupe on
   (player_id, date, source) or prefer one source per day.
5. **Confirm the daily cron picks it up:** after creds exist, the next
   `daily-sync` run should include the team automatically. Verify a fresh day
   lands in `player_external_load_daily` without any manual upload.
6. **Set the expectation:** these teams are GPS-tier — the API will deliver
   **distance / HSR / player load only, NOT IMA or max-velocity** (confirmed: 0%
   IMA in their data). The API removes the manual-export friction; it does NOT add
   Driver-layer depth. Same parameters as the CSV, just automatic.

## Security (non-negotiable)

- The API key is a secret. It lives ONLY in `team_settings` (DB), protected by RLS
  so clients can't read it. Never in env-committed files, logs, error messages,
  git, or this repo's docs.
- The debug routes take a `secret` query param — that value is private; do not
  commit or log it (existing rule, HANDOFF #1).

## The one new build — data-freshness alert

This is the gap that let Afturelding's GPS go stale for 3+ weeks unnoticed.

- **Lib** `src/lib/micropulse/dataFreshness/index.ts`: for each team, compute days
  since last `player_external_load_daily` row and days since last
  `readiness_entries` row. Flag thresholds (e.g. GPS stale > 7 training days,
  check-ins stale > 3 days).
- **Surface:** a slim banner / row ("⚠ No GPS data for [team] in 24 days — last
  upload 27 May") on the coach dashboard and/or an admin overview across teams.
  For your own multi-club view, a small "pipeline health" table beats SQL-by-hand.
- **Optional:** tie into the existing notification path (`/api/notifications/*`,
  `vercel.json` crons) to email/push you when a club goes stale — turns churn
  detection from manual into automatic.
- Migration: none expected for the alert (reads existing tables). If `team_settings`
  is missing any of the three Catapult columns in some environment, add them via a
  timestamped migration under `supabase/migrations/` (per CLAUDE.md).

## Acceptance

- A new team's GPS lands automatically each day with zero manual export.
- The freshness alert fires when a team's GPS or check-ins go stale, before you'd
  notice by hand.
- Keys are never exposed in code, logs, or git.

## Why this matters (link to strategy)

Automating the Catapult import is **retention fix #1** in
`docs/strategic-options.md`: the manual per-match CSV export is the fragile link
that broke for Afturelding while their players kept checking in. API sync + a
freshness alert removes that failure mode for every club.
