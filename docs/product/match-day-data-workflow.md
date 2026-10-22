# MicroPulse — match & season data workflow (what to pull, when, and what it feeds)

Two separate questions, two separate feeds. Keeping them apart removes the confusion about "do I need
Wyscout every match?" — **no.**

## The two feeds

| Feed | Source | Files | Feeds | How often |
|---|---|---|---|---|
| **Physical** | Catapult OpenField | auto-sync (daily) + **CTR / Activity-Report CSV** per match | the season peak-demand benchmark + per-period HSR | auto every day; CTR when you want HSR / the match on record |
| **Tactical** | Wyscout (Hudl) | **SportsCode XML** — Breiðablik `player-events` + `team-events` | the Fusion overlay only (what a peak window was *made of*) | only for matches you want the tactical read on |

## The season peak-demand benchmark — NO Wyscout needed
This is the number that drives training design (the player's worst-case peak he must be prepared for).
It is **purely physical** and **accumulates over the whole season** — one match is never the benchmark.
- The **automatic Catapult sync** already builds it: it collects each session's peak 1/3/5-min windows
  into `player_load_peak_period` (distance + Player Load) across the season. The **Power Curve** page
  shows the season-best curve per window. That is the benchmark.
- Use a **rolling window (last ~8–12 weeks)**, a high percentile (season-best or ~90th), and watch the
  trend — not a single fixed number, not one game.
- Two references side by side: the **external / position** benchmark (Ju 2022: 55/72/86 m for a
  centre-back, etc.) and the player's **own** season curve.
- **Gap today:** the auto-sync stores distance + Player Load per window, but **not HSR** per window. So
  a season *HSR* curve needs each match's HSR (V5+V6) — which comes from the CTR upload. Either upload
  the CTR after each match, or (better) have the sync pull the HSR band too (see brief note below).

## The Fusion tactical overlay — Wyscout needed, Breiðablik files only
Only when you want "his hardest minute was defending a corner / his hardest 5-min was his own attack".
- Download from Wyscout: **Breiðablik `player-events`** (each Breiðablik player's on-ball actions) +
  **Breiðablik `team-events`** (Breiðablik's tactical phases — includes out-of-possession phases like
  "crosses conceded", so you can see when the team was defending).
- **You do NOT need the opponent's files** for your own players' fusion. The opponent (e.g. Fram)
  SportsCode files are only for scouting that opponent — a separate job.
- One match's fusion is a **demo/insight**, not a benchmark. Do it for matches worth a tactical story
  (a big game, a player you're profiling), not routinely.

## So, in practice
- **Every match, minimum:** nothing extra — the daily Catapult sync keeps the season benchmark current.
- **When you want HSR in the benchmark:** upload that match's **Catapult CTR** (Activity Report → CSV).
- **When you want the tactical Fusion read:** also download the two **Breiðablik Wyscout SportsCode**
  files and upload them. Opponent files only for scouting.
- **Pre-season:** benchmark against last season's curve + the Ju position numbers; build toward and
  past them. **In-season:** maintain, top-up players who played <30 min, and train the repeat-after-peak
  ("next period") quality — the benchmark tells you the target, readiness tells you the day's dose.

Ref: `player_load_peak_period` (season curve, auto), `player_peak_window` (per-match CTR: clock + HSR),
`parseSportscode.ts` (Wyscout ingester), Power Curve page, `contextualised-peak-periods-page.html`
(the Ju position benchmarks), `fusion-real-data-proof.md` (one-match overlay example).
