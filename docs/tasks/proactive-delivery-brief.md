# Proactive delivery — turn the pull system into push (coach digest / alerts / weekly report)

MicroPulse is almost entirely **pull**: the coach opens a page and the signals are there. The single
biggest experience gap now that `coach_signals` exists is **push** — the same rows can reach the coach
without them opening anything. Every automated notification today is **player-facing** (check-in / RPE
/ CMJ reminders, opt-in daily nudge, personal-best) via `/api/notifications/cron`. There is **no
coach-facing digest, weekly report, or threshold alert**. This brief adds them, reusing what's already
built. Best next brief after Phase 1 (`coach_signals`) per the implementation roadmap.

## Non-negotiable
- **Never touches the readiness colour.** A digest/alert reports the same descriptive `coach_signals`
  that sit BESIDE `v_coach_readiness_today_v8.final_color`; it never restates them as the verdict, and
  never writes `readiness_entries.color`.
- **Opt-in, default OFF**, per coach — mirrors the player nudge posture. No coach gets surprise email.
- **Conservative, deduped, actionable-only.** This is exactly where over-flagging hurts most (the
  yellow-oversensitivity lesson): a push fires only for a genuinely actionable, NEW signal, once.
- **Confidence + provenance on everything**; AI (Addition 3) labels itself as AI and cites the signals.
- English default, IS toggle — every user-facing string is `{ en, is }`.

## Already built (don't rebuild — wire these together)
- **`coach_signals`** (`supabase/migrations/20260825190000_coach_signals.sql` + `..._per_player.sql`) —
  rows `{ team_id, engine, player_id, level, label{en,is}, why{en,is}, confidence, counterfactual, href,
  as_of }`. `level ∈ steady | watch | elevated | task`. Engines: `game_plan_fit`, `post_training`,
  `match_minutes`, form-vs-state, robustness, hrv_recovery, hr_load, recovery-watch (team + per-player).
  Computed by `computeSignals()` in `src/app/api/coach/signals/route.ts` (GET read-through cache:
  delete-then-insert per `(team_id, as_of)`). **This is the content source — do not recompute engines.**
- **Coach web-push channel (ready-made):** `coach_push_subscriptions`
  (`supabase/migrations/20260423112221_coach_push_subscriptions.sql`, keyed on `profile_id`) +
  `pushNewCoachNotifications(...)` in `src/lib/notifications/push.ts` — resolves a team's coaches
  (`profiles` role coach/admin/staff + `coach_teams`), loads active subs, `sendWebPush` with
  `{ title, body, url }`. **Use this verbatim for alerts/digest push.**
- **Email:** `sendTransactionalEmail({ to, subject, text, html? })` (`src/lib/email/sendTransactionalEmail.ts`,
  Resend). Reference send pattern = **reserve → send → finalize** against a dedupe log, as in
  `runReadinessEmailReminders` (`src/lib/reminders/emailReminders.ts`) with `email_reminder_log`.
- **Cron host:** `src/app/api/notifications/cron/route.ts` — Bearer `CRON_SECRET` / `REMINDER_CRON_SECRET`;
  every `vercel.json` cron hits this one route and it **self-selects by wall-clock** (±30 min tolerance)
  via `match*Slot` helpers. Add coach slots here, don't add a parallel cron.
- **Threshold content sources (UI-only today):** `buildTeamAlerts` (`coachCommand/alerts.ts`,
  severity critical|warning|info + `playerIds`), `buildTeamExternalLoadAlerts` (`externalLoad/teamAlerts.ts`),
  `buildSmartAlert` (`automation/alerts.ts`). They already carry severity + title + body + affected
  players — the same shape as a signal. But **prefer `coach_signals` as the canonical source** so push
  and the Today chips never disagree; use these builders only if a needed alert isn't yet a signal.
- **Tiering:** `getTeamPlanTier(sb, teamId)` / `isEliteTeam` + `ELITE_REQUIRED_RESPONSE` (402)
  (`src/lib/micropulse/elite/index.ts`); nav map `ELITE_ROUTE_RULES` (`product/routeGating.ts`).

## New pieces (small)
1. **`coach_notification_preferences`** (new table — there is no coach equivalent of
   `player_notification_preferences`). One row per coach `profile_id`:
   `{ profile_id, team_id, morning_digest bool default false, threshold_alerts bool default false,
   weekly_report bool default false, channel text default 'push' (push|email|both),
   digest_hour smallint default 7, quiet: no send outside 07–21 local }`. RLS self-read/write by
   `profile_id`. Save `.sql` under `supabase/migrations/` AND apply via `apply_migration`.
2. **`coach_notification_log`** (dedupe, mirror `email_reminder_log`): `{ profile_id, kind
   (digest|alert|weekly), signal_key text, as_of date, sent_at, provider_message_id }` with a unique
   key on `(profile_id, kind, signal_key, as_of)` so a double cron-fire never double-sends. `signal_key`
   for an alert = `engine:player_id` (or `engine` for team rows); for a digest = the date.
3. A **coach-digest builder** `src/lib/notifications/coachDigest/` (pure compose + a send fn), and the
   cron slot wiring. Settings UI: a small opt-in panel on `/coach/settings` (reuse the player-prefs
   toggle pattern), bilingual.

