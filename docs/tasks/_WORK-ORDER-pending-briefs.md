# MicroPulse — prioritised work order (pending Code briefs)

*Oct 2026. One ordered queue for Claude Code. Trust/fix-first, then finish the in-flight wearable loop, then
usability, then onboarding. Each row: the brief file, why, dependency, rough size (S/M/L).*

## ✅ Already shipped (no action — for reference)
- **Whoop direct**: v1→v2 endpoints, `offline` scope + token refresh, per-provider connect copy. (live)
- **Control-Chaos Continuum**: return-to-running phase layer on Return-to-Training + the Today phase-gate chip.
  (`control-chaos-continuum-rtp-assessment-and-brief.md` — shipped: `a484bc6`, `91fb69a`)
- **Strength Hub**: split into "Strength Training" (operate) + "Programme Library" (author/store); method
  schemes per MD day; player demo videos + "mark complete". (`strength-hub-...-brief.md` — largely shipped)
- **Admin cross-team gate**: one canonical admin gate (`f7bf17b`) — the foundation the admin drill-upload sits on.
- **Return-to-Training** added to the injury sidebar; **Availability Board** backgrounded; **Squad Intelligence**
  entry added to the sidebar.

## ▶ Pending queue

### P0 — Trust / fix what's broken (do first)
1. **Stage-4 decisions constraint fix + backfill** — `stage4-decisions-stopped-sept14-constraint-fix-brief.md`
   · **Why:** a Sept-14 migration dropped a constraint the decision functions name, so `stage4_decisions`
   stopped writing → coach READY/MODIFIED/RECOVERY tiles read 0 for every team since. **Actively wrong in
   production.** · One-line `ON CONFLICT` fix in two functions + backfill Sept-15→today. · **Dep:** none ·
   **Size:** S. **Build this first.**
2. **Pipeline health-monitor** — `pipeline-health-monitor-brief.md`
   · **Why:** so the class of silent failure above is caught next morning, not after 3.5 weeks. Freshness +
   consistency checks + daily alert + admin health page. Foundation for trusting P4. · **Dep:** none (its
   stage-4 check verifies #1) · **Size:** M.
3. **Player Today — no fabricated session on an unplanned/OFF day** —
   `player-today-unplanned-day-no-fabricated-session-brief.md`
   · **Why:** when no week plan exists the app defaults to MD-3 and invents a strength session instead of
   showing rest. · **Verify first** — the rest-day now shows correctly via a populated week plan; confirm the
   *code* guard is in before closing. · **Dep:** none · **Size:** S.

### P1 — Finish the wearable loop (pilot is riding on it)
4. **Wearable morning-sync cron** — `wearable-morning-sync-cron-claude-code-brief.md`
   · **Why:** so last night's Whoop recovery is in the DB before players check in each morning (auto-fill works
   daily without anyone tapping "Sync now"). Add GET handler + cron entries; the token-refresh it relies on is
   already live. · **Dep:** wearables live (done) · **Size:** S.
5. **National-team / away-camp load upload** — `national-team-camp-load-upload-claude-code-brief.md`
   · **Why:** reusable upload for federation camp CSVs (Hlynur's was hand-ingested once; make it a tool). ·
   **Dep:** none · **Size:** M.

### P2 — Usability / IA consolidation
6. **Library tab on Today + finish Squad Intelligence** — `coach-ia-library-tab-and-squad-intelligence-brief.md`
   · **Why:** whole Coaching Library as a Today tab (shared component, no copy); Squad detail → "Squad
   Intelligence" in the hub, **not GPS-gated**. Squad entry is in the sidebar already — finish the hub tab +
   the Library-on-Today tab. · **Dep:** **#1 (stage-4)** so Squad counts show real numbers · **Size:** M.

### P3 — Onboarding / admin
7. **Admin drill-upload page (for a coach)** — `admin-drill-upload-for-a-coach-brief.md`
   · **Why:** admin seeds a coach's library (video-first), good flow for bulk. The cross-team gate is already
   in (`f7bf17b`); build the page + video upload + "save & add another" on top. First use: Emil Pálsson /
   Breiðablik. · **Dep:** admin gate (done) · **Size:** M.

## Next, no brief yet (from the trust/P4 brainstorm — write when ready)
- **#2.2 Provenance tags on load** — surface measured / estimated / stale on every load number (the
  estimated rows we created for Anton, Hlynur, Höskuldur should read as estimates). Follows the health-monitor.
- **P4 coach-signals coverage audit** — ensure every engine emits an exception-gated, provenance-carrying chip
  to Today ("one screen, depth on click"). The payoff layer; do after the pipelines are trustworthy.

## Suggested order to paste into Code
**1 → 3 → 2 → 4 → 6 → 5 → 7.** (Fix the active bug, confirm no-fabrication, then the monitor so it can't
recur; finish the wearable loop; then IA; then the away-upload and admin tooling.)
