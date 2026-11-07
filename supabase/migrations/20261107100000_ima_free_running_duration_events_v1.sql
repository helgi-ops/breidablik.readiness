-- IMA Free Running: per-band time, event count, V1 stride rate, bands 1–4 distance and the
-- verbatim Free Running payload (Nov 2026).
--
-- Why: the stored band 5–8 data did not behave like speed bands (flat ~2.3 m/stride and
-- ~88 stride rate in every band, band 8 metres far above GPS sprint metres), while
-- Breidablik's OpenField IMA Free Running bands are set at 0–8–12–15–18–21–24–27–100.
-- Total Distance ÷ Total Duration per band gives the real mean speed in each band and
-- settles whether those thresholds are km/h speed bands. Average Stride Rate 1.0 (V1) is
-- kept in its own column so V1 and V2 algorithm outputs are never mixed. ima_fr_raw keeps
-- every Free Running key Catapult returned so the source of each stored number is visible.
-- All nullable, no backfill: populated by the Catapult sync from the next run onward.

alter table public.player_external_load_daily
  add column if not exists ima_fr_band1_total_distance numeric,
  add column if not exists ima_fr_band2_total_distance numeric,
  add column if not exists ima_fr_band3_total_distance numeric,
  add column if not exists ima_fr_band4_total_distance numeric,
  add column if not exists ima_fr_band1_total_duration numeric,
  add column if not exists ima_fr_band2_total_duration numeric,
  add column if not exists ima_fr_band3_total_duration numeric,
  add column if not exists ima_fr_band4_total_duration numeric,
  add column if not exists ima_fr_band5_total_duration numeric,
  add column if not exists ima_fr_band6_total_duration numeric,
  add column if not exists ima_fr_band7_total_duration numeric,
  add column if not exists ima_fr_band8_total_duration numeric,
  add column if not exists ima_fr_band1_event_count integer,
  add column if not exists ima_fr_band2_event_count integer,
  add column if not exists ima_fr_band3_event_count integer,
  add column if not exists ima_fr_band4_event_count integer,
  add column if not exists ima_fr_band5_event_count integer,
  add column if not exists ima_fr_band6_event_count integer,
  add column if not exists ima_fr_band7_event_count integer,
  add column if not exists ima_fr_band8_event_count integer,
  add column if not exists ima_fr_band1_avg_stride_rate_v1 numeric,
  add column if not exists ima_fr_band2_avg_stride_rate_v1 numeric,
  add column if not exists ima_fr_band3_avg_stride_rate_v1 numeric,
  add column if not exists ima_fr_band4_avg_stride_rate_v1 numeric,
  add column if not exists ima_fr_band5_avg_stride_rate_v1 numeric,
  add column if not exists ima_fr_band6_avg_stride_rate_v1 numeric,
  add column if not exists ima_fr_band7_avg_stride_rate_v1 numeric,
  add column if not exists ima_fr_band8_avg_stride_rate_v1 numeric,
  add column if not exists ima_fr_raw jsonb;

comment on column public.player_external_load_daily.ima_fr_raw is
  'Every IMA Free Running key/value Catapult returned (V1 imafreerunning_* / ima_v1_free_run_*, V2 ima_v2_free_run_*), verbatim. Provenance for the typed ima_fr_* columns.';
comment on column public.player_external_load_daily.ima_fr_band1_total_duration is 'IMA Free Running Band 1 Total Duration as returned by Catapult (expected seconds). Distance / duration = mean speed in the band.';
comment on column public.player_external_load_daily.ima_fr_band2_total_duration is 'IMA Free Running Band 2 Total Duration as returned by Catapult (expected seconds). Distance / duration = mean speed in the band.';
comment on column public.player_external_load_daily.ima_fr_band3_total_duration is 'IMA Free Running Band 3 Total Duration as returned by Catapult (expected seconds). Distance / duration = mean speed in the band.';
comment on column public.player_external_load_daily.ima_fr_band4_total_duration is 'IMA Free Running Band 4 Total Duration as returned by Catapult (expected seconds). Distance / duration = mean speed in the band.';
comment on column public.player_external_load_daily.ima_fr_band5_total_duration is 'IMA Free Running Band 5 Total Duration as returned by Catapult (expected seconds). Distance / duration = mean speed in the band.';
comment on column public.player_external_load_daily.ima_fr_band6_total_duration is 'IMA Free Running Band 6 Total Duration as returned by Catapult (expected seconds). Distance / duration = mean speed in the band.';
comment on column public.player_external_load_daily.ima_fr_band7_total_duration is 'IMA Free Running Band 7 Total Duration as returned by Catapult (expected seconds). Distance / duration = mean speed in the band.';
comment on column public.player_external_load_daily.ima_fr_band8_total_duration is 'IMA Free Running Band 8 Total Duration as returned by Catapult (expected seconds). Distance / duration = mean speed in the band.';
