-- ============================================================
-- IMA Free Running per-band distance (bands 5-8)
-- ============================================================
-- We already store the combined band 5-8 total distance
-- (ima_fr_band58_total_distance). This adds the four individual
-- band distances so the IMA Intelligence surface can show WHERE
-- the high-intensity running sits (band 5 = lowest of the high
-- cadence bands … band 8 = top cadence), with the total = sum.
-- ============================================================

alter table public.player_external_load_daily
  add column if not exists ima_fr_band5_total_distance numeric,
  add column if not exists ima_fr_band6_total_distance numeric,
  add column if not exists ima_fr_band7_total_distance numeric,
  add column if not exists ima_fr_band8_total_distance numeric;

comment on column public.player_external_load_daily.ima_fr_band5_total_distance is
  'IMA Free Running band 5 total distance (m).';
comment on column public.player_external_load_daily.ima_fr_band6_total_distance is
  'IMA Free Running band 6 total distance (m).';
comment on column public.player_external_load_daily.ima_fr_band7_total_distance is
  'IMA Free Running band 7 total distance (m).';
comment on column public.player_external_load_daily.ima_fr_band8_total_distance is
  'IMA Free Running band 8 total distance (m).';
