# Claude Code brief — "Away / national-team camp" load upload (KSÍ OpenField per-player CSV)

## Why
When a player is called up (e.g. KSÍ national team), their club pod stays home, so their MicroPulse load
timeline goes blank for the whole camp — which silently breaks acute:chronic load (Gabbett) and makes them
look under-loaded on return. The federation sends a **per-player Catapult OpenField CSV** (drill-level) plus
a human-readable PDF summary. We need a coach upload that turns that CSV into daily
`player_external_load_daily` rows so the away period is filled with the player's **real** camp load.

A first camp has already been ingested by hand (Hlynur Freyr Karlsson, 22 Sep–6 Oct 2026, 11 days) and
**validated to the PDF exactly** (total 56,450 m, 623 accel, 565 decel, max 37.9). This brief turns that
one-off into a reusable upload. The two sample files are in the repo uploads for reference.

## Input format (confirmed from the real file)
`<n>-Sessions-<Player-Name>-CSV-player.csv` — **one player per file**, **one row per drill**, header:
`playerDisplayName, sessionDate, sessionTitle, sessionType, drillTitle, totalTime, distanceTotal,
distancePerMin, distanceZ5Abs, distanceZ6Abs, highSpeedRunningAbs, maxSpeed, accelerationsAbs,
decelerationsAbs, playerPrimaryPosition`.
- `sessionDate` is **DD/MM/YYYY** (not US). `totalTime` is `HH:MM:SS`.
- A day can contain several sessions (e.g. "Set Pieces" + "MD-2 Attacking Principles"); aggregate **all
  drills across all sessions** for that date into one daily row.
- The PDF is a **human summary only** — do not parse it. The CSV is authoritative. (The PDF may carry a
  free-text medical note, e.g. "Achilles tendinopathy" — surface nothing automatically; that belongs in the
  injury/medical flow, not auto-ingested.)

## Drill→day aggregation + column mapping (verified against the PDF)
Group CSV rows by `sessionDate`; per day:
- `total_distance`          = Σ `distanceTotal`
- `high_speed_distance`     = Σ `highSpeedRunningAbs`   (HSR > ~19.8 km/h)
- `sprint_distance`         = Σ `distanceZ6Abs`         (> 25.2 km/h)
- `accelerations`           = Σ `accelerationsAbs`
- `decelerations`           = Σ `decelerationsAbs`
- `session_duration_minutes`= Σ `totalTime` (→ minutes)
- `max_velocity` & `max_vel`= **max** `maxSpeed` across the day (a peak — never summed)
- `md_day_label`            = map `sessionType`: `Match Day -N`→`MD-N`, `Match Day`→`MD`, `Match Day +N`→`MD+N`
- `total_player_load`       = **null** — this OpenField export is GPS-only (no IMU/player-load column). Don't
  fabricate one.
(The PDF's "HI distance 19.8–25.2" + "Sprint >25.2" = CSV `highSpeedRunningAbs`; `distanceZ6Abs` = sprint.
Verified: Σ per day and the grand totals match the PDF exactly.)

## Write target + tagging
Upsert into `player_external_load_daily`, `onConflict (player_id, date, source)`:
- `source = 'catapult'` (so the load engine's reads — which filter `source in ('catapult','manual','titan')`
  — pick these up and they feed the timeline / acute load like any real session).
- `raw_payload_json = { "away": true, "event": "<camp label, e.g. KSÍ national-team camp Oct 2026>",
  "source_detail": "ksi_openfield_csv", "estimated": false }`.
  - `estimated:false` — these are **real measurements**, so they DO feed baselines (unlike the pod-forgot
    estimate path). `away:true` lets the coach UI badge them "National-team camp" and lets analyses exclude
    them if a coach ever wants club-only norms.
- **Guard:** never overwrite an existing **non-away** `catapult` row for that date (a real club
  measurement). If one exists, skip that date and report it (a player isn't both at camp and at the club the
  same day, but guard anyway).

## Player mapping (one file = one player)
- Read `playerDisplayName`, match to a `players` row on the coach's team (case/-accent-insensitive; trim).
- If no confident match, show an **unmatched** state with a dropdown to pick the player (reuse the existing
  external-load upload mapping pattern — `external_load_uploads.athletes_unmapped`). Never guess silently.
- Support selecting **several player files at once** (a camp returns many players); process each file
  independently. (If KSÍ ever sends one combined CSV with multiple `playerDisplayName`s, group by name too —
  cheap to support now.)

## Where it lives
Reuse the external-load upload infrastructure rather than a new silo:
- Add a source option **"National team / away camp (Catapult OpenField CSV)"** to the existing external-load
  upload hub (alongside Catapult/WIMU/Titan). Write an `external_load_uploads` audit row
  (`source='national_team'` or `'ksi'`, filename, `date_range_start/end`, `rows_parsed`, `rows_committed`,
  `athletes_unmapped`).
- Show a **per-day preview table** (date, MD-label, distance, HSR, sprint, accel/decel, minutes, max speed)
  before commit — same pattern as the Titan/Catapult upload — so the coach confirms before writing.

## Guardrails / tests
- DD/MM/YYYY parsed correctly (22/09/2026 → 2026-09-22, not Sep-22 vs 22-Sep ambiguity).
- Drill→day aggregation matches the PDF totals for the sample file (56,450 m; 623 accel; 565 decel; max
  37.9; and each day's distance).
- `max_vel` is the daily **max**, never a sum; `total_player_load` stays null.
- Idempotent: re-uploading the same file doesn't duplicate (upsert on the unique key); doesn't clobber a real
  non-away club row.
- `away:true` + `estimated:false` set on every written row.
- Unmatched player name → upload halts for that file with a picker, nothing written.
- **Boundary:** writes only `player_external_load_daily`; never `readiness_entries.color` /
  `v_coach_readiness_today_v8`. (Away load feeds the load/ACWR timeline, like any real session — it does not
  set the readiness colour.)
- `npx eslint` on changed files; typecheck; migration for any schema touch saved under `supabase/migrations/`.

## Nice-to-have (optional, flag — don't block)
- A small "National-team camp" badge on the player's load timeline for `away:true` rows, so a coach reading
  the chart knows those sessions were elsewhere.
- Carry `playerPrimaryPosition` into the row only if a position column exists; otherwise ignore.
