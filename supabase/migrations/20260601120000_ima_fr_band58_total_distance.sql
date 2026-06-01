-- ============================================================
-- IMA Free Running Band 5-8 Total Distance
-- ============================================================
-- High-intensity running distance derived from the Catapult stride
-- series (cadence bands 5-8). Domain-consistent with the band 5-8
-- stride COUNTS we already store, so a true high-cadence stride
-- length can be computed as band58 distance ÷ band 5-8 strides
-- (the previous total_distance ÷ total_strides was a crude proxy).
-- Ingested by /api/coach/external-load/upload.
-- ============================================================

alter table public.player_external_load_daily
  add column if not exists ima_fr_band58_total_distance numeric;

comment on column public.player_external_load_daily.ima_fr_band58_total_distance is
  'IMA Free Running band 5-8 total distance (m) — high-intensity running distance from the stride series.';
