-- Backfill: surface HSR on the Power Curve for CTR uploads ingested BEFORE the
-- upload route learned to also write the long power-curve table.
--
-- The CTR peak-window ingest stores HSR fixed-bin peaks in player_peak_window
-- (window_label 'Peak {N}min HSR', value in hsr_m). The Power Curve card reads
-- player_load_peak_period (long format), so pre-existing uploads showed no HSR tab.
-- This copies those HSR peaks across as per-minute intensity (hsr_m / window_min,
-- m/min) — the curve's decreasing-with-window convention. Idempotent (ON CONFLICT),
-- so re-running is a no-op; a fresh env with an empty player_peak_window inserts 0.
--
-- Gating is inherited: peakFixedWindows only emitted HSR when the account band-5
-- edge IS the Ju threshold, so every 'Peak %min HSR' row here is already on-threshold.
-- New uploads write this row directly (see api/coach/load/peak-window/upload/route.ts).

insert into player_load_peak_period (player_id, team_id, date, source, window_min, metric, value, unit)
select
  w.player_id,
  w.team_id,
  w.match_date,
  'catapult_ctr',
  w.window_min,
  'hsr',
  round((w.hsr_m / w.window_min)::numeric, 2),
  'm/min'
from player_peak_window w
where w.source = 'catapult_ctr'
  and w.window_label like 'Peak %min HSR'
  and w.hsr_m is not null
  and w.window_min is not null
  and w.window_min > 0
on conflict (player_id, date, source, window_min, metric)
do update set value = excluded.value, unit = excluded.unit, team_id = excluded.team_id;
