# Claude Code brief — Terra webhook: create the connection from `reference_id` on data payloads

## Problem (confirmed live)
Terra's **"Generate test data" (synthetic users)** stream `sleep`/`daily`/etc. to the webhook **but send
NO `auth` event**. The current handler (`src/app/api/wearables/terra/webhook/route.ts`) only creates the
`wearable_connections` row in the `auth` branch; the `sleep`/`daily` branch resolves the connection with
`findActiveTerraConnection(terraUserId)` only and `return ok()`s when none exists. So with a synthetic user
— even with `reference_id` set — **no connection is ever created and all data is dropped**. Verified:
`wearable_connections`/`wearable_sleep_data`/`wearable_daily_data` have **0** `provider='terra'` rows after
a synthetic stream to `app.micropulse.is`.

Terra includes `user: { user_id, reference_id, provider }` on **every** webhook payload, so the fix also
makes real-world ingestion more robust (no dependency on the `auth` event arriving first).

## Fix
In `src/app/api/wearables/terra/webhook/route.ts`:

1. **Factor out** the connection upsert currently inside the `auth` branch into a reusable helper, e.g.
   ```ts
   async function ensureTerraConnection(sb, profileId: string, terraUserId: string,
     provider?: string): Promise<{ id: string; profile_id: string } | null>
   ```
   It should do exactly what `auth` does today: `deactivateOtherActiveWearables(sb, profileId, "terra")`,
   `revokeLegacyDirectWhoop` (resolve playerId first), then insert-or-update the `terra`
   `wearable_connections` row (`provider_user_id = terraUserId`, `device_label`, `is_active: true`), and
   return the row. Keep the `auth` branch calling this helper (unchanged behaviour).

2. **In the `sleep`/`daily` branch**, add a `reference_id` fallback:
   ```ts
   if (!terraUserId) return ok();
   let conn = await findActiveTerraConnection(sb, terraUserId);
   if (!conn && user.reference_id) {
     conn = await ensureTerraConnection(sb, user.reference_id, terraUserId, user.provider);
   }
   if (!conn) return ok();
   // …resolve playerId + persistSleepNights / persistDailySummaries as today…
   ```
   (Optionally do the same lazy-ensure for `activity`/`body` if/when those are persisted.)

## Guardrails
- No behaviour change for real widget connects (they still send `auth`; the helper is the same code path).
- Keep the **one-active-source-per-player** dedupe (the helper already deactivates other Stack-A providers
  + revokes legacy direct-Whoop) — so the reference_id path can't create a second active source.
- **Boundary unchanged:** Terra data still only feeds check-in auto-fill / status / post-match recovery —
  never `readiness_entries.color` / `v_coach_readiness_today_v8`.
- Null-safe; `return ok()` (200) for payloads that still can't be mapped.

## Tests
- `sleep` payload with `user.reference_id` set and **no prior `auth`** → a `terra` connection is created
  for that profile and the sleep row is persisted (resolves to the player).
- `daily` same.
- A second provider active for the player → ensureTerraConnection deactivates it (no double source).
- `sleep` with neither an existing connection nor `reference_id` → `return ok()`, nothing written.
- Boundary test: no readiness-colour write.

`npx eslint <file>` + tests; lint-clean.

## Verify after deploy
Owner re-runs Terra **Generate test data** with `reference_id = 10300e66-7429-4d2f-87bf-1290880e20de`
(Arnór Tristan, Breiðablik). Then `wearable_connections`(terra) + `wearable_sleep_data`/`wearable_daily_data`
rows should appear for his player id.