## Addition 1 — Morning digest (deterministic, **PRO**)
Once a day at the coach's `digest_hour` (default 07:00 local; add `matchCoachDigestSlot` to the cron's
self-selection). For each team with ≥1 opted-in coach and `plan_tier ≥ PRO`:
- **Ensure freshness:** call `computeSignals(team, today)` first (this also warms the read-through cache
  the dashboard reads — the digest job becomes the nightly writer everyone wanted).
- **Compose** from today's `coach_signals`: counts by level (`elevated` / `watch`), the named players
  behind the top 3 `elevated`/`task` rows (label + first `why` line + counterfactual if present), and a
  one-line "all steady" when nothing is actionable (still send — a quiet "nothing to action" builds
  trust; or make the empty-day send a pref). Body copy is `{ en, is }` per the coach's lang.
- **Deliver** by `channel`: push via `pushNewCoachNotifications` (`url:"/coach"`), and/or email via
  `sendTransactionalEmail` (coach address = `auth.users.email` joined on `profiles.id` — add a
  `get_team_coaches_with_email(p_team_id)` RPC analogous to the player-only `get_active_players_with_email`).
  Dedupe via `coach_notification_log` (kind=`digest`, `signal_key`=today).
- **HTML email:** none exists yet — build a minimal inline-styled template (no external assets;
  traffic-light chips as coloured text/emoji). Plain-text fallback in `text` (Resend takes both).

## Addition 2 — Threshold alerts (event-driven, **PRO**)
Not a schedule — fires when the nightly recompute surfaces a **NEW** actionable signal. In the same job
that refreshes `coach_signals`, diff today's rows against yesterday's cache: a row that **crossed into
`elevated` (or `task`)** and did not exist at that level yesterday is an alert. Push immediately via
`pushNewCoachNotifications` (`url` = the signal's `href`), deduped by `coach_notification_log`
(kind=`alert`, `signal_key`=`engine:player_id`), with a **cooldown** (no re-alert for the same
`signal_key` within N days even if it flickers). Gate: `threshold_alerts` pref ON + `plan_tier ≥ PRO`.
- **Actionable-only smell test:** only `elevated`/`task` with `confidence ≥ moderate` alert. `watch` and
  low-confidence never push — they live on the dashboard chip only. Log (don't send) what you suppress,
  so the flag-rate can be audited (the same discipline the readiness over-sensitivity fix taught).

## Addition 3 — Weekly report (AI narrative, **ELITE**)
Friday ~15:00 local (`matchCoachWeeklySlot`). A once-a-week email: a **deterministic** 7-day rollup
(per-player signal history, load trend, availability, notable counterfactuals) — PRO — **plus** an
**AI-written narrative** that translates the week into plain coaching language. The AI layer is the
**ELITE** gate (per `elite/index.ts`: PRO already includes notifications + the deterministic alert layer;
ELITE is the AI translation layer). So: build the deterministic weekly rollup for PRO; wrap the
AI-written summary behind `isEliteTeam` (→ `ELITE_REQUIRED_RESPONSE` on the manual "generate now" route,
and skip the AI paragraph in the cron for non-ELITE teams, sending the deterministic rollup only).
- AI paragraph is **labelled "AI summary"**, cites the underlying signals, and never invents a number.
- Add the weekly-report page/route (if any) to `ELITE_ROUTE_RULES` for the lock badge; the deterministic
  digest/alerts pages are **not** ELITE-gated (PRO).

## Guardrails
- Descriptive only — none of this becomes or overrides the readiness colour.
- Opt-in default OFF; respect `channel` and quiet hours; one send per `(profile_id, kind, signal_key,
  as_of)` — the dedupe log is the guarantee against the cron's ±30-min double-fire.
- Alerts conservative: `elevated`/`task` + `confidence ≥ moderate` only; cooldown; suppression logged.
- Reuse the existing cron auth + slot self-selection; do NOT add a second cron endpoint or secret.
- New migrations saved under `supabase/migrations/` (timestamped) AND applied via `apply_migration`.
- No new lint errors; bilingual copy; tier checks server-side (never trust the client for gating).

## Verification
- Unit: digest composer over a fixture `coach_signals` set → correct counts, top-3 selection, empty-day
  copy; alert-diff picks only newly-`elevated` rows; dedupe key prevents a second send.
- Tier: PRO team gets digest + deterministic weekly; FREE gets nothing; non-ELITE weekly omits the AI
  paragraph; `isEliteTeam` false → 402 on the manual generate route.
- Dry-run against Breiðablik (richest data): run the digest job for `today`, assert push/email would go
  to the opted-in coach only, `coach_notification_log` gets one row, a re-run sends 0 (idempotent).
- Flag-rate gate before squad-wide enable: over N real team-days, alert rate must be low (a handful, not
  most teams every night) — same smallest-worthwhile-change gate as every new signal.

## Suggested order
1. `coach_notification_preferences` + `coach_notification_log` migrations + `/coach/settings` opt-in panel.
2. Addition 1 (morning digest) — proves the compose→dedupe→deliver pipeline end-to-end (PRO).
3. Addition 2 (threshold alerts) — the diff-and-push on top of the same refresh job (PRO).
4. Addition 3 (weekly report) — deterministic rollup (PRO) then the ELITE AI narrative.

Ref: `docs/tasks/coach-signals-cache-and-today-chips-brief.md` (the signal pipeline this consumes),
`docs/tasks/IMPLEMENTATION-ROADMAP.md` ("proactive delivery" = best next brief after Phase 1),
`src/lib/notifications/push.ts`, `src/lib/reminders/emailReminders.ts`, `src/lib/micropulse/elite/index.ts`.
