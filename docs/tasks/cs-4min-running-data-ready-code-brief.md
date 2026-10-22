# Claude Code brief — CS/D′ 4-min running anchors are ALREADY captured (build the read on top)

**Status header — read this first.** The 4-minute maximal running-test numbers have **already been
fetched from Catapult and recorded in the database.** Do **NOT** re-import, re-fetch, or re-parse any
Catapult export for this — the data is in place. This brief is only about **consuming** it.

## What's already done (do not redo)

- **Migration applied + saved:** `supabase/migrations/20260817140000_player_running_test.sql`
  (table `public.player_running_test`, RLS mirrored from `player_load_peak_period`, and 20 seed rows).
- **Data recorded:** each player's **best 4-minute maximal running effort**, distance recorded
  **as-is** (the coach confirmed the distance is the true 4-min figure; the period-tag duration varied
  3:55–4:50 only because of when the Catapult marker was started, so the tag time is NOT trusted — the
  distance is). 20 players, ~999–1182 m.
- **Source data** was `export_17-08-26(2).csv` (Timeline period export). Extraction/QA is complete.

Table shape:

```
player_running_test(
  id uuid pk, player_id uuid fk players, team_id uuid,
  test_date date,               -- 2026-08-17
  test_name text,               -- '4 min running (max)'
  duration_s integer,           -- 240 (the intended test length)
  distance_m numeric,           -- the recorded best 4-min distance (AS-IS)
  speed_m_per_min numeric,      -- distance_m / 4 (convenience)
  source text,                  -- 'catapult_run_test_4min'
  notes text, created_at timestamptz,
  unique(player_id, test_date, test_name, source))
```

Verify it's there (should return 20):

```sql
select count(*), round(min(distance_m)) lo, round(max(distance_m)) hi
from player_running_test where source='catapult_run_test_4min';
```

## What to build

Build the **Critical Speed (CS) + D′** read per the detailed brief
[`critical-speed-cs-dprime-claude-code-brief.md`](./critical-speed-cs-dprime-claude-code-brief.md) —
the pure lib `src/lib/micropulse/load/criticalSpeed.ts`, the read wired into
`api/coach/load/peak-period/route.ts`, and the "Conditioning profile" card on Load Intelligence.

The one change vs that brief: **`player_running_test` is the primary maximal-effort anchor.** Consume it
like this:

1. Read the player's `player_running_test` rows → each is a point `(t = duration_s/60, D = distance_m)`
   on `D = D′ + CS·t`. For the current data every row is `t = 4 min`.
2. Combine with the player's **season-best distance curve** from `player_load_peak_period` (the MII
   1/3/5-min points, stored as m/min → reconstruct `D = value × window_min`). Fit CS + D′ by OLS over
   the combined points.
3. **Guardrail — keep the fit sane:** the maximal 4-min test speed **exceeds** the incidental MII
   "peaks" for ~14/19 players (that's expected: a dedicated max test beats mixed-session peaks). So the
   combined point set can be **non-monotonic** if you blindly merge. Before fitting, drop any MII point
   whose per-minute speed sits **above** the 4-min test speed (physically impossible → it would distort
   the line), or fit CS from the test anchor + the longest reliable MII window only. Always return the
   fit **R²** so a poor fit is visible.

## Guardrails

- **Do NOT re-import the CSV / re-scrape Catapult.** The numbers are already in `player_running_test`.
- **Do NOT merge the test rows into `player_load_peak_period`** (the MII power curve) — they'd break its
  monotonicity. They belong in `player_running_test` and are read separately.
- **Descriptive only.** CS/D′ never feeds the readiness colour, the load target, or the daily decision
  (same rule as the power curve). Show confidence (R² + point count + baseline maturity) and the
  citation (Pettitt 2016; Monod & Scherrer 1965; Morton & Billat 2004).
- **Never fabricate** — if a player has too few points for a stable fit, show "not enough of a curve
  yet," not a guessed number.

## Two data notes to carry forward

- **Gabríel Snær Hallsson** was recorded once (Catapult exported him under two display names,
  "Gabríel S." and "Gabriel H." — the same player; merged, higher value kept).
- **Gunnlaugur G. is NOT recorded** — he isn't in `catapult_athlete_map` or `players`. If he should be
  included, add him to the roster first, then his 4-min best (~1062 m) can be inserted.

## Verify (before calling it done)

1. `npx tsc --noEmit` + `npx eslint` clean on the new lib, the route, and the card.
2. Unit tests for `criticalSpeed.ts` (per the detailed brief) incl. a case where a too-fast MII point is
   correctly dropped so the fit stays monotonic.
3. Hit `GET /api/coach/load/peak-period?player=<uuid>` for a player who has a `player_running_test` row
   (e.g. David Ingvarsson `b1eed779-69c6-4e46-9403-f2358cb2ac3d`) and confirm a sane CS (km/h) + D′ (m) + R².
4. Screenshot the card (EN + IS), including the low-confidence empty state.
