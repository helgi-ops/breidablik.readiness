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

## Not per drill (checked live, HK, Nov 2026)

Long runs (Free Running bands 5–8): the **count** of long runs and the **strides** in them come back per
period, indoors too. Their **distance and duration read 0 per period**, outdoors as well (session-level only,
like HMLD). Not stored per drill yet.

Descriptive only; never the readiness colour. Citations: Harper & McBurnie 2021; Gaudino et al. 2014;
Casamichana & Castellano 2010; Bishop et al. 2020. Code: `src/lib/micropulse/drillActuals/`
(`index.ts`, `movementRead.ts`), `normalizeCatapultPeriodStats` in `src/lib/integrations/catapult/normalize.ts`.
