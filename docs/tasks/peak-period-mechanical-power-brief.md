# Claude Code brief — **Peak Period + Mechanical Power** (load layer)

## Goal & rationale

Deepen the load layer with two established, high-value sports-science reads that go **beyond
distance and speed** — the exact thesis Hudl just validated by acquiring Athletic Data
Innovations (ADI): *mechanical power* and *peak-period analysis* to capture the true cost of
the game's most demanding moments. MicroPulse is IMA-native and already carries most of the
raw ingredients, so much of this is computation on data we hold — not new ingestion.

Descriptive load context only. It **feeds** the physical/athlete surfaces (Total Player
Analysis, Match Movement, Load Intelligence) but must **never** change the readiness colour or
the daily decision — same rule as the rest of the load layer.

## What we already have (real columns)

`player_external_load_daily` (Catapult/Statsport/WIMU, keyed `(player_id, date, source)`):
- **Velocity bands 1–8** (`velocity_bandN_total_distance`, `…_rate`, `…_strides`, efforts /
  `…_total_efforts_gen2`) — the speed-zone distribution.
- **IMA bands 1–3 × 12 directions** (`ima_band{1,2,3}_direction{1..12}_count`, low/med/high
  intensity by clock direction) — the multidirectional signature.
- **Accel/decel efforts** (`accel_b2_3_tot_effs_gen2`, `tot_as`, `decel_b2_3_…`, `tot_ds`,
  `ima_accel`, `ima_decel`, `ima_cod`), `player_load`, `player_load_per_minute`,
  `metabolic_power`, and **`Peak Metabolic Power`** (captured via the metabolic-peak keys),
  `max_velocity`, `session_duration`, and `raw_payload_json` (fuller per-session detail).

**Gap:** the daily table is a **session summary** — it does not hold a per-epoch time series,
so a *true* rolling peak (worst 1/3/5-min window) can't be computed from it directly. Two
phases below handle that honestly.

## Phase 1 — from data we already hold (ship first)

Two libs, computed from the existing summary + bands + `raw_payload_json`. Thresholds are
constants at the top; every value carries its source.

**A. Mechanical power / high-intensity cost** — `src/lib/micropulse/load/mechanicalPower.ts`:
- Surface **peak metabolic power** and **metabolic power per minute** already captured, plus a
  **mechanical-load intensity** read = high-intensity IMA band-3 efforts + accel/decel efforts
  per minute (the "cost of cuts and decelerations" ADI talks about), relative to the player's
  own rolling baseline. Classify the session as low / typical / high mechanical demand.
- A **movement profile** = the IMA band × direction distribution rendered as the player's
  movement signature (linear vs multidirectional, braking-biased vs accelerative) — reuse the
  existing IMA/Decel Intelligence surfaces.

**B. Peak-intensity summary** — `src/lib/micropulse/load/peakIntensity.ts`:
- Without a time series, use the **densest available proxies**: `player_load_per_minute`,
  peak metabolic power, band-6+ high-speed rate, and high-intensity efforts per minute — the
  session's peak-intensity fingerprint vs the player's typical and vs the squad.
- **Worst-case session** view: for each player, the match/session with the highest intensity
  proxies — the practical "peak demands" the hamstring RTP protocol already references
  ("game-simulation on the player's individual worst-case GPS demands").

## Phase 2 — true peak period (needs a richer export)

Real **peak-period / rolling-average** analysis (peak 1 / 3 / 5-min PlayerLoad, HSR, metabolic
power, accel-density) and **power curves** (intensity as a function of duration) require
per-interval data. Catapult **OpenField exports a "Peak Period" / period / rolling-average
report** (and per-epoch interval CSVs); Statsport/WIMU have equivalents.
- Add an ingestion path for the **peak-period / interval export** → a new
  `player_load_peak_period(player_id, date, source, window_min, metric, value)` table (long
  format), or capture the interval series into `raw_payload_json` and compute maxima server-side.
- Then `peakPeriod.ts` computes the worst rolling window per metric per session, the **power
  curve** (peak value vs window length), and benchmarks each vs the player's season and the
  squad. This is the ADI-grade read; label it and cite the source.

Save any migration as a timestamped `.sql` under `supabase/migrations/`.

## Where it surfaces

- **Total Player Analysis (athlete axis):** mechanical power, peak metabolic power, movement
  profile, and (Phase 2) peak-period / power curve become athlete-quality bars, benchmarked by
  position — deepening the "how he moves" half.
- **Match Movement / Load Intelligence:** a "peak demands" card per match — the most intense
  window and how it compares to the player's typical, plain-language.
- **Return-to-play:** the peak-period worst-case becomes the concrete final RTP gate (already
  referenced in the hamstring protocol).

Explainability-first: verdict → 2–3 facts → "Show details"; jargon (mechanical power, peak
period, power curve) behind tooltips with a one-line definition; bilingual EN/IS; every value
cites its source. Rules compute; any AI phrasing is labelled and writes from the numbers.

## Definition of done

1. `mechanicalPower.ts` + `peakIntensity.ts` compute from existing `player_external_load_daily`
   (+ `raw_payload_json`); unit-tested on a fixture session (bands + peak metabolic power →
   expected intensity classification + movement profile).
2. Phase-2 peak-period ingestion + `peakPeriod.ts` (behind the interval/peak-period export);
   migration written, applied, committed; power curve + rolling maxima computed and benchmarked.
3. Surfaced on Total Player Analysis (athlete axis) + a Match-Movement "peak demands" card, EN
   and IS, layered read; nothing touches the readiness colour, load target, or daily decision.
4. `npx eslint` clean on changed files; typecheck passes.

## Out of scope

- Re-tracking video or raw 10 Hz processing (that's the tracking vendors' job; we ingest their
  output).
- Any change to the readiness verdict / daily decision.

## Dependencies / relationship

- Feeds the **Total Player Analysis brief** (athlete axis) — mechanical power / peak period are
  named there as athlete qualities.
- Multi-source load ingestion already exists (Catapult/Statsport/WIMU); Phase 2 just adds the
  peak-period/interval export to that pipeline.
- Strategic context: mirrors ADI's "beyond distance and speed" thesis on data we already hold —
  see the valuation memo's market-validation note.
