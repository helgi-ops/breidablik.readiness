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

- **Position comparison + playing style** — `/coach/position-comparison` +
  `/api/coach/position-comparison` (+ `…/narrative`). Compares per-90 GPS+IMA
  across position GROUPS (CB/FB/CM/AM/CF; GK has no GPS), each tagged with a
  rule-based archetype from `src/lib/micropulse/positionStyle.ts`
  (`classifyStyle` — z-scores per-90 metrics vs the population → axes
  speed/agility/volume/aerial → archetype + driver metrics). Per-player
  drill-down (own archetype, ★ standouts) classified vs the squad. Reuses the
  radar + trend-bar SVGs; optional AI overview ("rules decide, AI explains").
  Validated on real data: CB→aerial, CM→agility/CoD, FB→engine+speed,
  AM→speed, CF→engine+aerial — football-sensible and data-driven.
  Follow-ups: refine the single-metric "volume" axis (CF reads as engine);
  league/position external norms; AI needs `ANTHROPIC_API_KEY`.
- **Player game report** (agent-facing) — `/coach/player-game-report` +
  `/api/coach/player-game-report` (data) + `…/narrative` (AI text). Per-match
  GPS + IMA for one player, minutes-normalised to **per-90**, with squad
  benchmarks (team avg + percentile/rank) and an optional AI-written physical
  profile (Claude, labelled "AI", rephrases only the supplied numbers).
  Data join: `match_schedule` (opponent/comp/home) × `match_player_minutes`
  (minutes) × `player_external_load_daily` (catapult) on (player_id, date).
  Print-to-PDF via `window.print()` (same pattern as KSÍ). Nav under Admin.
  - **Units fix**: `max_velocity` in `player_external_load_daily` is ALREADY
    km/h — do NOT ×3.6. The KSÍ report (`api/coach/ksi-report/route.ts:117`)
    still has the ×3.6 bug (shows ~114 km/h); flagged as a separate task.
  - Follow-ups: position-based benchmarks (only team-wide now); competition
    filter (a "TEST" friendly currently shows); AI narrative needs
    `ANTHROPIC_API_KEY` set (untested live, same gate as VALD extraction).
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

## 7. Post-match recovery — citation provenance (IN PROGRESS 2026-06-20)

