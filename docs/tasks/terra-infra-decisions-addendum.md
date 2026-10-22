# Terra integration — infra map decisions (addendum to terra-integration-brief.md)

The Explore pass found the repo has **three parallel, disconnected integration stacks**. This changes the
plan. Read before implementing.

| Stack | Root | Tables | Feeds readiness? |
|---|---|---|---|
| **A. wearables** (Polar/Whoop impls) | `src/lib/wearables/`, `/api/wearables/*` | `wearable_connections`, `wearable_sleep_data`, `wearable_daily_data` | only check-in auto-fill + post-match-recovery reads — **not** the decision engine |
| **B. direct-Whoop** | `src/lib/integrations/whoop/`, `whoopStore.ts`, `/api/integrations/whoop/*` | `athlete_integrations`, `athlete_monitoring_snapshots` | intended, but the decision-engine read is **inert** |
| **C. integrations-live** (webhook orchestration) | `src/lib/micropulse/integrationsLive/`, `/api/integrations-live/*` | abstract/in-memory, **no wearable sinks** | no |

## Decisions (resolve the gotchas)

1. **Build Terra in Stack A.** Implement `src/lib/wearables/terra.ts` + register it + flip
   `WEARABLE_PROVIDER_AVAILABLE.terra=true`. The provider-agnostic `syncConnection()` in
   `src/lib/wearables/sync.ts` already upserts `WearableSleepNight`/`WearableDailySummary` into the shared
   `wearable_sleep_data` / `wearable_daily_data` sinks keyed by `connection_id`+`player_id` — works for any
   provider. The connect UI (`src/components/player/WearableConnectCard.tsx`) is data-driven off
   `WEARABLE_PROVIDER_LABEL` → Terra auto-renders once available + in the registry.

2. **⚠️ Webhook URL is wrong as currently set.** The Terra dashboard webhook was pointed at
   `/api/integrations-live/webhooks/terra` (Stack C) — but that route (a) excludes `TERRA` in
   `parseProvider`, (b) verifies a bare-hex `x-signature` (Terra uses a `terra-signature: t=…,v1=…` HMAC),
   and (c) ingests into the abstract Stack-C pipeline, **not** the wearable sinks. **Add a dedicated Stack-A
   Terra webhook** instead: `POST /api/wearables/terra/webhook` that (i) verifies Terra's `terra-signature`
   (HMAC-SHA256 `t=`/`v1=` with `TERRA_SIGNING_SECRET`), (ii) maps `sleep`/`daily` payloads →
   `WearableSleepNight`/`WearableDailySummary` → the `sync.ts` upsert path, (iii) returns 200.
   **→ Owner action: change the webhook URL in Terra to `https://app.micropulse.is/api/wearables/terra/webhook`.**

3. **Migrations missing — add them.** There is **no `CREATE TABLE` migration** for `wearable_connections`,
   `wearable_sleep_data`, `wearable_daily_data` (Stack A). Add a migration creating all three (columns per
   the code in `sync.ts`/`callback`), with `unique(profile_id, provider)` on connections,
   `unique(connection_id, sleep_date)` on sleep, `unique(connection_id, measurement_date)` on daily, + RLS.
   Terra will write to these; confirm they aren't provisioned out-of-band before assuming they exist.

4. **Readiness stays a side signal (honest scope).** The decision engine is **inert** for wearables today
   (`fetchWhoopSnapshots` queries a non-existent view `monitoring_snapshots_normalized`; "verdicts ignore
   WHOOP"). So Phase 1 Terra data surfaces in **check-in auto-fill + status + post-match-recovery reads**,
   **not** the readiness colour. That's correct per the manifesto (recovery never sets the colour). Wiring
   Terra/Whoop into the verdict is a separate, later decision-engine task — out of scope for Phase 1.

5. **Dedupe across sources (app-level).** Unique keys dedupe *within* a source only. Since direct-Whoop
   (Stack B) and Terra-Whoop (Stack A) can both land the same player/date, enforce **one active source per
   player** in app code: on Terra connect, deactivate the player's existing direct-Whoop connection
   (`athlete_integrations.status='revoked'` and/or `wearable_connections.is_active=false`), and have the
   check-in/post-match reads prefer a single canonical source. Don't double-count.

6. **Connect UI — route everything through Stack A.** The page `src/app/player/settings/integrations/page.tsx`
   is **Whoop-only Stack B** (`/api/integrations/whoop/*`). Either convert it to render `WearableConnectCard`
   (Stack A) or hide it for new links, so all new connects go through `/api/wearables/connect` (where Terra's
   Option-1 generateWidgetSession special-case lives). Suppress the standalone direct-Whoop connect for new
   links.

## Net effect for Phase 1
Terra (Whoop) → `/api/wearables/terra/webhook` (new, Terra-signature verified) → `wearable_sleep_data` /
`wearable_daily_data` via `sync.ts` → check-in auto-fill + status + post-match recovery. One active source
per player. Readiness colour untouched. Migration for the Stack-A tables added. Owner changes the Terra
webhook URL to the `/api/wearables/terra/webhook` path.

*(Full infra map with file paths, line numbers, column lists and function signatures is in the Explore
report — paste that alongside this addendum.)*
