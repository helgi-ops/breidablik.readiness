# Brief — Injury Monitoring section: consolidate to destinations + drill-downs (keep the rehab workflow)

**Goal:** tidy the **Injury Monitoring** sidebar group from **7 top-level entries → ~4 destinations**, with
the rest as drill-downs, and fix one naming collision. Executes the plan already in
`coach-pages-audit-background-vs-destination.md` **for this section**, with one correction: the coach
progresses rehab in **Injuries / RTP**, so that stays a destination. Everything here is descriptive /
workflow — nothing touches the readiness colour. Rules recommend; the coach and clinician decide.

File: `src/app/coach/CoachSidebar.tsx` (the injury nav group ~lines 110–122) + the routes below.

## What each of the 7 does (grounded)

1. **Robustness & Signals** (`/coach/readiness-signals`) — injury **early-warning** per player
   (steady / watch / elevated, cited contributors, counterfactuals) + the Signal-check "why" pack
   (ACWR, monotony, injury-recency, sleep, CMJ). Descriptive, personal-norm, never the colour. *(This is
   the flagship #5, task in progress.)*
2. **Availability Board** (`/coach/availability-board`) — matchday "who can I pick, and in what state?"
   (medical gate + readiness colour + load advisory).
3. **Injury Pattern Analysis** (`/coach/injuries`) — injury **log** + retrospective "predicted X of Y" +
   the **log-new-injury form**.
4. **Injuries / RTP** (`/coach?tab=rtp`) — the **clinical RTP progression workflow**: the coach advances a
   player through **stages 1–5** (statuses `rtp_training`, etc.). This is the **authoritative source** of a
   player's RTP stage.
5. **Return-to-training** (`/coach/return-to-training/[playerId]`) — the **training-load plan** derived from
   the RTP stage. It *reads* the clinical stage from the Injuries/RTP workflow (in-code:
   "Clinical RTP stage from the Injuries/RTP workflow — same source as the RTP page") and builds per-quality
   load recommendations.
6. **Clinical reports** (`/coach/clinical-reports`) — PHI clinical documents (signed URLs, access-gated).
7. **Notifications** (`/coach/notifications`) — the event stream of threshold-crossings (what *changed*).

## The correction vs the audit

The audit demoted `return-to-training` and treated the RTP flow loosely. In practice **Injuries / RTP is
where the coach progresses a player through rehab** — an interactive destination the coach works in daily,
and the single source of the RTP stage that Return-to-training and other surfaces read. So **keep Injuries /
RTP as a destination.** Injuries/RTP and Return-to-training are **not duplicates** — they're two halves of
one flow: RTP = the clinical stage progression (authoritative); RTT = the load plan derived from it.

## Target structure

**Destinations (keep in the Injury Monitoring nav — 4):**

- **Availability Board** — the pick-selection team state. Keep.
- **Injuries** (`/coach/injuries`) — the injury log + log-new form + retrospective validation. Keep (it's
  the injury data-entry home).
- **Injuries / RTP** — the rehab **progression** workflow (advance stages 1–5). **Keep** — the coach's
  hands-on rehab surface and the authoritative RTP stage.
- **Notifications** — the signals inbox (what changed). Keep. *(Note: it's cross-cutting — load/wellness/
  injury, not injury-only. Fine to keep here as a shortcut, but it's really the global signals inbox; if a
  top-level "Notifications/inbox" home emerges, it belongs there.)*

**Drill-downs (reachable, but not their own top-level nav slot):**

- **Return-to-training** (`/[playerId]`) — the derived load plan. Reach it **from Injuries / RTP and the
  player card** (a "Training plan →" link next to the player's RTP stage), not a separate nav entry. The
  workflow is unchanged; only the nav slot goes. Since RTT already reads the RTP stage, this makes the
  RTP → RTT relationship explicit (progress the stage in RTP, open the derived plan from there).
- **Clinical reports** — reach from **Injuries** / the player card (keep PHI access-gating exactly as is).

**Background (a chip + drill-down, not a prime nav slot):**

- **Robustness & Signals** — surface the early-warning as the **chip beside the readiness colour** on the
  Daily Briefing / player card (steady/watch/elevated); the full `/coach/readiness-signals` page stays as
  the drill-down "why". Per the audit's "Background" call. *(Coordinate with the in-progress #5 work — the
  chip is the primary surface, the page is the explainer.)*

## Fix the naming collision (the real confusion)

"RTP" currently means three different things:

- **Injuries / RTP** (`?tab=rtp`) — clinical return-to-**play** progression. ✅ correct meaning.
- **`/coach/rtp`** — this route is actually the **force-plate assessment index** (`ForcePlateAssessmentIndex`),
  *not* return-to-play. **Rename** it (e.g. `/coach/force-plate` or fold under Assessments) so "rtp" stops
  meaning force plates. This mislabel is the actual source of confusion, not the Injuries/RTP tab.
- **Return-to-training** — return-to-**training** (load), distinct from return-to-**play** (clinical). Keep
  the RTT vs RTP distinction but make it legible: RTP = the clinical stage, RTT = the training plan derived
  from it.

## Acceptance

- The Injury Monitoring nav shows **4 destinations** — Availability Board · Injuries · Injuries/RTP ·
  Notifications — with Robustness & Signals as a chip (page = drill-down), and Return-to-training +
  Clinical reports reachable from Injuries/RTP / the player card (not top-level).
- **Injuries / RTP keeps the full stage-progression workflow** (advance 1–5); nothing about progressing a
  player changes. Return-to-training still reads the RTP stage and is one click from it.
- `/coach/rtp` (force-plate assessment) is renamed so "RTP" no longer collides with return-to-play; old
  links redirect.
- No workflow or data lost; PHI access-gating on Clinical reports unchanged. EN/IS. Nothing touches the
  readiness colour. Lint + typecheck clean.

Ref: `src/app/coach/CoachSidebar.tsx` (injury group ~110–122), `src/app/coach/readiness-signals/page.tsx`,
`src/app/coach/availability-board/page.tsx`, `src/app/coach/injuries/page.tsx`, the `?tab=rtp` workflow,
`src/components/coach/ReturnToTrainingPage.tsx` (reads the RTP stage), `src/app/coach/rtp/page.tsx`
(force-plate — rename), `src/app/coach/clinical-reports/page.tsx`,
`docs/tasks/coach-pages-audit-background-vs-destination.md` (the section this executes), and the in-progress
robustness / injury early-warning (#5) work.
