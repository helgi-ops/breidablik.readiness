# Handoff note — open threads (June 2026)

> **Start here:** Read this file and `CLAUDE.md`, then continue the open threads
> below. Begin with the Impacts thread (#1) and the VALD Phase 2 work (#2).
> Verify with `tsc` + `eslint` after edits; the user runs the dev server, git
> commits, and pushes.


Context for whoever picks this up next (e.g. Claude Code in the VS Code terminal).
Repo conventions live in `CLAUDE.md` (read it first): canonical verdict =
`v_coach_readiness_today_v8.final_color`; every `apply_migration` must also be
saved as a timestamped `.sql` under `supabase/migrations/`; never `git add -A`
(stage specific files); never hard-delete players (deactivate with
`is_active=false`); branch checkpoints + git push are done by the user.

Supabase project: `ameccgiqgokibirwfyfa`. Breiðablik team_id:
`94b52a06-0b83-48da-8664-639ec3486a0c`.

---

## 1. Catapult IMA — Impacts NOT available on this tier (PARKED 2026-06-18)

- Jumps: **working** — parser reads `ima_band{1-8}_jump_count` (sums bands, NOT
  `total_jumps`, to avoid double counting). Stored in
  `player_external_load_daily.jumps`. Verified across 41 days.
- Impacts: parser is **correct** (`/^imaimpactsband[1-8]count$/` on canonical
  keys, excludes averages + goalkeeper dive-load). `impacts` is **NULL on all
  rows** (2,761 rows through 2026-06-17).
- **Root cause (verified in OpenField account 2026-06-18, NOT a code bug and
  NOT just a disabled parameter):** the Breiðablik OpenField account does not
  offer the plain per-band `IMA Impacts Band {1-8} Count` parameters at all.
  Searching "impact" in Settings → Parameters → Reporting_Parameters shows only
  `IMA Impacts Band 1 Average Count` (+ `(Session)`) and goalkeeper
  `Average/Total Impact Dive Load …`. The parser deliberately excludes both
  (averages aren't event counts; dive-load is GK-specific). So the signal the
  system is designed around simply isn't produced on this tier.
- **Decision: parked.** The only available variant (band-1 average) is the
  wrong shape for a load-count signal and may be empty anyway. The system
  already degrades gracefully — `mechanicalLoad.ts` reweights the 0.25 impacts
  weight to 0 when null; `PlayerHistoricalSnapshotCard` renders null as "—".
  Revisit only if the club upgrades the Catapult tier so per-band impact counts
  appear in the available-parameter list.
- Debug route (still valid for live field inspection):
  `/api/integrations/catapult/debug-fields?date=YYYY-MM-DD&secret=…`
  (the `secret` is a private value — do not commit/log it).

## 2. VALD report upload — Phase 2 (deeper integration)

Done (Phase 1 + extraction):
- Private bucket `pt-reports` + table `pt_client_reports`.
- `/api/pt/reports` (GET/POST/DELETE) — both client (self) and coach (per
  client) can upload; signed URLs.
- `/api/pt/reports/[id]/extract` — POST sends the PDF straight to Claude
  (`claude-haiku-4-5`, document block) → structured candidate stored as
  `extracted_status='pending'`; PUT saves coach-confirmed (`'confirmed'`).
  Coach reviews/confirms in `PtReportsCard`.

Done (Phase 2 — canonical write, 2026-06-18):
- On coach confirm (`PUT /api/pt/reports/[id]/extract`), the confirmed numbers
  are now fed into the canonical VALD tables via
  `src/lib/integrations/vald/ingestReport.ts` (`ingestConfirmedReportToVald`):
  one SYNTHETIC `vald_raw_tests` row per test (`source='pdf_report'`, stable
  `ingestion_key = pdf_report:<reportId>:<i>`), then a result row in
  `vald_forcedecks_results` / `_nordbord_` / `_forceframe_`
  (`microplayer_id = report.player_id`, `is_valid=true`, `trial_number=1`).
- Non-collision: the real uniques are `vald_raw_tests (team_id, ingestion_key)`
  and `*_results (raw_test_id, trial_number)` (the handoff's "UNIQUE on
  raw_test_id" was imprecise). API/CSV sync uses source `api`/`csv` and its own
  raw rows, so the two paths can't overwrite each other. Re-confirm = idempotent
  upsert.
- After write, today's `vald_daily_player_snapshot` is rebuilt
  (`buildValdDailySnapshot(..., sb)` — now takes an optional service client) so
  `ValdStatusCard` reflects it immediately. The snapshot reads results by
  `(team_id, microplayer_id, is_valid)` only (not source), so PDF rows surface
  automatically. Verified with a rolled-back dry-run insert against real
  constraints (all 3 product tables accept the shape; 0 rows persisted).
- `PtReportsCard` shows "N tests added to the player's VALD profile" on confirm.
- No schema change → no migration file.

Open:
- **LLM extraction is untested live** — needs `ANTHROPIC_API_KEY` set and the
  model's PDF support in the runtime. Try "Read numbers (AI)" on a real report
  and confirm the JSON parses. This is the remaining gate before the canonical
  write can be exercised on real data.
- A single PDF CMJ won't create a baseline (needs `baselineMinTests=3`), so it
  shows as latest value + freshness but no drop-flag until ≥3 tests exist —
  expected, not a bug.

## 3. PT session move (reschedule) — possible quick add

- Done: `pt_session_reschedules` table; client `/api/client/session-reschedule`
  + trainer `/api/trainer/client/[id]/session-reschedule` (GET/POST/DELETE);
  `/api/client/today` resolver honours moves (moved-in shows that session;
  moved-away → rest day). UI: `ClientMoveSessionButton` (client) +
  `MoveClientSessionControl` (trainer).
- Open (optional): a one-tap **"Move to tomorrow"** shortcut next to the date
  picker (currently the client must pick the date).
- Note: reschedule logic only covers `individual_training_plans` (what PT
  clients use). The explosive/starter path isn't wired for moves.

## 4. Other this-session features (shipped, possible follow-ups)

- **Bodyweight (BW) sets** in the PT strength log (`PtSessionLogForm`): per-set
  "BW" toggle for exercises done without external load. Stored as
  `pt_exercise_set_logs.is_bodyweight` (migration
  `20260618120000_pt_exercise_set_is_bodyweight.sql`); `weight_kg` is null for
  these. Tonnage/ACWR substitute the athlete's logged body weight, carried
  forward from `client_body_weight_logs` via the shared
  `buildBodyweightResolver` (in `volumeLoad.ts`) — used by both `computeVolumeLoad`
  and the trainer session view (`/api/trainer/client/[id]/sessions`); the
  trainer card shows "BW". If the athlete has never logged a body weight, BW
  sets still contribute 0 to tonnage (can't fabricate) — a follow-up could
  prompt for a body weight. No added-load ("BW +kg") field yet — deferred.
- **Unfamiliar-load spikes**: `movementSignature` now returns `spike` / `peakZ`
  (sharp ≥ **2.0 SD** drift, mature baseline only — threshold tunable in
  `src/lib/micropulse/movementSignature/index.ts`). Emphasised in
  `UnfamiliarLoadCard` + a slim `UnfamiliarSpikeBanner` atop the Daily Briefing.
- **Player IMA movement card** (`/player` dashboard): jumps / high-intensity /
  cuts / high-speed-run vs the player's own norm — motivating, no risk framing.
- **Robustness drills** (`lib/micropulse/robustness/*`) + **individualised
  football drills** (`lib/micropulse/footballDrills/recommend.ts`, uses
  drill_library `*_avg`→ fell back to totals÷players) — both in the Movement
  profile modal; `player_robustness_assignments` table for coach→player assigns.
  Follow-up: track whether assigned drills move the needle (asymmetry over time).
- **Client programme overview** (`/api/client/programme` + `ClientProgrammeOverview`)
  gated by `pt_plan_visibility` (coach toggle, default hidden). Shows upcoming
  plans (no start_date filter).
- **Remove client**: `/api/trainer/client/[id]/remove` deactivates (reversible).
  Open: no "show inactive / reactivate" UI (endpoint supports `{active:true}`).
- Jumps added to the KSÍ report; goals card hidden-by-default; exercise-name
  typeahead on the client strength log; trainer can view a client's logged
  sessions (`ClientSessionLogCard`).

## 5. Pre / post-training load reports

Referenced in coach comms ("pre-training report = intended load; post-training =
actual load"). **Confirm current status in code** before announcing widely —
verify the surfaces exist and read from the canonical sources.

## 6. Known repo hygiene

- `src/app/coach/week-setup/.fuse_hidden*` are FUSE artifacts — do NOT commit
  (`rm -f` them; consider adding `.fuse_hidden*` to `.gitignore`).
- Pre-existing lint debt (not from recent work): `any` casts in
  `TrainerDashboard.tsx` (~line 329) and a `set-state-in-effect` warning in
  `src/app/client/page.tsx` (the page's own load effect). New code is clean.
