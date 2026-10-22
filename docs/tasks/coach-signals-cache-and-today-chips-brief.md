# `coach_signals` cache + Today background chips — the consolidation linchpin

This is the shared infrastructure that (a) finishes #5 (robustness watch surfaces as a chip) and
(b) unlocks the whole IA consolidation (analytical pages → background signals on Today). Build it
once; every "*Intelligence" / advisory engine plugs into it.

Grounded in the real Today page: `/coach` renders `DevCoachDashboardClient`, which already shows
`TodayCommandCenter`, `DecisionSummaryCard`, and the Daily Briefing attention list
(`buildAttentionList`) with day-over-day delta badges + a `sprint_drop` chip. Background signals
attach **inside these existing surfaces** — no new page.

## Non-negotiable
- **Never touch the readiness colour.** Canonical verdict stays `v_coach_readiness_today_v8.final_color`
  (from `readiness_entries.color`). Signals sit BESIDE it as labelled chips, never tint/replace it
  (manifesto principle #1). Do not write `readiness_entries` / the view.
- **Exception-gated + conservative.** A chip appears only when a signal is genuinely actionable
  (level ≠ steady). This is where over-flagging hurts most — apply the yellow-oversensitivity
  discipline (task #16): tune for specificity, validate flag-rate before enabling squad-wide.
- **Layered read on every chip:** one-line verdict → 2–3 plain "why" → confidence, with the raw
  detail behind the click (the drill-down page). AI-labelled if AI-authored; cite the signals.

## Schema — `coach_signals` (new table + migration)
One row per (player, engine, day). Descriptive cache; safe to rebuild anytime.

```
coach_signals(
  id uuid pk default gen_random_uuid(),
  team_id uuid not null,
  player_id uuid not null,
  engine text not null,            -- 'robustness' | 'form_vs_state' | 'game_plan_fit' | 'post_match_recovery' | …
  as_of date not null,             -- the day this signal describes
  level text not null,             -- 'steady' | 'watch' | 'elevated'  (words, NOT a colour, NOT a decision)
  headline_en text, headline_is text,      -- the one-line verdict
  why jsonb,                       -- [{en,is}] 2–3 plain facts
  counterfactual_en text, counterfactual_is text,
  confidence text,                 -- 'low' | 'medium' | 'high'
  drilldown_href text,             -- where the chip opens (existing page / hub tab)
  provenance jsonb,                -- inputs present, thresholds, as-of, citations
  computed_at timestamptz default now(),
  unique(player_id, engine, as_of)
)
```
Save the `.sql` under `supabase/migrations/` (timestamp prefix) per repo convention. RLS: team-scoped
read for the coach (mirror the existing per-team policies).

## The nightly writer
A scheduled job upserts `coach_signals` for each active player × engine. Reuse the existing daily
job path (the Catapult `daily-sync` runs on a schedule — confirm the scheduler: Vercel cron /
Supabase scheduled function) or add `/api/coach/signals/refresh` called by the same cron. Idempotent
upsert on `(player_id, engine, as_of)`.

Each engine adapter maps its existing output → a `CoachSignal`:
- `robustness` → the #5 `robustnessWatch` (once built); level from its trend-alert.
- `form_vs_state` → `formVsState` engine (already built): "output holds under fatigue?" divergence.
- `game_plan_fit` → `/api/coach/game-plan-fit`: matchday "ready for role vs this opponent".
- `post_match_recovery` → MD+1…MD+N rebound vs expected.
Start with the engines that are ALREADY built + verdict-shaped (form_vs_state, game_plan_fit) so the
pipeline ships before #5's robustnessWatch lands; robustness plugs in as one more adapter.

MVP fallback: if wiring the cron is slow, compute-on-read (aggregate the engines when Today loads)
behind the same `CoachSignal[]` interface — but precompute is the target (cheaper Today load, feeds
Notifications + the morning brief, gives exception history).

## The reader / UI
- A `loadCoachSignals(teamId, date)` reader returns `CoachSignal[]` (filtered to `level ≠ steady`
  for chips; all levels available for the drill-down).
- Render chips **inside existing Today surfaces**, following the existing patterns:
  - Per-player signals → chips in the `buildAttentionList` attention rows (same slot as the delta
    badge / `sprint_drop` chip) and in `DecisionSummaryCard` (it already renders info chips).
  - Team-level signals → a zone in `TodayCommandCenter`.
- Chip click → `drilldown_href` (the existing page, or later a hub tab). The page is the "(2) detail".
- Notifications: point `/coach/notifications` at `coach_signals` too — it's the event/what-changed
  inbox; the same rows feed it.

## First slice (ship this first — proves the whole pattern end-to-end)
1. Migration: `coach_signals` (+ RLS). Save `.sql`.
2. Types + `loadCoachSignals` reader + one adapter — **`form_vs_state`** (already built, verdict-shaped,
   per-player, no new engine needed).
3. Writer for that one engine (cron or MVP compute-on-read).
4. Render its chip in the attention rows on Today (exception-gated), opening `/coach/form-vs-state`.
5. Validate flag-rate on the 23–25 real players (mirror `scripts/validate-role-demand-fit.ts`): if the
   chip fires on >~15–20% of player-days, tighten thresholds before enabling.

Once green, adding `game_plan_fit`, `post_match_recovery`, and (when built) `robustness` is just more
adapters — no new plumbing.

## Guardrails / verification
- Zero writes to `readiness_entries` / `v_coach_readiness_today_v8` (grep the diff to confirm).
- `level` is words, never a colour, never a training decision.
- English default, IS on toggle (`const [lang] = useLang(); const isEN = lang !== "IS";`).
- Confidence always; provenance recorded; descriptive/advisory only.
- `npx eslint` touched files (clean); flag-rate validation gate before squad-wide enable.
- Migration also saved as `.sql` under `supabase/migrations/`.

## Why this first (best for the system)
It's the single dependency under both remaining tracks: #5's `robustnessWatch` becomes "just another
adapter + chip", and every IA consolidation (Load Monitoring, Performance Monitoring, Team Planning's
game-plan-fit/post-training/match-minutes) can finally move its pages to Today chips instead of
lingering as sidebar entries. One build, many unlocks.

Ref: `coach-pages-audit-background-vs-destination.md`, `robustness-injury-early-warning-spec.md`,
`fusion-layer-strategy.md`, `DevCoachDashboardClient` / `DecisionSummaryCard` / `buildAttentionList`
(the Today surfaces), `v_coach_readiness_today_v8` (the colour — do not touch).