Goal: every signal carries a paper citation (manifesto principle #1). The
post-match recovery logic was implemented but did NOT carry an inline citation
the way the movement-signature / decel modules do. Closing that gap.

Done (eslint clean, comments-only — no behaviour change, not yet committed):
- `src/lib/fatigue/classify.ts` — JSDoc above the "Match-minutes scoring
  (MD+1/MD+2 aware)" block (~line 247) now explains the recovery time-course and
  cites Nédélec.
- `src/lib/exercise-recommendations/recommend.ts` — comment at the
  `postMatchResidualFlag` branch (~line 135) explains why CNS load is
  down-regulated even on a GREEN day, with the same citation.
- Citation: Nédélec M et al. "Recovery in Soccer" Part I & II, Sports Med
  2012;42(12):997 / 2013;43(1):9; Silva JR et al. Sports Med 2018.

Open — close the loop:
- Add the SAME citation to `src/lib/coach-qa/questions.ts` where the reasoning
  already says "It's MD+1 so a post-match echo is expected — readings should
  rebound by MD+2" (~line 153). Use a short inline ref so the generated coach
  answer can cite it, matching the existing `(Gabbett 2017)` / `(McBurnie 2022)`
  inline-tag convention.
- Then grep for other post-match / MD+1 / MD+2 / `gameTaper` recovery surfaces
  that present the signal to a coach/athlete WITHOUT a citation; list them
  before editing so the scope is a deliberate choice, not a sweep.
- Note: `gameTaper.ts` is the PRE-match taper (load down D-2/D-1/D-0); the 60-min
  match-recovery rule in `sprintExposure/loader.ts` already cites
  "Carling 2018 / Nédélec 2012" — reuse that style.

## 8. Coach surface declutter (NEXT — see decluttering-memo.md)

The coach surface has grown to **47 pages, 64 components, ~50 nav destinations,
19 cards on the daily dashboard** — too much for the real staffing (one part-time
analyst who is also an assistant coach). Full prioritized plan in
**`docs/decluttering-memo.md`**. Summary of order:

1. **Tier 1 — kill now (low risk): ✅ DONE 2026-06-20.** Deleted 4 verified-dead
   coach components (0 imports by path, no dynamic/lazy refs, no barrel
   re-export): the 2 memo-named `CoDAsymmetryCard.tsx` (dup of kept `CodAsymCard`)
   + `SessionRpeComplianceCard.tsx` (kept `SessionRpeMonitoringCard`), **plus 2
   the sweep found**: `CheckinReminderStatusCard.tsx` and the 907-line
   `ReadinessLoadQuadrant.tsx`. 64→60 coach components, ~1,540 lines removed.
   `tsc` clean (no dangling imports). Removed the 3 `.fuse_hidden*` artifacts and
   added `.fuse_hidden*` to `.gitignore`. (Note: the sweep first MISSED
   `CoDAsymmetryCard` because kept `CodAsymCard.tsx` exports a function literally
   named `CoDAsymmetryCard` — verify by import-path, not by name.)
   **Extended app-wide 2026-06-20:** swept ALL `src/components` (234 files) →
   deleted 13 more verified-dead, all last-touched 2026-04-06/07 (abandoned April
   scaffold, not WIP): `ClientHome`, `MicrodoseTemplateCard`,
   `player/{IndividualTrainingView(539L), MuscleGroupSelector(549L), PlansPanel}`,
   `micropulse/MetabolicLoadCard`, `micropulse/coach/CoachCommandCenter`, and the
   6 orphaned `reporting/*` sub-components (the live one is
   `reporting/ReportingCenterPage`, which doesn't use them). ~2,135 lines. `tsc`
   clean. Kept (false positives from path-test, imported with `.tsx` ext):
   `sessionDelivery/PlayerSessionStatusCard`, `player/PlayerWhyFlaggedCard`.
   Total Tier 1: **17 components / ~3,675 lines removed**, components 234→221.
2. **Tier 3 — dashboard collapse (biggest UX win):** Today shows ~3 cards by
   default (spike/exception alert + `DailyBriefingCard` triage list + today's
   planned session); everything else moves behind a "Show S&C detail" toggle or
   onto the relevant Intelligence page.
3. **Tier 2 — merges:** one weekly card (WeeklyStory vs WeeklyNarrative — both
   currently mounted), one planning flow (templates/starter/custom/plan-builder/
   session-workflow/my-exercises → tabs), five Intelligence pages → one tabbed page.
4. **Role-gate sales/ops** (`leads`, `org-reporting`, `reporting-center`,
   `automation-center`) out of the coach app.

Principle: **re-parent and hide, never delete data or engine logic** — this is an
information-architecture pass, consistent with CLAUDE.md's "head-coach surface by
default, S&C surface on drill-down."

## 9. Load Intelligence — explainability layer (✅ DONE + sweep, June 2026)

**Status: shipped, plus extended into a full sweep across all coach analysis
surfaces. Not yet git-committed (user does commits).** See the "Sweep across the
analysis surfaces (June 2026)" section in `docs/explainability-first.md` for the
canonical record. In short:
- `loadVerdict` lib + `/api/coach/load-verdict` + `LoadVerdictCard` shipped on
  `/coach/load-intelligence` (5 S&C cards collapsed behind "Show S&C details");
  compact strip added to the daily dashboard under the readiness briefing.
- A June audit scored all 12 analysis pages; the laggards (Decel/IMA/HSR
  Intelligence, Quadrant, Position Comparison, Train like you Play, Progressive
  Overload, Assessment Profile, pre/post-session reports, post-match recovery) were
  brought to verdict-on-top compliance via the shared **`VerdictBanner`**
  (`src/components/coach/VerdictBanner.tsx`) — deterministic per-page synthesis,
  confidence chip, cited driver tooltips, dense content preserved below.
- **`trainingPrescriptions`** + **`TlypTrainingFocus`** added the "how to train
  them" actionable layer to Train like you Play (position focus + per-player
  exceptions, each a paper-cited fixed lookup — rules, not AI).
- Dashboard Tier 2 merge: the two weekly cards (`WeeklyNarrativeCard` rules +
  `WeeklyStoryCard` AI) co-located into one weekly surface.

Original spec follows (kept for reference):

Apply explainability-first to `/coach/load-intelligence`: replace the five-card
S&C data wall with one plain-language **load verdict** on top + the existing cards
as drill-down. Full spec in **`docs/load-intelligence-explainability.md`**. Core:
a deterministic `loadVerdict` lib that SYNTHESIZES existing signals
(`playerLoadAcwr`, `externalLoad`/`compositeLoad`, `mechanicalLoad`, `foster`,
`metabolicLoad`, `movementSignature` spike) into band + drivers + confidence —
does NOT recompute load. Integrity guardrail: weight contested metrics (di Prampero
metabolic power) LOW; never launder a weak signal into a clean verdict; degrade
confidence on low Catapult-tier coverage. Re-parent and synthesize, never delete.

## 6. Known repo hygiene

- `src/app/coach/week-setup/.fuse_hidden*` are FUSE artifacts — do NOT commit
  (`rm -f` them; consider adding `.fuse_hidden*` to `.gitignore`).
- Pre-existing lint debt (not from recent work): `any` casts in
  `TrainerDashboard.tsx` (~line 329) and a `set-state-in-effect` warning in
  `src/app/client/page.tsx` (the page's own load effect). New code is clean.
