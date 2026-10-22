# Terra integration — status + next steps (hand to Claude Code)

Owner-side setup (Terra dashboard + Vercel) is **done**. What's left is the code, per
`docs/tasks/terra-integration-brief.md` (implementation-ready, Phase 1 = Whoop).

## ✅ Done (owner, in dashboards)

- **Terra account:** production env. `dev-id = micropulse-prod-AcuwmPJraZ`.
- **Terra → Sources:** **Whoop** enabled (Phase 1). *(Whoop still needs its "Add Credentials" — a Whoop
  developer app client_id/secret — before real players can connect; test data works without it.)*
- **Terra → Destinations:** **Webhook** (Push mode).
  - Host/URL: `https://app.micropulse.is/api/integrations-live/webhooks/terra`
  - Signing secret generated + copied.
- **Vercel env (Production):** `TERRA_SIGNING_SECRET`, `TERRA_DEV_ID`, `TERRA_API_KEY`, `TERRA_ENV=production`.
- **Redeploy** production so the env vars load. ← do this if not done yet.

## ⏳ To build (Claude Code — from `terra-integration-brief.md`)

1. **`src/lib/wearables/terra.ts`** — provider impl: `generateWidgetSession` (connect, body incl.
   `providers:"WHOOP"` for Phase 1), REST `fetchSleep` / `fetchDailySummary`, `disconnect`. Reads `TERRA_*`.
2. **`/api/wearables/connect`** — Option 1: if `provider==="terra"`, call generateWidgetSession server-side,
   return its `url`; `reference_id = player/profile id`.
3. **`/api/integrations-live/webhooks/terra`** — verify `terra-signature` (HMAC-SHA256 with
   `TERRA_SIGNING_SECRET`); handle `auth` (store Terra `user_id` on `wearable_connections`) + `sleep`/`daily`
   → shared `WearableSleepNight` / `WearableDailySummary` sinks; store raw payload; **return 200** (Terra
   needs 200 to deliver/verify). Reject unverified requests.
4. **Registry + flag:** register terra in `registry.ts`; flip `WEARABLE_PROVIDER_AVAILABLE.terra = true`;
   make Terra the single "Connect watch" entry in the player UI.
5. **Whoop double-ingest guard:** one active source per player on `wearable_connections`; dedupe on
   (`player_id`,`date`,metric) — never ingest the same player's Whoop twice (Terra + existing direct Whoop).
6. **Boundary + tests:** recovery/sleep/HRV are side signals beside the check-in — **never** the readiness
   colour. Tests: signature verify, sleep/daily mapping, double-ingest guard, boundary.

## ✅ Verify without owning a Whoop

After the webhook handler ships + returns 200: in Terra dashboard click **"Generate test data"** → Terra
posts simulated Whoop payloads to the webhook → confirm rows land + readiness colour is untouched.
(Terra **Users / Payload history** shows delivery success/failures for debugging.)

## Still needed before real players connect
- Whoop **developer app** credentials (client_id/secret) added to Terra's Whoop source. You likely already
  have these from the direct-Whoop setup you prepared earlier — reuse them.
