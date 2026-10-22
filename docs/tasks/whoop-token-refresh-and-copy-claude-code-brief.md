# Claude Code brief — Whoop token refresh + offline scope + wearable copy fix

## Why (confirmed live)
Direct Whoop (Stack A) now connects end-to-end: a `wearable_connections` row is created
(`provider='whoop'`, `is_active=true`, `provider_user_id=42944843`, `last_sync_error=null`). Verified in
Supabase. But two things make it break for real players, plus one copy bug:

1. **Access token expires in ~1 h and nothing refreshes it.** `WearableProvider` (`src/lib/wearables/types.ts`)
   has **no refresh method**, and `syncConnection` (`src/lib/wearables/sync.ts`) calls
   `provider.fetchSleep(state, …)` with the stored `access_token` as-is. After ~1 h Whoop returns 401, the
   catch writes `last_sync_error`, and every later sync fails. So a player connects today, data lands for
   ~1 h, then goes dark.
2. **The `offline` scope is missing**, so Whoop never issues a `refresh_token` at all. Current
   `WHOOP_SCOPES` (`src/lib/wearables/whoop.ts` lines 33–37): `read:profile`, `read:sleep`, `read:recovery`,
   `read:cycles`. Without `offline` there is nothing to refresh *with* — refresh must be paired with this.
3. **Copy bug:** `src/components/player/WearableConnectCard.tsx` hardcodes Polar text for every provider —
   the intro (line ~204: "Connect your Polar watch … straight from Flow") and the per-card description
   (lines ~282–283: "Connect your Polar Flow account — sleep + HRV + nightly recharge") render identically
   for Polar, **Terra and Whoop**. The screenshot shows the Terra and Whoop cards both saying "Polar Flow".

**Boundary (unchanged, mandatory):** none of this touches the readiness colour. Wearable recovery stays a
descriptive side signal (check-in auto-fill / status / post-match recovery) — it never writes
`readiness_entries.color` / `v_coach_readiness_today_v8.final_color`. No change to the decision engine.

## Fix 1 — add `offline` to Whoop scopes
`src/lib/wearables/whoop.ts`, `WHOOP_SCOPES`: add `"offline"` so the token response carries a
`refresh_token`. (Whoop requires `offline` for refresh tokens.) No other scope change.

```ts
const WHOOP_SCOPES = [
  "read:profile",
  "read:sleep",
  "read:recovery",
  "read:cycles",
  "offline",
] as const;
```

## Fix 2 — add an optional `refreshAccessToken` to the provider interface
`src/lib/wearables/types.ts`, `interface WearableProvider` — add an **optional** method so providers that
can't refresh (or don't need to) are unaffected:

```ts
/** Exchange a stored refresh_token for a fresh access_token. Optional:
 *  providers without refresh (or with non-expiring tokens) omit it.
 *  Returns the new connection state to persist. */
refreshAccessToken?(state: WearableConnectionState): Promise<WearableConnectionState>;
```

Implement it in `whoop.ts` (POST `WHOOP_TOKEN_URL`, `grant_type=refresh_token`):

