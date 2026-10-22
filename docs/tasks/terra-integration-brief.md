# Terra (tryterra.co) wearables — FINAL build brief (Phase 1: Whoop)

Single source of truth for Code. Owner-side setup (Terra dashboard + Vercel env) is **done**. This brief
folds in the Explore infra map, so follow it as written. Phase 1 enables **Whoop only**; more wearables are
a Terra dashboard toggle later with no code change.

**Scope / boundary:** Terra feeds the **recovery/readiness side signals** (sleep, resting HR, HRV, recovery
score) via check-in auto-fill + status + post-match-recovery reads. It is **descriptive** — it NEVER writes
or influences the readiness colour (`readiness_entries.color` / `v_coach_readiness_today_v8.final_color`).
Wiring wearables into the decision engine is explicitly **out of scope** (the engine is inert for wearables
today — see §7).

## 0. Owner setup — DONE (for context)
- Terra account: production. `dev-id = micropulse-prod-AcuwmPJraZ`. Source = **Whoop**. Destination =
  **Webhook (Push)** → `https://app.micropulse.is/api/wearables/terra/webhook`, signing secret generated.
- Vercel env (Production): `TERRA_DEV_ID`, `TERRA_API_KEY`, `TERRA_SIGNING_SECRET`, `TERRA_ENV=production`.
- Still owner-side before real players connect: add Whoop **developer-app** client_id/secret to Terra's
  Whoop source (reuse the ones from the earlier direct-Whoop prep). Test data works without it.

## 1. Which stack — build in Stack A (`src/lib/wearables/`)
The repo has three parallel integration stacks (see the Explore map). Terra is scaffolded in **Stack A**
(`src/lib/wearables/types.ts`: `terra` is in `WearableProviderKey` + `WEARABLE_PROVIDER_LABEL`, with
`WEARABLE_PROVIDER_AVAILABLE.terra=false`). Build here. The provider-agnostic `syncConnection()` in
`src/lib/wearables/sync.ts` already upserts `WearableSleepNight`/`WearableDailySummary` into the shared
`wearable_sleep_data` / `wearable_daily_data` sinks (keyed by `connection_id` + `player_id`) for any
provider — reuse it. **Do NOT use the Stack-C webhook** (`/api/integrations-live/webhooks/[provider]`): it
excludes `TERRA`, verifies a bare-hex `x-signature` (Terra uses `terra-signature: t=,v1=`), and ingests
into a different pipeline that doesn't touch the wearable sinks.

## 2. Files to create / change

**a. `src/lib/wearables/terra.ts`** (new) — provider impl:
- `fetchSleep(state, from, to)` → `WearableSleepNight[]` via `GET https://api.tryterra.co/v2/sleep?user_id=<providerUserId>&start_date=&end_date=` (headers `dev-id`, `x-api-key`). Map Terra sleep → the shape in §3.
- `fetchDailySummary(state, from, to)` → `WearableDailySummary[]` via `GET /v2/daily`. Map per §3.
- `disconnect(state)` → `POST /v2/auth/deauthenticateUser?user_id=…` (best-effort).
- `authorizeUrl()` / `exchangeCode()` are N/A for Terra (widget flow) — throw "use generateWidgetSession",
  or leave unused since connect is special-cased (§2d).
- Export `generateWidgetSession({ referenceId, redirectSuccess, redirectFailure, providers })` →
  `POST https://api.tryterra.co/v2/auth/generateWidgetSession` (headers `dev-id`, `x-api-key`,
  `Content-Type: application/json`; body `{ reference_id, auth_success_redirect_url,
  auth_failure_redirect_url, providers: "WHOOP", language: "en" }`) → returns `{ url, session_id }`.

**b. `src/lib/wearables/registry.ts`** — add `terra: terraProvider` to `PROVIDERS` + import. (Until it's in
the registry, `/api/wearables/connect` returns "Unknown or unavailable provider".)

**c. `src/lib/wearables/types.ts`** — set `WEARABLE_PROVIDER_AVAILABLE.terra = true` (label already exists:
"Terra (all wearables)"). The connect UI (`WearableConnectCard`) then auto-renders a Terra row.

**d. `src/app/api/wearables/connect/route.ts`** — special-case Terra (Option 1): if `provider==="terra"`,
call `generateWidgetSession({ referenceId: <profile/player id>, redirectSuccess:
<APP_URL>/player/settings/integrations?connected=terra, redirectFailure: …&error=1, providers:"WHOOP" })`
and return `{ authorizeUrl: url }` (same response key the card expects). Leave the OAuth providers unchanged.

**e. `src/app/api/wearables/terra/webhook/route.ts`** (new) — Stack-A Terra webhook:
- Read the raw body. Verify Terra's `terra-signature` header, format `t=<unix>,v1=<hex-hmac>`:
  `hmac = HMAC_SHA256(TERRA_SIGNING_SECRET, `${t}.${rawBody}`)`, compare to `v1` with `timingSafeEqual`.
  Reject (401) if invalid; in non-prod allow unsigned only if no secret set.
- Handle payload `type`: `auth` → upsert/activate the player's `wearable_connections` row with the Terra
  `user.user_id` (`provider_user_id`) and `reference_id` → `profile_id`; `sleep` → `WearableSleepNight`;
  `daily` → `WearableDailySummary`. Write via the existing `sync.ts` upsert path (or a small mapper that
  upserts into `wearable_sleep_data` / `wearable_daily_data` the same way). Store `raw` for audit.
