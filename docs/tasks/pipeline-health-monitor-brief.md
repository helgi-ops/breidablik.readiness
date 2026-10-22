# Code brief — Pipeline freshness + System-health monitor (trust layer, step 1)

## Why (grounded in real incidents this session)
Three silent failures showed the product's core promise ("what the coach sees = what the AI / report /
export sees") can break invisibly:
- **`stage4_decisions` stopped writing on 2026-09-14** (a dropped constraint named by a function) and nobody
  noticed for ~3.5 weeks — the coach's READY/MODIFIED/RECOVERY tiles silently read 0.
- **`v_team_readiness_today`** (its downstream) returned empty for teams that *did* have check-ins.
- **`week_plans`** was empty for a team, so Today **fabricated** a session instead of showing a rest day.

A simple freshness/consistency monitor would have caught all three within a day. **Trust is the product**, and
this is also the prerequisite for the "one screen, depth on click" work (P4): a chip is only trustworthy if the
pipeline feeding it is alive. Build this first.

Scope here = **#2.1 (pipeline freshness) + #2.3 (system-health admin page) + a daily alert**. Read-only.
(Provenance tagging — #2.2, extending `is_imputed` to load — is a separate follow-on brief.)

## What to build
### 1. The checks (a small, declarative registry)
A server lib (`src/lib/micropulse/health/checks.ts`) listing each monitored pipeline with: a query, an
**expected freshness / invariant**, and a **severity** (red = a core decision pipeline stopped; amber = stale
/ degraded; info = expected gap). Compute **per active team** where relevant. Concrete checks, keyed to the
tables/views we verified:

| Check | Signal | Fires when |
|---|---|---|
| Check-ins flowing | `readiness_entries` max(entry_date) per team | no check-ins for N days on a day the squad was expected to check in |
| Canonical colour fresh | `v_coach_readiness_today_v8` rows today per active squad | 0 rows today for a team with active players (amber) |
| **Stage-4 decisions alive** | `stage4_decisions` max(entry_date) | older than `readiness_entries` max(entry_date) → engine stalled (**red**) — this is the exact Sept-14 failure |
| **Team signal consistent** | `v_team_readiness_today` | a team has ≥1 check-in today but **0** team-signal rows (**red**) — the downstream symptom |
| Wearable sync | `wearable_connections.last_synced_at` / `wearable_sleep_data` latest per active connection | active connection not synced in >48 h (amber); `last_sync_error` set (amber) |
| External load ingestion | `player_external_load_daily` max(date) per GPS team | no load row in N days despite a scheduled session (amber) |
| **Week plan present** | `week_plans` row for today per active team | no plan row for today → unplanned-day / fabrication risk (amber/info) |
| Cron liveness | each `vercel.json` cron's downstream effect (e.g. wearables sync, notifications) | expected effect not seen within its window (amber) |

Keep queries cheap: `max(date)` + `count(*)` + small joins. Thresholds (N days, cadence) are per-check
constants, overridable per team later. Respect existing **tier/sport gating** — don't flag "no GPS load" for a
no-GPS (Lite) team; don't flag "no wearable" for a team with no connections.

### 2. API — `GET /api/admin/health`
Admin-gated (`profiles.role='ADMIN'` / the existing `requireCoachAccessForTeam` admin path). Runs the registry
and returns, per check × team, `{ status: 'ok'|'amber'|'red', detail, latest, expected }`. Read-only
(service-role read; **never writes** to the monitored tables).

### 3. System-health admin page — `/coach/admin/health`
Admin-only page: a grid of **green / amber / red per pipeline × team**, newest-breakage first, each row showing
"latest data / expected / what it means" in plain language and a link to the relevant surface. One glance
answers "is everything flowing?". (Dogfood the manifesto's layered read on your own infra: verdict dot → plain
why → raw query behind a toggle.)

### 4. Daily alert — `GET /api/admin/health/cron`
A scheduled check (add to `vercel.json` crons, e.g. `0 6 * * *`; auth via `CRON_SECRET` like the other crons —
see the existing `isCronCall` pattern). It runs the registry and, on any **red** (and new amber), notifies the
owner — reuse the existing notifications pipeline or send an email/log. **Dedupe** so a persistent issue alerts
once, not daily (a small `pipeline_health_log` table recording last-alerted status per check; the only schema
addition, saved as a migration). This is the piece that turns "silent for 3.5 weeks" into "known next morning".

## Guardrails / tests
- **Read-only + admin-only.** No writes to monitored tables; non-admin → 403. Boundary: never reads/writes
  `readiness_entries.color` as a verdict and never changes any data — pure observation.
- **Tier-aware:** no false reds for Lite / no-GPS / no-wearable teams (reuse the existing gating sets).
- **Regression test for the Sept-14 class:** a test that, given a team with check-ins today but a stale
  `stage4_decisions`, the stage-4 + team-signal checks return **red**. (This is the bug that started this.)
- **Alert dedupe:** a persistent red alerts once; clears and re-alerts on recurrence.
- Cheap: the full registry runs in well under a few seconds for all teams.
- `npx eslint` on changed files; typecheck; `pipeline_health_log` migration saved under `supabase/migrations/`.

## Why this first (and how it ties to the brainstorm)
- It is **small** and would have caught every silent failure we hit this session.
- It is the **foundation for P4** (#1): the "one screen" is only trustworthy if each chip's pipeline is known
  to be alive — the health monitor is what guarantees that.
- Natural follow-ons (separate briefs): **#2.2** provenance tags on load (measured / estimated / stale —
  surfacing the estimated rows we created for Anton, Hlynur, Höskuldur); then the **P4 coverage audit** (every
  engine emits an exception-gated, provenance-carrying chip to Today).
