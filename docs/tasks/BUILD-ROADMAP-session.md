# Build roadmap — briefs from this working session (priority + order for Code)

A sequencing plan for the briefs written this session, so Code builds in the right order (dependencies +
value). Everything is descriptive/coach-owned and never touches the readiness colour. Status is best-effort
(some Code may have advanced further).

## Already implemented (Code did these)
- `individualised-speed-zones` (speedZones) — MAS/MSS/ASR thresholds. ✅
- `position-fitness-requirements` (+ addendum + elite-reference-values) — position fit. ✅
- `body-composition` (Jackson-Pollock, JP-3/7/Navy) — on the Force-plate widget. ✅
- Drill-name date-prefix: existing rows cleaned in DB (77). ✅ (recurrence fix pending → see P1)
- Fixes shipped in code: MD-context post-match aware; week-setup reminder; auto-send 06→09.

## P0 — small, high-leverage, low-risk (do first)
1. **`normalize-drill-name-on-write`** — stop date-prefixed drill names recurring (tiny; the DB is already
   cleaned). No dependencies.
2. **`fitness-retest-trend`** — trend over the fitness-test history (data + fetch already exist). Depends on
   the fitness store (done).

## P1 — the strength/conditioning spine (build in this order; each reuses the last)
3. **`nonvbt-strength-logging-e1rm-rpe-autoreg`** — per-set logging + e1RM + RPE autoreg (unlocks real kg for
   non-VBT teams). Reuses `client/oneRepMaxFormulas` + `workingOneRm`.
4. **`mas-interval-session-builder`** — running sessions from `intervalSpeedsFromMas`. Independent.
5. **`season-phase-strength-periodization`** — off/pre/in-season goal + per-player pre-season emphasis +
   microdose/traditional toggle. Depends on body-comp (done) + the deficit ledger. (Research basis:
   `strength-periodization-…-research-synthesis`.)
6. **`off-week-maintenance-program`** — individualised holiday plan (strength+running) → app + PDF, in Week
   setup. Depends on #3 (loads), #4 (run speeds), season logic (#5), deficit/RTP/body-comp.

## P2 — session design (pitch)
7. **`drill-load-profile-mohr`** — four-category (aerobic/anaerobic/speed/muscular) drill load. Independent.
8. **`drill-to-md-day-fit`** — classify drills by load type, fit to the MD day. Reuses loadPlan/plannedSessionLoad.
9. **`owen-multimodal-volume-intensity-microcycle`** — volume×intensity session read + taper shape. Reuses loadTargets.
10. **`style-and-wcs-drill-recommender`** (incl. tactical layer via `peakPeriodContext`) — drills by style +
    worst-case + tactics. Reuses #8 + peak windows + Wyscout/StatsBomb fusion.

## P3 — the coaching library + media
11. **`coaching-library-hub`** — drills (done) + **videos** (Phase 1: `coach_media`, private bucket,
    transcode-on-upload) + **meetings** (Phase 2). PDF/doc compression rule included.
12. **`video-to-drill-auto-read`** — multimodal read of a drill clip → auto drill card + diagram. Depends on
    #11 (video in place) + the drill-diagram skill.

## P4 — the payoff (do after features emit their reads)
13. **`extend-coach-signals-coverage`** — turn each engine (incl. all the above) into an exception-gated
    chip on the Today briefing. Do LAST so every new feature can surface as a silent-until-relevant signal —
    this is what collapses the ~90 pages into one screen.

## P5 — data sources & ingestion (foundational — slot early; Njarðvík W unblocker)
14. **`today-datasource-sync-upload-and-team-profile`** — ONE correct per-team data profile (Catapult
    **Pro/Lite**, Hudl **WIMU/Titan**, STATSports, VALD/WHOOP/…) that Today, data-quality and surface
    gating all read; plus a provider-aware **Sync (API) / Upload (file)** card on Today. **Reuse
    `getCatapultDataTier()` — add NO competing tier source** (the repo already fought four). Do this
    early: it's the foundation other gating should read. 
15. **`titan-indoor-ingestion`** — Titan `_synced_data` (IMU Player Load / Impacts / Jumps / durations) →
    `player_external_load_daily` (source="titan"); GPS null, indoor tier. **Mostly built already**
    (`integrations/titan/*`, upload page + API) — remaining: wire a nav link to `/coach/integrations/titan`
    (it's unlinked), verify against `titan_synced_data_import_template.csv`. Unblocks Njarðvík W once their
    sensors are assigned + a session is synced.

## P6 — session-design + recovery (new; sit near P2/analytics)
16. **`session-builder-md-fit-and-coach-principles`** — session-level warnings when the built session is
    over the day's load band or the wrong load type for the MD day, + the coach's own periodization model
    (default MD-microcycle / **Tactical Periodization** preset / custom). Reuses `drillMdFit`,
    `plannedSessionLoad`, `loadTargets`, `intentToMd`. Advisory; override logged. Builds on P2 #8/#10.
17. **`postmatch-recovery-timeline`** — sex-specific **expected** recovery curve overlaid on the existing
    post-match board (observed vs expected: on-track / behind). Reuses `recovery/processReads` + the board.
    Independent; descriptive (research-based, not AI). Includes the plain-language "how it works" for coaches.

> P4 (`extend-coach-signals-coverage`) should also surface #16/#17 as exception-gated Today chips, and
> #14's freshness as the Today data card.

## Reference docs (not builds)
- `strength-periodization-off-pre-in-season-research-synthesis` — the evidence base for #5/#6.
- `lff-case-report-research-integration-note` — SPSR #318: file as low-confidence, principle-reinforcing.

## Sequencing logic
P0 first (cheap wins). Then the strength spine P1 (#3→#6 build on each other). P2 is independent-ish and
can run in parallel. P3 (library/media) is adjacent to the analytics core. **P4 (coach-signals coverage)
is deliberately last** — it surfaces everything and delivers the "one screen, depth on click" experience
the audit calls for.
