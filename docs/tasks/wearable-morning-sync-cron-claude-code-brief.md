# Claude Code brief — morning wearable sync cron (so check-in auto-fill has last night's sleep)

## Why
Whoop (direct, Stack A) now lands real sleep + recovery for connected players (verified: Anton Logi has
14 sleep + 14 daily rows, `offline` scope, refresh_token stored). The check-in form **already auto-fills**
sleep duration + sleep quality from `wearable_sleep_data` (`src/app/player/checkin/page.tsx` ~line 326:
scoped `.eq("player_id", …)`, picks the most recent night within 36 h, pre-fills both steps + shows a
"📱 Forfyllt frá …" hint, player can override).

**The gap:** sync only runs on connect or manual "Sync now". There is **no scheduled sync**. So at
tomorrow's check-in, the latest synced night may be the night *before* last — the player sees pre-filled
values that are one night stale. We want last night's sleep in the DB before players check in.

Good news: the route already supports a global cron sync — `src/app/api/wearables/sync/route.ts` has
`isCronCall(req)` (Bearer `CRON_SECRET` / `REMINDER_CRON_SECRET`) → `syncAllConnections()`. It's only
missing (a) a GET handler (Vercel Cron invokes paths with **GET**; the route currently exports **POST**
only), and (b) cron entries in `vercel.json`. The token-refresh fix already shipped, so a cron running
hours after the token was issued will refresh expired access tokens automatically — no stale-token failures.

**Boundary (unchanged):** this only writes `wearable_sleep_data` / `wearable_daily_data` and pre-fills the
player's *self-report* (which they confirm/override). It never writes `readiness_entries.color` /
`v_coach_readiness_today_v8`. The readiness engine runs unchanged on the confirmed check-in.

## Fix 1 — add a GET handler to the sync route (cron entry point)
`src/app/api/wearables/sync/route.ts`: add a `GET` that runs the same cron branch. Keep `POST` exactly as
is (manual player sync + its own cron path).

```ts
// Vercel Cron invokes with GET and (when CRON_SECRET is set) an
// Authorization: Bearer ${CRON_SECRET} header. Reuse isCronCall().
export async function GET(req: Request) {
  if (!isCronCall(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await syncAllConnections();
  return NextResponse.json({ ...result, ok: true });
}
```

(No change to `isCronCall`, `POST`, or `syncAllConnections`.)

## Fix 2 — schedule it in `vercel.json`
Iceland runs on GMT year-round, so **UTC = local time** — no DST math. WHOOP scores a night's sleep within
~an hour of wake, and players check in through the morning, so sync a few times across the morning window
to catch each player's night before they open check-in. Add to the `crons` array:

```json
{ "path": "/api/wearables/sync", "schedule": "0 5 * * *" },
{ "path": "/api/wearables/sync", "schedule": "0 6 * * *" },
{ "path": "/api/wearables/sync", "schedule": "0 7 * * *" },
{ "path": "/api/wearables/sync", "schedule": "0 8 * * *" },
{ "path": "/api/wearables/sync", "schedule": "0 9 * * *" }
```

(Hourly 05:00–09:00. `syncAllConnections` already loops only `is_active` connections with a 14-day window,
so re-running is cheap and idempotent — upserts dedupe on `connection_id,sleep_date` /
`connection_id,measurement_date`. Keep the existing entries untouched.)

**Owner note:** `CRON_SECRET` must be set in Vercel env (Production) for the cron auth to pass — the repo's
other crons rely on Vercel injecting `Authorization: Bearer ${CRON_SECRET}` automatically. Confirm it's
present; if not, set it (any long random string) and redeploy. Do **not** print its value in chat/logs.

## Fix 3 — small polish: provider label in the check-in hint
`src/app/player/checkin/page.tsx` (two spots, ~line 694 "Forfyllt frá …" and ~line 723 "Mælt af …"):
currently `wearableSleepHint.provider === "polar" ? "Polar" : wearableSleepHint.provider`, so Whoop shows as
lowercase "whoop". Replace both with a capitalised display name, e.g. a tiny local map
`{ polar: "Polar", whoop: "Whoop", terra: "Terra", garmin: "Garmin", oura: "Oura", vital: "Vital" }` with a
fallback that capitalises the first letter. (Don't reuse `WEARABLE_PROVIDER_LABEL` here — "Terra (all
wearables)" is too long for the inline hint.)

### Optional (flag, Anton uses EN): the hint text is hardcoded Icelandic
The "📱 Forfyllt frá …", "Mælt af …" and "Þú getur breytt …" strings are Icelandic literals even when the
app is in English (Anton's app is set to EN). If quick, branch on the existing `lang`/`isIS` already in this
component and add EN equivalents ("📱 Pre-filled from {provider} — {h}h {mm}m.", "Measured by {provider}:
{h}h {mm}m.", "You can change it if it doesn't match how you slept."). If not trivial, leave as a separate
ticket — not blocking.

## Tests / guardrails
- GET `/api/wearables/sync` with no/invalid Bearer → 401; with `Bearer ${CRON_SECRET}` → runs
  `syncAllConnections`, returns `{ ok: true, total, ok, failed, errors }`.
- POST path unchanged (manual player sync still works; existing tests pass).
- Idempotency: running the cron twice in a morning doesn't duplicate rows (upsert on the unique keys).
- **Boundary test (mandatory):** cron sync writes only `wearable_sleep_data` / `wearable_daily_data`; no
  write to `readiness_entries` / `v_coach_readiness_today_v8`.
- Hint label: a Whoop pre-fill renders "Whoop" (capitalised), not "whoop".
- `npx eslint src/app/api/wearables/sync/route.ts src/app/player/checkin/page.tsx` — lint-clean; typecheck
  passes.

## Not in scope
Wiring Whoop recovery into the readiness verdict (fusion) stays a separate task. This brief only makes last
night's sleep reliably present before morning check-in, plus two small UI polishes.
