# Brief — the Fusion card: physical peak window × tactical content (make it visible in-app)

**Goal:** turn the now-proven physical×tactical fusion into a live coach surface. The data and engine
already exist; what's missing is (A) wiring the loaded physical peak windows into the UI, and (B) a
tactical-event store + a card that overlays the two on one kickoff clock.

Context proven on real data (see `docs/product/fusion-real-data-proof.md`): for Breiðablik–Fram
(24 Aug 2026), `player_peak_window` holds each player's 1/3/5-min physical peak windows with a
kickoff-aligned clock (`window_start_s_from_ko`), and the Wyscout SportsCode events give the tactical
content. Overlaid, they show e.g. **Óli Valur Ómarsson's hardest single minute was defensive (defending
a corner: interception + clearance) while his hardest 5-min run was his own attack (2 crosses, a
shot)** — two peaks, opposite meaning. That is the read no siloed system gives.

Explainability-first throughout (see `docs/explainability-first.md`): verdict → 2–3 plain facts →
confidence → detail behind "Show details". Descriptive load/tactical context — it must NEVER touch the
readiness colour, the load target, or the daily decision.

---

## Phase A — surface the physical peak windows already loaded (small, do first)
Today `MatchPeakDemandsCard` (`/coach/match-movement`) runs in "Phase 1 proxy" mode (session-summary
proxies, header says so) and the Ju peak-HSR track is hard-gated. But `player_peak_window` now carries
**real** data for the 24 Aug match:
- 72 peak windows (1/3/5-min, Distance + Player Load) each with `window_start`/`window_end` epoch and
  `window_start_s_from_ko`.
- 34 per-period rows (Session / each half) with **real per-period HSR** = `hsr_m` (= Velocity Band 5 +
  Band 6, threshold `hsr_threshold_kmh = 19.8` — the account's Band 5 starts at 5.50 m/s = 19.8 km/h),
  plus `vb5_m`, `vb6_m`.

Do:
1. Extend `/api/coach/player/[id]/peak-demands/route.ts` to also return, when present, the real
   `player_peak_window` rows for the player's most recent match: the peak-window clock positions
   (min:sec from kickoff) and the per-period HSR (session + each half, with the 19.8 threshold label).
2. In `MatchPeakDemandsCard`, add a "Physical peak windows (this match)" section that lists, per window
   (1/3/5-min, Distance and Player Load), **when** it happened (mm:ss from kickoff) and its value — and
   the per-period HSR with its threshold. Keep the existing proxy read as the fallback/empty state.
   Drop the "proxy" caveat for any match where real `player_peak_window` rows exist; keep it otherwise.
3. Honest label: peak-window HSR (the Ju Table-2 peak score) stays gated — the CTR has HSR per period,
   not per peak window. Show per-period HSR as its own row, not as a peak-window HSR.

This alone makes the loaded data visible with no new ingest.

---

## Phase B — the tactical event store + the Fusion overlay (the full picture)
The tactical side (time-stamped events) is **not stored anywhere yet** — the season-aggregate Wyscout
stats in player-stats/match-analysis are different data. The ingester is already written and verified:
`src/lib/micropulse/wyscoutEvents/parseSportscode.ts` (`parseSportscodeXml`, `decodeSportscodeBuffer`,
`busiestWindowFor`, `labelsInWindow`).

1. **New table `match_events`** (migration under `supabase/migrations/`, save the `.sql`):
   `id, team_id, match_date, source ('wyscout_sportscode'), subject_code (player or team string),
   start_s, end_s, labels text[], raw jsonb, created_at`. Index `(team_id, match_date, subject_code)`.
   RLS: read scoped to the owning team (mirror `player_peak_window`'s policy). Descriptive only.
   Store the kickoff origin note: SportsCode times are seconds from first-half kickoff, half-time
   removed (~95-min span) — record it so alignment code knows.
2. **Upload route `/api/coach/load/match-events/upload`** (mirror the peak-window upload): multipart
   { file(s), match_date }, decode with `decodeSportscodeBuffer`, parse with `parseSportscodeXml`,
   map `subject_code` player names to `player_id` via `catapult_athlete_map` / roster where possible
   (team events stay team-level), upsert into `match_events`. Preview → commit like the CTR upload.
   Accept both the player-events and team-events XML files.
3. **Fusion card** on `/coach/match-movement` (new `FusionPeakCard`, or extend `MatchPeakDemandsCard`):
   for the selected player + match, take his physical peak window from `player_peak_window`
   (default the peak 1-min Player-Load window — his hardest minute — with a toggle for 3/5-min and
   Distance), read the tactical labels in that same window from `match_events` (his own on-ball labels
   + the team-phase labels overlapping it), and render the overlay.
   - **Clock alignment (important):** both clocks share the first-half kickoff origin. `player_peak_window`
     stores `window_start_s_from_ko` (Catapult session elapsed − kickoff offset, which INCLUDES
     half-time). Wyscout play-time removes half-time. So align **directly in the first half**; for a
     second-half window, subtract the half-time gap (activity 2nd-half start − 1st-half end, from the
     CTR/Editor) before matching to Wyscout time. If the offset is unknown, show the window + its own
     physical numbers and mark the tactical overlay "first-half only" rather than mis-aligning.
   - **Layered read (explainability-first):**
     - Verdict (bold, ~5s): e.g. *"His hardest minute (8:17) was defensive — defending a corner."*
     - 2–3 facts (~15s): his on-ball actions in the window (interception, clearance); the team phase
       (crosses conceded ×2, corner conceded); contrast with his hardest-running window if different.
     - Confidence: from event coverage + whether the window is first-half (clean align) or second-half
       (gap-corrected). Label the tactical layer as **derived from event data** (on-ball actions;
       off-ball/relational patterns are not in the feed).
     - Show details: the raw window (mm:ss), the full label counts, the epoch clock.
   - Keep the existing IMA `MovementSignatureCard` as the Catapult-only movement read; the Fusion card
     is the event-overlay read. Both can coexist; label which feed each uses.

## Acceptance
- Phase A: on `/coach/match-movement` for a Breiðablik player with the 24 Aug data, the physical peak
  windows (mm:ss from kickoff) and per-period HSR (19.8 threshold) render, no "proxy" caveat.
- Phase B: uploading the two Wyscout XML files populates `match_events`; the Fusion card shows Óli
  Valur's hardest-minute defensive verdict + his hardest-5-min attacking contrast, first-half aligned,
  with confidence + "derived from event data" labelling. Lint clean; unit tests for the align math
  (first-half exact; second-half gap-corrected) and the overlay composition.

Ref: `player_peak_window` (loaded), `parseSportscode.ts` (built+verified), `peakPeriodContext/index.ts`
(the feed-agnostic alignment engine — reuse it), `MatchPeakDemandsCard.tsx`, `peak-demands/route.ts`,
`ctr-activity-report-parser-robustness-brief.md` (the CTR-side fix), `fusion-real-data-proof.md`
(the worked Óli example + honest limits).
