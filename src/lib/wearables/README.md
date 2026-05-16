# Wearable Sync

Player wearable data (sleep, HRV, resting HR) feeding into readiness check-in.

## Architecture

Provider-agnostic. Add a new wearable = add the key to `WearableProviderKey`,
drop a new provider implementation, register it in `registry.ts`. Nothing
else changes.

```
src/lib/wearables/
├── types.ts              # WearableProvider interface + data shapes
├── registry.ts           # Provider key → implementation lookup
├── sync.ts               # syncConnection() / syncAllConnections()
├── polarAccesslink.ts    # Polar Flow / Accesslink (free, OAuth 2.0)
└── README.md             # this file
```

```
src/app/api/wearables/
├── connect/route.ts      # POST → returns OAuth authorize URL (signed state)
├── callback/route.ts     # OAuth return → persist connection → initial sync
├── status/route.ts       # GET → current connections + recent sleep
├── disconnect/route.ts   # POST → soft-disconnect + provider deregister
└── sync/route.ts         # POST → manual sync, OR cron sync with secret
```

## Database

- **wearable_connections** — one row per (profile, provider). OAuth tokens
  here. RLS: player sees own connection (no tokens), service_role writes.
- **wearable_sleep_data** — nightly sleep summary. `sleep_date = wake-up date`.
- **wearable_daily_data** — resting HR + HRV per day.

Both data tables are wired into RLS so a coach reads their team's players'
data, identical to the existing `players` table policies.

## How player check-in uses it

`/player/checkin` loads with auto-fill:

1. After playerId is resolved, query `wearable_sleep_data` for the most
   recent night within 36 hours of `today`.
2. If `total_sleep_min` is present:
   - Pre-fill `sleepDuration` step from `total_sleep_min` → 1–6 scale
     (`<5h=1, 5-6h=2, 6-6.5h=3, 6.5-7h=4, 7-8h=5, 8h+=6`).
   - Pre-fill `sleepQuality` step from `provider_score` (Polar Sleep+ 1-100)
     → 1–6 scale (`<40=1 ... 85+=6`).
3. Show a `📱 Forfyllt frá Polar — 7h 12m` banner on the sleep steps so
   the player knows the value isn't their own self-report and can override
   if it feels off.

The player ALWAYS controls the final value. We just save typing on a
typical morning when the wearable data is good.

## Adding a new provider

1. Add key to `WearableProviderKey` union in `types.ts`. Set
   `WEARABLE_PROVIDER_AVAILABLE[key] = true`.
2. Add label in `WEARABLE_PROVIDER_LABEL`.
3. Drop an implementation file `src/lib/wearables/<key>.ts` that exports
   a `WearableProvider`.
4. Wire it into `registry.ts`.

`exchangeCode()` returns a `WearableConnectionState` — whatever the
provider's stable identity is (`providerUserId` + tokens). The sync layer
treats it as opaque and stores it in `wearable_connections.access_token`
+ `provider_user_id`.

`fetchSleep()` and `fetchDailySummary()` return normalised shapes
(`WearableSleepNight`, `WearableDailySummary`) — the upsert path in
`sync.ts` works for any provider that fills these in.

## Provider status

| Provider | Status | OAuth | Free? | Notes |
|---|---|---|---|---|
| Polar (Accesslink) | ✅ Live | 2.0 | Yes | Sleep + Nightly Recharge (HRV) |
| Whoop | ✅ Live | 2.0 | Yes (dev) | Sleep stages + Recovery (HRV + resting HR). App review needed for production-scale. |
| Vital aggregator | 🔜 Stub | 2.0 | $50+/mo | Covers Apple, Garmin, Whoop, Oura — single OAuth |
| Apple Health | 🔒 Native-only | — | Yes | PWAs can't read HealthKit. Need Capacitor native shell. |
| Garmin Health | 🔜 Future | **1.0a** | Partnership | OAuth 1.0a + webhook-only + Garmin approval (2-6 wks) |
| Oura | 🔜 Future | 2.0 | Personal token | Easier — has personal access tokens |

Pragmatic path: stick with Polar direct + Vital aggregator for everything
else. Direct Garmin/Apple/Whoop/Oura integrations only pay off at scale
(500+ paying users) where Vital's per-user cost exceeds maintaining 4
partnerships in-house.

## Env vars

```
POLAR_CLIENT_ID          # Same as Team Pro (shared OAuth portal)
POLAR_CLIENT_SECRET      # Same as Team Pro
WHOOP_CLIENT_ID          # From https://developer.whoop.com
WHOOP_CLIENT_SECRET
NEXT_PUBLIC_APP_URL      # https://app.micropulse.is
WEARABLE_STATE_SECRET    # 32+ char random — signs OAuth state
```

**Polar admin portal:** https://admin.polaraccesslink.com — register the
callback `https://app.micropulse.is/api/wearables/callback` separately
from the Team Pro callback (Polar treats them as distinct redirect URIs
even though they share credentials).

**Whoop developer portal:** https://developer.whoop.com — create an app,
register the same callback URI. Sandbox mode works in dev with 5 test
users; production-scale (commercial use) requires submitting the app
for Whoop review (free, ~1-2 weeks turnaround).

## Cron

Once Polar Accesslink is in production, add to `vercel.json`:

```json
{ "path": "/api/wearables/sync", "schedule": "0 7 * * *" }
```

Pulls last 14 days for every active connection each morning at 07:00 UTC.
Polar Accesslink also supports webhooks — a future enhancement is a
webhook receiver at `/api/webhooks/polar` that triggers
`syncConnection(connId)` on push, eliminating the cron-poll lag.
