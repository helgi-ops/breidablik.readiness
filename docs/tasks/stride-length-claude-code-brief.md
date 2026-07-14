# Stride length — "is he still pushing, or just turning his legs over?"

**Status:** ✅ SHIPPED (commit `4995cd1`, 2026-07-13). Engine + endpoint + UI + cleanup all done;
tsc clean, 341 tests pass (incl. the Ágúst Orri case), lint clean on new code. Every surface reads
one shared loader (`src/lib/micropulse/strideLength/loader.ts`) → `assessStrideLength` — no surface
re-derives the ratio or the flag.

## What it measures

Stride length = high-cadence distance ÷ high-cadence strides (IMA free-running bands 5–8).

Cadence tells you how fast the legs turn over. Stride length tells you how much ground
each stride covers — a proxy for force into the floor. Under neuromuscular fatigue an
athlete characteristically **maintains stride frequency while stride length shortens**:
the legs keep spinning, the push weakens (Girard, Micallef & Millet 2011; Morin et al.
2011). Cadence alone cannot see this. GPS distance alone cannot see this. The ratio can.

**This data only became available on 2026-07-13.** `ima_fr_band5..8_total_distance` was
read by six features and written by none — the Catapult sync never requested the
parameter. It is now requested, mapped, summed and stored, and Breiðablik is backfilled
(10 weeks, 90–99% coverage).

## The real case it found

**Ágúst Orri Þorsteinsson, 2026-06-16.** Played the **full 90 minutes**.

| | 16 Jun | His usual |
|---|---|---|
| m/min | **91** | 117–138 |
| Stride length | **1.90 m** | 2.42 m (−21.5%) |
| GPS high-speed | 792 m | 971–1,612 m |
| Max velocity | 31.5 | normal |

He *could* run fast — he didn't. Full match, 30% less ground per minute, strides 21.5%
short. Three independent measures agree. Neither GPS nor stride count alone showed it.

## Three traps the engine already avoids — do not undo them

**1. Never pool session types.** Pooled, stride length has ~18% within-player day-to-day
variation; the fatigue signal is 2–5%. A flag built on that fires at random. The noise is
session type talking:

```
match       (≥80 min)   2.30 m   within-player CV  4.2%   ← verdicts allowed
big session (45–79)     1.98 m                     8.5%   ← verdicts allowed
light       (<45)       1.76 m                    15.1%   ← REFUSED, and says so
```

The same player strides 30% longer in a match than in a light session. `assessStrideLength`
compares like with like and returns `unmeasurable` for light sessions rather than guessing.

**2. Classify by MINUTES, never by distance.** Distance is the quantity the metric is built
on — using it to select the comparison set is circular, and it silently drops the players
the flag exists to catch. Ágúst Orri covered 8,222 m; under a "≥8,000 m = match" rule he
scraped in by 222 m. Slightly worse and he'd have been filtered out of his own comparison
set and the system would have said nothing.

Minutes come from **`match_player_minutes`** (coach-entered, already in place since April,
used by 27 files). `classifySession(minutesPlayed, totalDistanceM?)` takes minutes first and
falls back to distance only when minutes are absent — treat that fallback as lower confidence.

**3. Threshold is 2.5 SD, and it was measured.** Across Breiðablik's 57 full matches:

```
2.0 SD (-8.4%)  → 2 flags (3.5%)
2.5 SD (-10.5%) → 1 flag  (1.8%)   ← chosen
3.0 SD (-12.6%) → 1 flag  (1.8%)
```

The genuine event sits at −17.6%, far beyond all three. 2.5 SD loses nothing real and halves
the false alarms. A missed flag costs one conversation. A false flag costs trust in every
flag that follows.

## ✅ Endpoint (done)

`GET /api/coach/stride-length?playerId=…` (and the no-playerId team variant for the match-day view).
Built on `loadStrideVerdict` / `loadTeamStrideVerdicts` (squad group-norm computed once).

Assemble per player:
- today's `ima_fr_band5..8_total_distance` + `..._stride_count` from `player_external_load_daily`
- `minutes_played` from `match_player_minutes` for that date
- his prior same-kind sessions as history
- optional squad/position norm as `groupNormM` (the engine shrinks toward it while history is thin)

Then call `assessStrideLength(today, history, groupNorm)` and return the verdict verbatim.
Do **not** re-derive any of it in the route — the engine is the single source.

## ✅ UI (done)

Surfaced on: **player Today** (folded into the MD-aware recap, `PlayerTodayRecapPortal` /
`/api/player/today-recap` — the recap now also fires on a match day even with no planned target);
**post-match** player `PlayerGameReportCard` (+ `/api/player/game-report`) and coach
`player-game-report` page; and the coach `StrideIntelligenceCard` (`/coach/decel-intelligence`) was
upgraded to this session-classified verdict, dropping its old pooled `STRIDE_LENGTH_DROP` flag so the
two reads never disagree. Layered read as below:

- **Layer 0** — the verdict, one sentence, boldest: *"His strides are 21.5% shorter than his usual match."*
- **Layer 1** — the plain why, no click: `verdict.reasonIs` / `verdict.reason` already writes it,
  in both languages, in coach language. Show the two numbers (1.90 m vs 2.42 m) and the minutes played.
- **Layer 2** — behind "Show details": per-band figures, CV, SD threshold, citation.

Confidence must be visible whenever `provisional === true` (fewer than 8 same-kind sessions
of his own — the norm is still part group). Never hide that.

`verdict === "unmeasurable"` must render as an honest absence ("not measurable on a light
session — the noise is three times the signal"), never as a green tick.

## Known limits — state them, don't paper over them

- **HK cannot use this.** Catapult does not compute IMA Free Running for their org — confirmed
  in OpenField's own UI (`n/a`). Open with Catapult. The engine should simply return
  `unmeasurable` there rather than a spurious zero.
- Only ~9 Breiðablik players have ≥4 full matches. Norms are thin; confidence will read low
  for most of the squad until the season builds. That is correct behaviour, not a bug.

## ✅ Cleanup (done)

Deleted **`src/components/coach/MatchMinutesTable.tsx`** — dead code, written before I noticed
`/coach/match-minutes` already existed. Nothing imported it. It was exactly the kind of duplicate
that causes the next bug.
