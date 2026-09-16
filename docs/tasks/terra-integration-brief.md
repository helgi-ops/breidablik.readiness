# Terra (tryterra.co) integration — preparation brief

Terra is a **wearables aggregator**: one integration exposes a unified API + webhooks for
data from Garmin, Apple Health, Whoop, Oura, Polar, Fitbit, Suunto, Coros, Samsung, and more.
For MicroPulse it is the single-integration answer to "connect any watch" — it feeds the
**readiness / recovery** layer (sleep, resting HR, HRV, recovery score) and can feed
**activity load** (sessions/workouts). It is the "Vital-style" aggregator the wearables
framework already anticipates.

## How it fits the existing framework (no new framework needed)

The provider-agnostic wearables framework is already in place:
- `src/lib/wearables/types.ts` — `WearableProvider` interface + normalised `WearableSleepNight`
  / `WearableDailySummary` (restingHr, hrvRmssd, providerRecoveryScore).
- `src/lib/wearables/registry.ts` — `PROVIDERS` map; "add a provider = add a key + drop an impl".
- Routes: `/api/wearables/connect` · `/callback` · `/sync` · `/disconnect`; plus the generic
  `/api/integrations-live/webhooks/[provider]`.
- Storage: `wearable_connections` (per-player connection state).

**Scaffolded (this brief):** `terra` added to `WearableProviderKey` + label + `WEARABLE_PROVIDER_AVAILABLE.terra = false`.
It is a KNOWN but UNAVAILABLE provider — the registry has no `terra` impl yet, so connect is
refused and the UI hides it. Nothing is live.

## The one design fork (needs a call before implementing)

Terra's connect flow does NOT match the framework's **synchronous** `authorizeUrl(state, redirectUri): string`.
Terra requires a **backend call** first:
`POST https://api.tryterra.co/v2/auth/generateWidgetSession` (headers `dev-id`, `x-api-key`;
body `reference_id` = our player/profile id, `auth_success_redirect_url`, `auth_failure_redirect_url`)
→ returns a widget `url` to redirect the user to. The user then picks their wearable inside
Terra's widget.

Two ways to reconcile:
1. **Special-case Terra in `/api/wearables/connect`** — if `provider === "terra"`, call
   generateWidgetSession server-side and return its `url` (leave the `WearableProvider` interface
   unchanged). Lowest-risk, keeps the OAuth providers as-is. **Recommended.**
2. Extend `WearableProvider` with an async `connectUrl(referenceId, redirectUri): Promise<string>`
   that Polar/Whoop also adopt. Cleaner long-term, but touches the existing providers.

## Data mapping (Terra webhook payload → MicroPulse)

Terra pushes normalised payloads (types: `sleep`, `daily`, `activity`, `body`, `athlete`).
- `sleep` → `WearableSleepNight` (total/efficiency/stages + Terra's sleep score) → the same
  sleep sink Polar/Whoop use.
- `daily` → `WearableDailySummary` (resting HR, HRV RMSSD, Terra recovery/`scores`) → feeds the
  readiness/recovery signals **beside** the check-in — NEVER overwrites the canonical readiness
  colour (`readiness_entries.color` / `v_coach_readiness_today_v8.final_color`).
- `activity` (optional, later) → could map to `player_external_load_daily` as a `source='terra'`
  session-load row (HR-based internal load; distance/HSR only if the device provides GPS).

Backfill via REST (`GET /v2/sleep`, `/v2/daily`, `/v2/activity?user_id=…&start_date=…&end_date=…`)
mirrors the existing `fetchSleep` / `fetchDailySummary` provider methods.

## Prerequisites — what the coach/owner must supply (I cannot obtain these)

1. A Terra account → **`dev-id`** + **`x-api-key`** + the webhook **signing secret**.
2. In the Terra dashboard, register:
   - **Webhook URL**: `https://app.micropulse.is/api/integrations-live/webhooks/terra`
     (or a dedicated `/api/wearables/terra/webhook`).
   - **Auth success/failure redirect URLs**: e.g. `https://app.micropulse.is/player/settings/integrations?connected=terra`.
   - Which **data types / providers** to enable, and **sandbox vs production**.
3. Decide the connect-flow option above (recommended: #1).

Env vars (documented, inert until set): `TERRA_DEV_ID`, `TERRA_API_KEY`, `TERRA_SIGNING_SECRET`,
`TERRA_ENV` (`sandbox`|`production`).

## Go-live checklist (implementation step, after the above)

- [ ] `src/lib/wearables/terra.ts` — provider impl: generateWidgetSession (connect), REST
      `fetchSleep`/`fetchDailySummary`, `disconnect`. Reads `TERRA_*`.
- [ ] Register in `registry.ts`; flip `WEARABLE_PROVIDER_AVAILABLE.terra = true`.
- [ ] Connect route: implement the chosen connect-flow option.
- [ ] Webhook route: verify `terra-signature` (HMAC-SHA256, `t=`/`v1=`) against `TERRA_SIGNING_SECRET`;
      normalise `sleep`/`daily` payloads → the shared sinks; store raw payload for audit.
- [ ] Player↔Terra link via `reference_id` = profile/player id.
- [ ] Verify on sandbox with a test wearable; confirm readiness colour is untouched (recovery is a
      side signal, not the verdict).

## References
- Quickstart: https://docs.tryterra.co/health-and-fitness-api/quickstart
- Widget auth: https://docs.tryterra.co/health-and-fitness-api/user-authentication/implementation-terra-widget
- Webhooks: https://docs.tryterra.co/health-and-fitness-api/integration-setup/setting-up-data-destinations/webhooks
- Webhook signature verification: https://docs.tryterra.co/recipes
- REST reference: https://docs.tryterra.co/reference
