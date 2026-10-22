# Claude Code task — Player Return-to-Training page (history + progression plan)

Paste to Claude Code (or `@docs/tasks/return-to-training-plan-claude-code-brief.md`).

## Goal
A coach/physio surface for one player that (1) shows their **load history** as a timeline and
(2) generates a **return-to-training progression plan** that ramps the player back from where they
are now up to their **own healthy baseline**, quality-by-quality, under an ACWR guardrail. Built
for a real case: Höskuldur Gunnlaugsson (Breiðablik) re-injured after returning too fast to
sprints/matches — the plan must make that ordering explicit.

## Why "his own data" is the benchmark (design decision — keep it)
Return-to-training targets are **individualised**: the reference is the player's own healthy
training, never a squad average or a generic protocol. Anchor on TWO points:
- **Floor (start)** = what he tolerates *now* — his most recent sessions' load/distance.
- **Ceiling (target)** = his **healthy baseline** — his robust sessions **from healthy windows
  only** (see next section). Prefer his demanding/full sessions as the ceiling, not his easy days.
The plan bridges floor → ceiling over N weeks.

## Injury-window awareness (HARD REQUIREMENT — the ceiling must not be polluted by injured time)
**Do NOT compute the baseline as a raw "last 28 days" lookback.** For an injured player the last
28 days ARE the injury/rehab block, so a naïve lookback understates his true capacity badly.
Proven on the real case (Höskuldur, sessions since 1 Mar, matches excluded):
- **Healthy window** — avg load 484, avg distance 4,368 m (peak 11,222 m), avg top speed 25.1 km/h.
- **Injured window** — avg load 379, avg distance 3,566 m (peak 4,994 m), avg top speed 20.1 km/h.
A 28-day lookback would set his ceiling at ~380 load / 20 km/h instead of ~484 load / 25+ km/h.

The system MUST read his injury history and build the ceiling from **healthy windows only**:
- Injury windows come from `injury_events` (`injury_date` → `coalesce(return_date, current_date)`,
  `is_active`) and/or `player_injuries` (`injury_date` → `coalesce(actual_return_date,
  estimated_return_date)`, `status`, `rtp_stage`). **Both tables exist and can disagree** (e.g. for
  Höskuldur one says concussion, the other sprain) — treat them as a union of windows (a date is
  "injured" if it falls in ANY window from EITHER table) and surface the mismatch to the coach
  rather than silently picking one. Confirm the canonical source with the owner; default to the
  union for safety.
- **Healthy window = the complement** of the union of injury windows.
- Ceiling = his robust load from healthy-window sessions only (real, non-estimated `catapult`
  rows; matches excluded from the training baseline but usable as a separate match-demand target).
  Compute it as a high-but-not-freak reference — e.g. the ~75th–90th percentile (or rolling
  28-day chronic **restricted to healthy sessions**), NOT the single max (11,222 m is one outlier
  session, not a weekly norm).
- Höskuldur's healthy baseline is therefore built from **before 29 May** (his last healthy block
  was ~9–29 May), never from the June rehab weeks. Note: his 29 May–25 Jun and 25 Jun→open injury
  windows mean the "June aerobic rebuild" seen in the raw GPS was *injured* time; the "return" on
  25 Jun coincided with the re-injury (he is currently flagged injured, `return_date` null).

**Currently-injured guard:** if there is an OPEN injury (no return date / `is_active`), the player
is not yet in a graded return — the page shows "currently injured, no graded return started" and
does not invent daily targets until the coach sets a return/RTT start date. The plan is a tool the
coach starts, not something that auto-runs on an injured athlete.

