# Decluttering memo — coach surface (June 2026)

> **Why:** the engine and the explainability-first philosophy are strong, but the
> realized surface is too large for the real staffing reality (one part-time
> analyst who is also an assistant coach). Today's coach surface: **47 pages, 64
> coach components, ~50 sidebar destinations, and 19 cards stacked on the daily
> dashboard** (`dev-coach-dashboard/DevCoachDashboardClient.tsx`). The manifesto
> promises a "5-second read"; 19 cards is not that.
>
> **Goal of this work:** default surface = one triage screen ("who needs me
> today"). Everything else stays in the codebase but moves behind a drill-down or
> a deliberate nav choice. **No data is deleted — depth is hidden until asked
> for**, which is exactly principle "head-coach surface by default, S&C surface on
> drill-down" already in CLAUDE.md.
>
> Conventions still apply: stage specific files only (never `git add -A`); user
> does git/commit/push; run `npx eslint` on every file touched; any DB change also
> saved as a timestamped `.sql` under `supabase/migrations/`.

---

## TIER 1 — Kill now (dead or pure duplicates, low risk)

Verified by import-count (`grep -rln "import ... <Name>"`):

- **`src/components/coach/CoDAsymmetryCard.tsx`** — **0 imports** (dead). It is a
  byte-for-byte-titled duplicate of `CodAsymCard.tsx` (which IS used by
  `decel-intelligence/page.tsx`). Delete `CoDAsymmetryCard.tsx`; keep
  `CodAsymCard.tsx`.
- **`src/components/coach/SessionRpeComplianceCard.tsx`** — **0 imports** (dead).
  The live one is `SessionRpeMonitoringCard.tsx` (mounted on the dashboard).
  Delete the Compliance variant.
- **Sweep for other 0-import coach components** before finishing: run
  `for f in src/components/coach/*.tsx; do n=$(basename $f .tsx); c=$(grep -rl "\\b$n\\b" src --include=*.tsx | grep -v "$f" | wc -l); [ "$c" = 0 ] && echo "DEAD: $n"; done`
  and delete the dead ones (confirm each is not referenced dynamically first).
- Repo hygiene (already in HANDOFF #6): remove `src/app/coach/week-setup/.fuse_hidden*`
  FUSE artifacts and add `.fuse_hidden*` to `.gitignore`.

## TIER 2 — Merge (two surfaces doing one job)

- **Weekly overview: pick ONE.** Both `WeeklyStoryCard` and `WeeklyNarrativeCard`
  are mounted on the same dashboard (positions ~7 and ~11). They both answer
  "what happened over the last 7 days." Keep the stronger one (WeeklyNarrativeCard
  aggregates load + verdict history), fold any unique content from WeeklyStoryCard
  into it, drop the other from the dashboard.
- **Planning surfaces (six → one flow).** `templates`, `starter-templates`,
  `custom-templates`, `plan-builder`, `session-workflow`, `my-exercises` overlap.
  Define ONE planning entry-point (likely `plan-builder` / `week-setup`) and make
  the rest tabs or steps inside it, not separate top-level nav.
- **"Intelligence" load pages.** `decel-intelligence`, `hsr-intelligence`,
  `ima-intelligence`, `load-intelligence`, `indoor-load` are five sibling pages.
  Merge into one **Load Intelligence** page with tabs (Decel / HSR / IMA / Indoor),
  so it's one nav item with internal switching — see Tier 3 for placement.

## TIER 3 — Hide behind a drill-down (keep the depth, lose the daily noise)

The principle: the **default Today screen shows the triage list only**; S&C depth
opens on demand. Concretely:

- **Collapse the 19-card dashboard to ~3 by default.** Keep at the top, always
  visible: (1) `UnfamiliarSpikeBanner` / exception alerts, (2) `DailyBriefingCard`
  as the prioritized "who needs me today" list (1-sentence verdict + the action
  per flagged player), (3) the planned-session / what-to-do-today card. Everything
  else (`WeeklyNarrativeCard`, `DecisionSummaryCard`, `OverrideHistoryCard`,
  `PlayerHistoricalSnapshotCard`, `SessionRpeMonitoringCard`, `DailyInternalLoadCard`,
  `InternalAcwrCard`, `CoachWeeklyLoadCard`, `CoachMdComparisonCard`,
  `TeamIndoorBriefing`, `PlannedSessionLoadCard`) moves under a single **"Show full
  dashboard / S&C detail"** toggle, or onto the relevant Intelligence page.
- **S&C-specialist cards are drill-down by definition** (CLAUDE.md says so):
  Decel Intelligence, Stride Intelligence, Sprint Cadence Bands, LV Profile,
  Mechanical Load Index, CoD asymmetry, position-comparison, player-game-report,
  train-like-you-play. The part-time assistant coach will not open these daily —
  reach them from a player's profile drill-down, not from top-level nav.
- **Move sales/ops out of the coach app entirely.** `leads` (demo/pilot),
  `org-reporting`, `reporting-center`, `automation-center` are not a coach's daily
  workflow. Gate them behind an admin/owner role or a separate `/admin` area so a
  coach never sees them.

## Suggested nav after declutter (head-coach default)

```
TODAY            ← triage list only (default landing)
PLAN             ← one planning flow (week-setup → plan-builder; templates as tabs)
PLAYERS          ← roster; drill-down to a player opens all S&C depth
LOAD INTELLIGENCE← one page, tabs: Decel / HSR / IMA / Indoor
INJURY / RTP     ← injuries + post-match-recovery
MESSAGES
SETTINGS
(admin-only)     ← leads, org-reporting, reporting-center, automation-center
```

## What NOT to touch

The science and engines are not the problem — do not gut the libs
(`movementSignature`, `imaRunningLoad`, decel/McBurnie, post-match recovery,
VALD ingest). This is an **information-architecture** pass: re-parent and hide,
don't delete data or logic. Every metric stays reachable; it just stops competing
for the coach's first five seconds.

## Order of work

1. Tier 1 deletes + dead-component sweep + FUSE cleanup (fast, low risk).
2. Tier 3 dashboard collapse (biggest UX win — do this second).
3. Tier 2 merges (planning flow + intelligence tabs).
4. Move sales/ops behind role gate.
Verify with `npx eslint` per file; the user runs the dev server and git.
