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

## HSR — mostly already automatic (corrected 2 Sep 2026)
The earlier worry was "the sync stores distance + Player Load per window but not HSR." Verified against
the live data, the picture is better than that:
- **Per-session / per-period HSR is ALREADY auto-synced.** `normalize.ts` maps
  `velocity_band5/6_total_distance` onto `player_external_load_daily` every daily sync (1,099 Breiðablik
  rows carry it in the last 90 days). HSR = V5 + V6 at this account's 19.8 km/h band-5 edge — so a
  season *period-level* HSR trend needs no CTR upload.
- **Per-WINDOW HSR is wired but dormant.** `miiPeakPeriod.ts` already probes a per-window HSR MII
  interval (`metric: 'hsr'`); the daily sync would populate `player_load_peak_period` with it
  automatically — **no code change** — the moment the org exposes that interval in OpenField
  Reporting_Parameters. Today `player_load_peak_period` has 3,336 rows but 0 HSR rows, because that
  per-window HSR interval isn't enabled yet. This is a **data-enablement step**, not a code gap — same
  class as the RHIE / MII-Player-Load params (see `docs/tasks/catapult-backfill-run-brief.md`).
- **The CTR upload is the fallback / for-the-record path**, not the only way to get HSR: it gives the
  per-period HSR (session + each half) with the window clock, and puts the match on record in
  `player_peak_window`. Upload it when you want that match's HSR explicitly or the kickoff-aligned clock.

## The Fusion tactical overlay — Wyscout needed, Breiðablik files only
Only when you want "his hardest minute was defending a corner / his hardest 5-min was his own attack".
- Download from Wyscout: **Breiðablik `player-events`** (each Breiðablik player's on-ball actions) +
  **Breiðablik `team-events`** (Breiðablik's tactical phases — includes out-of-possession phases like
  "crosses conceded", so you can see when the team was defending).
- **You do NOT need the opponent's files** for your own players' fusion. The opponent (e.g. Fram)
  SportsCode files are only for scouting that opponent — a separate job.
- Upload both on the **Power Curve Intelligence** page → "Peak-context — Wyscout events (fusion)".
  It aligns each already-loaded Catapult peak window to the events and shows, per player per window,
  his on-ball actions + the team's tactical phase (first half exact; second half half-time-shifted,
  flagged "approx").
- One match's fusion is a **demo/insight**, not a benchmark. Do it for matches worth a tactical story
  (a big game, a player you're profiling), not routinely.

## So, in practice
- **Every match, minimum:** nothing extra — the daily Catapult sync keeps the season benchmark current,
  and per-session HSR flows with it.
- **When you want the per-WINDOW HSR curve:** enable the per-window HSR MII interval in OpenField once
  (then it auto-syncs), or upload that match's **Catapult CTR** (Activity Report → CSV) for that match's
  per-period HSR + window clock now.
- **When you want the tactical Fusion read:** also download the two **Breiðablik Wyscout SportsCode**
  files and upload them on the Power Curve page. Opponent files only for scouting.
- **Pre-season:** benchmark against last season's curve + the Ju position numbers; build toward and
  past them. **In-season:** maintain, top-up players who played <30 min, and train the repeat-after-peak
  ("next period") quality — the benchmark tells you the target, readiness tells you the day's dose.

Ref: `player_load_peak_period` (season curve, auto), `player_external_load_daily.velocity_band5/6_total_distance`
(per-session HSR, auto), `player_peak_window` (per-match CTR: clock + HSR), `miiPeakPeriod.ts` (the
dormant per-window HSR interval), `parseSportscode.ts` + `/api/coach/load/peak-context/upload` (Wyscout
fusion), Power Curve page, `docs/product/fusion-real-data-proof.md`, `docs/tasks/catapult-backfill-run-brief.md`.