**Head-injury note:** for concussion/head injuries (Höskuldur's `injury_type`), graded return is
**symptom-limited (HIA/GRTP protocol)**, not load-driven — the load plan is a supporting guardrail
that must never advance a stage on its own. Make load a *ceiling*, not a *trigger*, for head
injuries, and label it as such.

## Progression model (the important part)
Ramp is **quality-by-quality in a fixed clinical order**, each quality "unlocked" only after the
previous is tolerated:
1. Volume & player load
2. Running distance
3. High-speed running (HSR)
4. Sprinting (max velocity, sprint distance)
5. Change-of-direction / multi-directional load (IMA COD, accel/decel) — **LAST**
Direction changes come last because that is the most re-injury-prone quality (mirrors the July
re-injury: he had already returned to sprints + matches). Locked qualities show "hold / unlocks
week N"; the coach can override the unlock.

**Guardrail — ACWR.** Week-over-week increase of the *unlocked* metrics must keep the
acute:chronic workload ratio in the sweet spot (≈0.8–1.3, hard-avoid >1.5). Reuse the existing
ACWR logic in `src/lib/micropulse/imaRunningLoad.ts` (tasks #68–70) and/or the load-quadrant
endpoint (`/api/.../load-plan`, task #103–104 `load-plan engine`). The engine picks each week's
target as `min(ceiling, last_tolerated * ramp)` where `ramp` is capped by the ACWR ceiling.

## Explainability (repo manifesto — mandatory)
Every recommended target renders its "why" without a click: e.g. *"4,300 m = 67% of your healthy
baseline (6,400 m); last tolerated 3,780 m; +14% keeps ACWR at 1.10."* Layered read: (0) verdict
= "week 1 of 5 · rebuild volume"; (1) the per-quality targets + why lines + ACWR badge; (2) raw
history table + jargon (ACWR, HMLD, IMA) behind Show details / tooltips. **Rules decide, AI (if
used for the narrative) only explains and cites the signals.** Every target is coach-editable and
overrides are logged with a reason (audit trail). Confidence shown = baseline maturity (how many
healthy sessions the ceiling is built from) + signal coverage.

## Page structure
`src/app/coach/return-to-training/[playerId]/page.tsx` (or a tab on the existing player profile):
- **Header**: player, team, status pill ("Return-to-training"), EN/IS toggle (English default per
  repo; IS is the toggle — both jargon-free).
- **Load history**: timeline chart of distance (bars), high-speed (line), top speed (line, right
  axis) over the selected window; matches excluded by default with a toggle to overlay them.
  Data = `player_external_load_daily` (source='catapult'), matches identified via `match_schedule`
  ∪ `match_player_minutes` (same join used by Match Movement / Player Game Report). This mirrors
  the ad-hoc export already produced (`Hoskuldur-Aefingaalag-…xlsx`) — make it live.
- **This week's plan**: per-quality target cards (load, distance, HSR, sprint, IMA COD) with
  now→target, % of healthy, week-on-week %, locked/unlocked state, ACWR badge, why line, and
  Edit / "How is this calculated" actions.
- **Progression ladder**: the 5 qualities with unlock status and target week.

## API
- `GET /api/coach/return-to-training/[playerId]?window=…` → `{ history[], injuryWindows[{start,
  end, type, source, isActive}], baseline{per-quality ceiling, builtFromHealthySessions:N},
  floor{per-quality current}, plan[{week, quality, target, pctOfHealthy, wow, acwr, why, locked}],
  currentlyInjured:bool }`. `history[]` should tag each session `injured|healthy` so the timeline
  can shade injury windows. Team-scoped (coach may only view their own team's players — reuse
  `coaches_team()` / the coach-team auth helper used by other `/api/coach/*` routes).
- `PUT` to save coach edits/overrides to the plan (log reason). Consider a `rtt_plans` table
  (player_id, team_id, injury_date, weeks jsonb, created_by, updated_at) + migration under
  `supabase/migrations/` (timestamped, also applied via `apply_migration`).

## Suggested files
- `src/lib/micropulse/returnToTraining.ts` — pure engine: given history + injury_date → baseline
  (ceiling), floor, and the week-by-week quality-gated plan under the ACWR cap. Unit-test:
  known history → volume unlocks first, IMA COD last, no week exceeds ACWR 1.3.
- `src/app/api/coach/return-to-training/[playerId]/route.ts` — GET/PUT, auth, queries.
- `src/app/coach/return-to-training/[playerId]/page.tsx` + a `ReturnToTrainingPage` component
  (chart via the existing chart lib used elsewhere in the app; do not introduce a new one).
- Reuse `imaRunningLoad.ts` / load-plan engine for ACWR; do not reimplement ACWR.

## Edge cases
- **Thin healthy history** (few sessions in healthy windows): lower the confidence badge and fall
  back to his best available *healthy* sessions; never fall back to squad average or to injured-
  window sessions for the ceiling — but you MAY show a squad-typical band as context only, labelled.
- **No injury record at all**: let the coach pick the date the drop began; default-suggest it from
  the first sustained fall in top speed / high-speed. Offer to write it to `injury_events` so the
  baseline logic is correct next time.
- **Injury records disagree** (`injury_events` vs `player_injuries`): union the windows, flag the
  discrepancy to the coach, don't silently pick one.
- Estimated rows (`raw_payload_json.estimated=true`) and injured-window rows excluded from the
  ceiling; the floor uses recent real sessions (which may be injured/rehab — that's fine, the floor
  is "where he is now").

## Acceptance criteria
- **Baseline is injury-aware**: for Höskuldur the ceiling is built from healthy-window sessions
  (before 29 May) and lands near his healthy norm (~480 load, ~25 km/h), NOT the injured-window
  ~380 load / 20 km/h. Prove it: the endpoint reports `builtFromHealthySessions` > 0 and excludes
  every session inside an injury window.
- The timeline shades the two injury windows (29 May–25 Jun, 25 Jun→open) and the page shows
  "currently injured" (no auto-generated daily targets while the open injury has no return date).
- Once a return/RTT start date is set, the plan's week 1 rebuilds volume with HSR/sprint/IMA held,
  IMA COD unlocking last; no week's ACWR exceeds ~1.3.
- Every target shows its "why" and % of his healthy baseline without a click; jargon behind
  tooltips; targets are coach-editable with logged overrides.
- Team-scoped (a coach can only open their own team's players).
- `npx tsc --noEmit` + `npx eslint` clean on touched files; migration saved under
  `supabase/migrations/`; stage specific files (no `git add -A`).
