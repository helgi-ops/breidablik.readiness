# Movement (IMA) on drills

What a drill carries after a Catapult sync, and why it works for indoor teams.

## What gets measured per drill

Catapult's IMA (inertial movement analysis) counts movement from the unit's accelerometer, so the numbers are
real indoors where GPS has no satellite lock. Per drill, per player:

| Line on the card | Detail level | Columns |
|---|---|---|
| Accelerations (+ how many hard) | low / medium / hard, per minute | `ima_accel`, `ima_accel_low|med|high` |
| Braking (+ how many hard) | low / medium / hard, per minute | `ima_decel`, `ima_decel_low|med|high` |
| Changes of direction (+ share to the left) | low / medium / hard, left / right, per minute | `ima_cod_total`, `high_ima` (hard), `ima_cod_med`, `ima_cod_low`, `ima_cod_left`, `ima_cod_right` |
| Jumps | per minute | `jump_count` (`jumps` on actuals) |
| Long runs (18 s+) + strides in them | caveat: jogs included | `long_runs`, `long_run_strides` |

Low + medium + hard = the total; left + right = changes of direction. Catapult's intensity bands 1–3 = low /
medium / hard. Requested per period as the raw band counts in `CATAPULT_PERIOD_IMA_RAW_PARAMETERS`; no extra
Catapult call.

Stored in three places (same keys): `saved_sessions.items[].actual` (squad mean per drill),
`player_drill_load` (per player per drill), `drill_library` (the drill's profile from the last measured session).

## Indoors (no GPS)

A drill with Player Load but under 20 m squad-mean distance (`periodHasNoGps`) is read as indoors:

- the actual carries `no_gps: true`;
- the drill's GPS columns (distance, high-speed, sprint, top speed, Acc/Dec B2-3, metabolic) are **not**
  overwritten with the zeros, so an earlier outdoor profile survives; load, duration and IMA are written;
- `drill_library.measured_on / measured_players / measured_no_gps` record where the numbers came from. The card
  says e.g. "Measured 5 Nov · 11 players · indoors, no GPS", and adds "GPS numbers from an earlier outdoor
  session" when the drill still holds one;
- the built-session view tags the drill "indoors, no GPS", and the load-balance comparison (GPS-based) says it
  can't compare instead of reading 0.

## When numbers reach a drill (coach side)

Only through a session built in MicroPulse (a coach decision, Nov 2026 — no direct period → library match,
no auto-created drills, no fuzzy names):

1. the session is split into periods in OpenField (one per drill);
2. a session is built in MicroPulse for that day;
3. the period name equals the drill name (otherwise the period falls to order matching).

Forward-only: sessions synced before 11 Nov 2026 keep the five IMA totals they had; the new columns stay empty.

## Long runs per drill (added 11 Nov 2026)

Long runs = IMA Free Running runs lasting 18 s or more. Per period Catapult returns each band's run **count**
and **strides** (requested as `CATAPULT_PERIOD_FR_RAW_PARAMETERS`, indoors too). Which bands are 18 s+
depends on the band edges the session was classified with, so `applyLongRuns` uses the edges of the player's
day row (`ima_fr_band_bounds`, set by the DB trigger): bands 5–8 under the legacy edges, 6–8 under the new
ones. No 18 s edge (Catapult's 3-band default) or edges marked `unknown` → null, never 0.

Per period the bands' **distance and time read 0**, outdoors as well (session level only, like HMLD). So the
pace of a drill's long runs is unknown: they include jogs and never count as running load (the match-pace
rule needs pace). The card's tooltip and the detail panel say so. The OpenField CSV upload has no per-band
counts, so CSV-synced drills get no long runs.

Checked live on HK 8 Sept 2026 (indoors, 18 players): Warm Up 1.1 long runs / 59 strides per player,
Possession 0.9 / 34, Tactic 0.8 / 27, Rondo 0.4 / 17, Sprettir 0.

Player app (added 12 Nov 2026): the player's own drill row (`DrillLoadRow`, via `/api/player/session-drills` and
`/api/player/drill-load`) adds "· 2 long runs" to the headline when there is at least one, and "Long runs" +
"Their strides" under Details with a one-line "jogs included, not hard running" note. Null → nothing shown.

Descriptive only; never the readiness colour. Citations: Harper & McBurnie 2021; McBurnie et al. 2022; Morin et al. 2011; Gaudino et al. 2014;
Casamichana & Castellano 2010; Bishop et al. 2020. Code: `src/lib/micropulse/drillActuals/`
(`index.ts`, `movementRead.ts`), `normalizeCatapultPeriodStats` in `src/lib/integrations/catapult/normalize.ts`.