```ts
async refreshAccessToken(state): Promise<WearableConnectionState> {
  const env = requireWhoopEnv();
  if (!state.refreshToken) throw new Error("Whoop refresh: no refresh_token stored");
  const res = await fetch(WHOOP_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: state.refreshToken,
      client_id: env.clientId,
      client_secret: env.clientSecret,
      scope: "offline",            // Whoop requires scope on refresh to keep issuing a refresh_token
    }).toString(),
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Whoop token refresh failed: ${res.status} ${text.slice(0, 300)}`);
  }
  const json = (await res.json()) as WhoopTokenResponse;
  if (!json.access_token) throw new Error("Whoop refresh response missing access_token");
  return {
    providerUserId: state.providerUserId,
    accessToken: json.access_token,
    // Whoop rotates the refresh_token — keep the new one, fall back to the old if absent.
    refreshToken: json.refresh_token ?? state.refreshToken,
    expiresAt: json.expires_in ? new Date(Date.now() + json.expires_in * 1000).toISOString() : null,
    scopes: json.scope ? json.scope.split(/[\s,]+/).filter(Boolean) : state.scopes,
    deviceLabel: state.deviceLabel,
  };
}
```

## Fix 3 — refresh inside `syncConnection` (the one place tokens are used)
`src/lib/wearables/sync.ts`, in `syncConnection`, after building `state` (line ~189) and before the
`try` block that calls `fetchSleep`/`fetchDailySummary`:

1. **Pre-emptive refresh.** If the provider implements `refreshAccessToken`, there's a `refresh_token`, and
   `expires_at` is missing or within a small buffer of now (e.g. ≤ 120 s), call it, **persist** the new
   `access_token` / `refresh_token` / `expires_at` / `scopes` back to `wearable_connections` for this `id`,
   and use the refreshed state for the fetches. Factor this into a small helper
   `ensureFreshState(sb, connectionId, provider, state)` returning the (possibly refreshed) state.
2. **Reactive retry (robustness).** Wrap the fetch calls so that if the first `fetchSleep` throws an auth
   error (message contains `401`) and the provider can refresh and hasn't just been refreshed, refresh once,
   persist, and retry the fetches a single time. Any other error → existing catch (`last_sync_error`).

Persist helper (same `sb` admin client already in scope):

```ts
async function persistRefreshedState(sb, connectionId, s: WearableConnectionState) {
  await sb.from("wearable_connections").update({
    access_token: s.accessToken,
    refresh_token: s.refreshToken,
    expires_at: s.expiresAt,
    scopes: s.scopes,
  }).eq("id", connectionId);
}
```

Keep everything else in `syncConnection` identical (player_id resolution, 14-day window, sink upserts,
`last_synced_at` / `last_sync_error` writes, return shape). **Never log token values** (don't put
`access_token`/`refresh_token` in `last_sync_error` or `console`). `syncAllConnections` needs no change —
it calls `syncConnection`, which now self-heals.

## Fix 4 — correct the wearable copy (EN + IS)
`src/components/player/WearableConnectCard.tsx`:

- **Intro (line ~204):** make it provider-agnostic. EN: "Connect your wearable and we read sleep, resting
  HR and HRV automatically — no more self-reporting, more accurate data, and you save time every morning."
  IS: "Tengdu úrið/bandið þitt og við lesum svefn, hvíldarpúls og HRV sjálfkrafa — ekkert handvirkt innslag,
  nákvæmari gögn og þú sparar tíma á hverjum morgni."
- **Per-card description (lines ~282–283):** stop hardcoding Polar. Add a per-provider description map keyed
  by `WearableProviderKey` (next to `WEARABLE_PROVIDER_LABEL` in `types.ts`, e.g.
  `WEARABLE_PROVIDER_DESC` / `_DESC_IS`, or a local map in the component) and render the entry for the
  current `key` in the `.map` loop. Suggested copy:
  - `polar` — EN "Polar Flow — sleep + HRV + nightly recharge" / IS "Polar Flow — svefn + HRV + næturhvíld"
  - `terra` — EN "All wearables via Terra — sleep + resting HR + HRV" / IS "Öll wearables í gegnum Terra —
    svefn + hvíldarpúls + HRV"
  - `whoop` — EN "Whoop — recovery, sleep + HRV" / IS "Whoop — endurheimt, svefn + HRV"
  - keep any "coming soon" providers' existing short text.
  Fall back to the label if a key has no description. Do not change `WEARABLE_PROVIDER_LABEL`,
  `WEARABLE_PROVIDER_AVAILABLE`, or the registry.

## Owner action after deploy (one-time, document in the PR description)
The Whoop connection that already exists was created **before** `offline`, so it has **no `refresh_token`**.
After this ships, in the player app: **Disconnect Whoop → Connect again once**, so the new `offline` scope
is granted and a `refresh_token` is stored. Every player who connects from now on gets it automatically —
no action needed for them.

## Guardrails / tests
- **Boundary test (mandatory):** refresh + sync still write only `wearable_sleep_data` /
  `wearable_daily_data`; assert no write to `readiness_entries` / `v_coach_readiness_today_v8`.
- Scope test: `authorizeUrl` includes `offline` in the `scope` param.
- Refresh unit test (mock fetch): `refreshAccessToken` posts `grant_type=refresh_token` + client creds,
  returns the new access token and the rotated refresh token (and keeps the old refresh token when the
  response omits one).
- `ensureFreshState`: expired `expires_at` + refresh_token present → refreshes and persists; not-yet-expired
  → no refresh call; no refresh_token → no call, no throw (falls through to the existing 401 path).
- Reactive retry: first `fetchSleep` throws `401` → refresh once → retry succeeds → one refresh only.
- Providers without `refreshAccessToken` (e.g. a non-expiring token provider) are untouched.
- No token values in logs or `last_sync_error`.
- `npx eslint src/lib/wearables/whoop.ts src/lib/wearables/sync.ts src/lib/wearables/types.ts src/components/player/WearableConnectCard.tsx` — lint-clean. Typecheck passes.

## Not in scope
Wiring Whoop into the readiness verdict (fusion) and a nightly sync cron are separate tasks. This brief only
keeps the existing connect + manual "Sync now" working past the 1-hour token window and fixes the copy.
