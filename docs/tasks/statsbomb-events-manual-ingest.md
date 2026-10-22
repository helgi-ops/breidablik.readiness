# StatsBomb events — manual export → `sb_match_events` ingest (no API key)

There is **no StatsBomb API key** on this license, and the IQ **Data Locker did not load** (blank + spinner
across ~5 attempts — likely no raw-event-export entitlement, or a persistent failure). The classic match page
only offers the **PDF match report**. So events come from a **manual export the coach does in IQ**. This spec
makes the ingester accept whatever format that export produces, so the file just drops in and the flagship
stacked bar (Ju tactical actions in the peak window) lights up.

## Accept BOTH export shapes (detect by extension/header)

`parseSbEvents(file)` must handle:
- **A) Events JSON** — the StatsBomb open-data schema: an array of event objects (each with `type`, `team`,
  `player`, `minute`, `second`, `location`, `related_events`, and optionally `freeze_frame` for 360). This is
  the richest — keep it the preferred path.
- **B) Event CSV** — a flat per-event table (one row per event) if that's all the IQ UI will export. Map the
  columns (see field map). CSV usually lacks `related_events` and 360, so the relational variables
  (Over/Underlap, Covering) degrade gracefully to "not derivable" (confidence gate), never guessed.

Detect: `.json` → schema A; `.csv` → schema B (by header). Reject anything without the minimal fields below.

## Minimal fields the Ju derivation + alignment need

Per event: `match_id`, `event_id` (id/uuid), **`type`** (event name), `team`, **`player`** (id + name),
`period` (1/2/ET), **`minute`**, **`second`**, **`location` [x,y]**. Plus, for specific rules:
`pass.end_location` + pass height/through-ball flag; `carry.end_location`; `dribble` outcome; `pressure`;
`interception`; `duel`; `ball_receipt`; `under_pressure`. Optional (JSON/360 only): `freeze_frame`
(teammate/opponent xy) → Over/Underlap + Covering.

CSV column aliases to accept (case-insensitive): `event_id|id`, `type|event_type`, `player|player_name`,
`team|team_name`, `period`, `minute|min`, `second|sec`, `x`,`y` (or `location`), `pass_end_x/y`,
`outcome`, `under_pressure`.

## Time alignment (the remaining feed-1 work)

`peakPeriodContext` already aligns windows to events; it needs each event as **seconds-from-kickoff**:
`t = period_offset(period) + minute*60 + second`, where `period_offset(2)=45*60` (+ ET as needed).
Catapult `window_start` (from the shipped CTR feed, `player_peak_window`) → convert to seconds-from-kickoff
the same way, then match events whose `t ∈ [window_start, window_start+window_seconds]`. (Kickoff offset per
half may need a small constant if the GPS clock and match clock differ — store it as `clock_offset_s` per
match, coach-confirmable.)

## Player identity

StatsBomb `player.id`/name → MicroPulse `player_id` via a `statsbomb_player_map` (or fuzzy name-match with
manual confirm, like `catapult_athlete_map`). Unmapped players are dropped, not guessed.

## Storage
`sb_match_events(match_id, event_id, period, minute, second, t_seconds, type, team, player_id, x, y, extra jsonb,
source='statsbomb_manual', imported_at)`. Idempotent on `match_id + event_id`. Keep the raw event in `extra`
so new derivation rules can be added without re-import.

## Which IQ export to choose (coach, in StatsBomb IQ)
Try in order:
1. **Data Locker** (`/en/data-locker` → Matches) → per-match **Events** export (JSON preferred). If it won't
   load, try a different browser / clear cache, or ask your Hudl/StatsBomb rep whether event export is in your
   license.
2. If only a **PDF/CSV** is offered on the match page, export the **event CSV** if present (schema B).
3. If neither: this license may be **analysis-only** (no raw events) — then the tactical-actions bar can't be
   built from StatsBomb; fall back to InStat/other event source, or request the entitlement.

## What still works without events (so effort isn't wasted)
- The **Catapult peak-window feed is shipped** → the **peak-HSR Ju Table-2 score + window shape** already
  render (no events needed).
- Events add the **tactical-actions breakdown** (the stacked bar). Any one match's export proves the pipeline.

## Guardrails
- Derived tactical categories labelled "derived (approximation)" + confidence; relational ones omitted when
  360 absent (never guessed). Descriptive only — never touches readiness colour. Provenance: source, export
  date, clock_offset, which fields present.

Ref: `ju-tactical-variables-derivation.md`, `catapult-ctr-peak-window-ingest.md`, `peak-period-context-spec.md`.
