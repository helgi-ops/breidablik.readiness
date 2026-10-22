# Whoop (direct) — current status + the one Code task

Decision: most players use Whoop → use MicroPulse's **direct Whoop** integration (already built) over Terra.
Keep Terra **one month / downgraded** while surveying what players actually wear; decide after (don't
hard-cancel yet).

## ✅ Already done (owner)
- WHOOP developer app **"MicroPulse"** created. Status: **Sandbox (10 members)**.
- Scopes set (read:recovery, read:sleep, read:workout, read:profile, +cycles/body_measurement).
- **Both** redirect URLs registered in the WHOOP app:
  `https://app.micropulse.is/api/wearables/callback` **and** `/api/integrations/whoop/callback`.
- Privacy policy + contact set.
- **Vercel env (Production):** `WHOOP_CLIENT_ID`, `WHOOP_CLIENT_SECRET` set + redeployed.

## ⚠️ Current reality (important — the old plan was out of date)
- The player page `/player/settings/integrations` now renders the **Stack A** `WearableConnectCard`
  (data-driven), NOT the old Whoop-only Stack B page.
- The Stack A Whoop provider (`src/lib/wearables/whoop.ts`) uses the **same** `WHOOP_CLIENT_ID/SECRET`,
  routes via `/api/wearables/connect` → redirect `/api/wearables/callback` (registered), and writes to the
  shared sinks **`wearable_sleep_data` / `wearable_daily_data`** (same as Terra/Polar) — NOT
  `athlete_monitoring_snapshots`.
- Whoop currently shows **"Coming soon"** because `WEARABLE_PROVIDER_AVAILABLE.whoop = false`.

## ⏳ The ONE Code task now
In `src/lib/wearables/types.ts`: set **`WEARABLE_PROVIDER_AVAILABLE.whoop = true`**. Confirm `whoop` is in
`PROVIDERS` in `registry.ts` (it is). **Redeploy.** → Whoop shows "Connect" on the player card, connects via
`/api/wearables/connect` using the keys already in env.

## Then (owner)
1. Test yourself: open the player card → Whoop → Connect → sign in to your own Whoop → authorize.
   (Band must be active + worn ~1–2 days before recovery/sleep data exists.)
2. Ask Claude to verify `wearable_connections`(whoop) + `wearable_sleep_data`/`wearable_daily_data` rows.
3. Before sending to >10 players, apply for **WHOOP Build (100 members)** via "Open Request" — the WHOOP API
   is **free**; tiers are approval-gated, and the cap grows as you fill it (half-connected to move up). Only
   cost is each player's own WHOOP membership (their cost, not yours).
4. Send players the connect message (how to connect their own Whoop).

## Code leftover for later (not blocking connect/ingest)
- **Readiness is inert for Whoop today** (verdicts ignore it). Data lands as a side signal (check-in
  auto-fill / status / post-match recovery). Making it influence the verdict is a separate fusion task;
  boundary unchanged — recovery never sets the readiness colour.
- Optional: a daily sync cron so Whoop data refreshes automatically.

## Cost
Direct Whoop: **$0** for the API, scales free up the tiers, you own the data. Terra ≈ $499/mo (~$6k/yr) +
per-user caps. Keep the Terra code in the repo for future multi-brand breadth; keep the subscription only
as long as you need other wearables it can reach.