- Return **200** on success (Terra needs 200 to mark delivered). Ignore unknown types gracefully.
- (Backfill on connect via `fetchSleep`/`fetchDailySummary` for the last ~14 days, like `syncConnection`.)

**f. Migration** (new, `supabase/migrations/<ts>_wearables_core_tables.sql`) — **GOTCHA: Stack-A tables have
no migration today.** Create `wearable_connections`, `wearable_sleep_data`, `wearable_daily_data` with the
columns used in `sync.ts` / `/api/wearables/callback` (listed in the Explore map), unique constraints
`wearable_connections(profile_id, provider)`, `wearable_sleep_data(connection_id, sleep_date)`,
`wearable_daily_data(connection_id, measurement_date)`, + RLS (player owns own rows; coach/staff read team).
First confirm they aren't already provisioned out-of-band; if they are, skip/align instead of duplicating.

**g. Dedupe — one active source per player.** Direct-Whoop (Stack B, `athlete_integrations` /
`athlete_monitoring_snapshots`) and Terra-Whoop (Stack A) can both land the same player/date. On Terra
`auth`/connect: deactivate the player's existing direct-Whoop (`athlete_integrations.status='revoked'`)
and any other active `wearable_connections` row (`is_active=false`) for that player, so only one source is
active. Never double-write a player/date.

**h. Connect UI — route new connects through Stack A.** The page
`src/app/player/settings/integrations/page.tsx` is **Whoop-only Stack B** (`/api/integrations/whoop/*`).
Convert it to render `src/components/player/WearableConnectCard.tsx` (Stack A, data-driven off the label
map, posts to `/api/wearables/connect`) **or** hide it for new links, so Terra is the single "Connect
watch" entry. Optionally set `WEARABLE_PROVIDER_AVAILABLE.whoop=false` so new direct-Whoop links go via
Terra while existing connections stay read-only.

## 3. Data mapping (Terra payload → normalized)
- Terra **sleep** → `WearableSleepNight`: `sleepDate` (end/wake date), `sleepStartAt`, `sleepEndAt`,
  `totalSleepMin` (from `sleep_durations_data.asleep.duration_asleep_state_seconds`/60),
  `sleepEfficiencyPct`, `deepSleepMin`/`remSleepMin`/`lightSleepMin`/`wakeMin` (from the stage durations),
  `providerScore` (Terra/Whoop sleep performance), `sourceRecordId`, `raw`.
- Terra **daily** → `WearableDailySummary`: `measurementDate`, `restingHrBpm`
  (`heart_rate_data.summary.resting_hr_bpm`), `hrvRmssdMs` (`…hrv_rmssd` where available),
  `providerRecoveryScore` (`scores.recovery`), `sourceRecordId`, `raw`.
- Nulls stay null (never 0). Map leniently; keep `raw` for anything unmapped.

## 4. Connect flow (per player, from the player app)
Player taps "Connect watch (Terra)" → `/api/wearables/connect` (provider=terra) → server
`generateWidgetSession(reference_id = player's profile/player id, providers:"WHOOP")` → redirect to the
returned widget `url` → player authorizes Whoop in Terra's widget → Terra posts an `auth` webhook +
redirects back to `…/player/settings/integrations?connected=terra`. Store the connection; backfill recent
data.

## 5. Env (already set in Vercel Production)
`TERRA_DEV_ID`, `TERRA_API_KEY` (x-api-key — backend only), `TERRA_SIGNING_SECRET`, `TERRA_ENV=production`.
Never send the api-key/secret to the client.

## 6. Guardrails / tests
- Webhook: signature verify (good passes, bad/missing → 401); returns 200 on valid; `sleep`→SleepNight and
  `daily`→DailySummary mapping; nulls not zeros; raw stored.
- Connect: terra → generateWidgetSession called with `providers:"WHOOP"` + correct headers + reference_id;
  returns a widget url.
- **Dedupe test:** connecting Terra for a player with an active direct-Whoop deactivates the old source;
  same player/date never written twice.
- Flag/registry: terra available + registered → card renders + connect resolves.
- **Boundary test (mandatory):** Terra data reaches check-in auto-fill / status / post-match recovery but
  **never** `readiness_entries.color` / `v_coach_readiness_today_v8`.
- `npx eslint <changed files>` + tests; lint-clean. Migration saved under `supabase/migrations/`.

## 7. Honest scope note (read)
The decision engine is **inert** for wearables today (`fetchWhoopSnapshots` queries a non-existent view
`monitoring_snapshots_normalized`; "verdicts ignore WHOOP"). So Phase 1 Terra data surfaces in check-in
auto-fill, the wearable status card, weekly summary, and post-match recovery reads — **not** the readiness
verdict. That is correct per the manifesto (recovery is a side signal). Making wearables influence the
verdict is a separate decision-engine task (would wire a real normalized source + the fusion layer at
`src/lib/integrations/shared/whoopReadinessAdapter.ts` / `src/lib/micropulse/integrations/whoopFusion`).

## 8. Verify (no Whoop device needed)
After the webhook route ships + returns 200: Terra dashboard → **"Generate test data"** → Terra posts
simulated Whoop payloads → confirm rows land in `wearable_sleep_data`/`wearable_daily_data` and the
readiness colour is untouched. Terra **Users / Payload history** shows delivery success/failures.

## References
generateWidgetSession + widget auth, webhook destinations, and `terra-signature` verification:
https://docs.tryterra.co (quickstart / user-authentication / data-destinations/webhooks / recipes).
Full infra map (exact file paths, line numbers, columns, function signatures) is in the Explore report.
