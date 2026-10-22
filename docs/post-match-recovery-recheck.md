# Spec — Post-match recovery re-check (day-aware, schedule-agnostic)

> **Idea (Helgi, June 2026):** today the post-match logic applies fixed MD+1/MD+2
> fatigue weights. Make it a **recovery loop instead of a calendar rule**: measure
> recovery on whatever day a check-in actually lands, interpret the reading against
> the expected recovery for that MD-day, and **chase the players who haven't
> recovered into the next check-in day** (MD+2 or MD+3) until they're back to their
> own baseline.
>
> Builds on `fatigue/classify.ts` (already MD+1/MD+2 aware), `readiness_entries`
> (the check-in / recovery signal), `match_player_minutes` (who played), and the
> `/coach/post-match-recovery` surface.

## The reality this must handle

- **MD+2 is often a day off**, so the first post-match check-in usually lands on
  **MD+1** — but this varies by club and week. Do NOT hardcode "measure at MD+2".
- A low reading on **MD+1 is expected** (post-match echo, Nédélec time-course) —
  it is not, by itself, a concern.
- So: measure whenever there's a check-in; **interpret by MD-day**; re-check on the
  next available check-in day.

## Signal: readiness check-in vs the player's own baseline

The recovery signal is the **subjective readiness check-in** (sleep / fatigue /
soreness / RPE) compared to the player's own rolling baseline (z-score), NOT HR —
HR is 0% everywhere (no belts; revisit if belts arrive, HRV would be a stronger
signal). Reuse `flagAgainstBaseline()`; require a mature baseline.

## Day-aware recovery expectation (the core rule)

For each player who **played meaningful minutes** in the last match
(`match_player_minutes` ≥ threshold), on each check-in day compute readiness z vs
own baseline, and compare to the **expected** recovery for that MD-day:

| MD-day | Expectation | Flag when |
|--------|-------------|-----------|
| **MD+1** | Depressed is EXPECTED (echo). | Only if **far below even the normal MD+1 dip** (worse than his/the squad's typical MD+1) → "monitor", schedule re-check next check-in day. |
| **MD+2** | Should be returning toward baseline. | If still clearly below baseline → "incomplete recovery", re-check next day. |
| **MD+3** | Should be back at baseline. | If still below → **escalate** (modify training / refer to physio). |

So "far from baseline" is judged **against the expectation for that day**, not a
flat threshold. Thresholds tunable (start ~ z ≤ −1 at MD+2/+3; a steeper bar at
MD+1). The expected MD+1 dip can be the player's own historical MD+1 average, or
the squad's, whichever has data.

## The loop (re-check, not a fixed day)

1. After a match, for each player who played, open a **recovery watch**.
2. On the next check-in day (whatever MD-day it is), evaluate vs the day-aware
   expectation. If recovered → close the watch. If below expectation → keep open
   and **prompt a re-check on the next check-in day**.
3. Repeat until recovered or MD+3+ reached → at MD+3+ still-below escalates.
4. This naturally handles "MD+2 off": MD+1 reading (lenient) → re-check lands on
   MD+2 or MD+3 whenever the next check-in exists. No hard MD+2/MD+3 dependency.

## Surface (coach-facing, explainable)

A row/banner on `/coach/post-match-recovery` (and a line in the Daily Briefing):
"Recovery watch — 2 players still below baseline 2 days after the match: Anton
(soreness ↓, z −1.4), X (fatigue ↓). Re-check today." Name the player, the signal,
the deviation, and the action. Confidence chip = baseline maturity + check-in
compliance.

## Gating (don't over-alert)

- Only players with `match_player_minutes ≥ ~30` (no recovery to track otherwise).
- Only with a **mature readiness baseline** (min check-ins; else show low
  confidence / no flag).
- Only flag at MD+1 if FAR below the expected echo — never just "low" (that's
  expected). Avoids the false-alarm trap on MD+1.
- Respect team/player breaks (`team_breaks` / `client_breaks`) — no watch on a
  scheduled off-period.

## Honest notes

- This is a **subjective-readiness** recovery signal (the only one available);
  label it as such. It's directional, not a medical recovery test.
- Needs the MD-day, which the system already derives (`match_schedule` ×
  `match_player_minutes` → `mdDay` in `fatigue/classify.ts`).
- Surface it as a **distinct labelled signal** ("recovery watch / ↘ still below"),
  not as the canonical readiness color (per CLAUDE.md: trajectory signals are shown
  next to the color, never as the color).

## Order of work
1. `recoveryWatch` lib — day-aware expectation + z vs own baseline (reuse
   `flagAgainstBaseline`); inputs: player, minutes, mdDay, readiness series.
2. Endpoint returning open watches per team (gated on minutes + mature baseline).
3. Surface on `/coach/post-match-recovery` + a Daily Briefing line.
4. Re-check loop: a watch stays open across check-in days until recovered or
   MD+3+ escalation.
Verify: `npx eslint` per file; sanity on a real match (e.g. 16-Jun) — a player who
played full minutes and stays below baseline at MD+2 raises a watch; one who
rebounds by MD+2 does not. User runs dev server + git.
