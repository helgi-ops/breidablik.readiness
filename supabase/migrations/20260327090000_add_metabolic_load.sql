-- Migration: add_metabolic_load
-- Adds metabolic load fields to player_external_load_daily.
-- Additive only – no existing columns are altered or removed.
-- Reversible: see rollback section at bottom (commented out).

-- ============================================================
-- RAW / SOURCE FIELDS
-- metabolic_power already exists as the avg value; we add peak,
-- HMLD, energy, time-above-threshold, generation tag, and validity
-- flags.
-- ============================================================

alter table public.player_external_load_daily
  add column if not exists metabolic_power_peak            numeric(10,2) null,
  add column if not exists high_metabolic_load_distance_m  numeric(10,2) null,
  add column if not exists metabolic_energy_kj             numeric(10,2) null,
  add column if not exists time_above_hml_threshold_s      numeric(10,2) null,
  add column if not exists metabolic_power_gen             text          null,
  add column if not exists metabolic_data_valid            boolean       not null default false,
  add column if not exists metabolic_data_source           text          null,
  add column if not exists metabolic_data_notes            text          null;

-- ============================================================
-- DERIVED / NORMALISED FIELDS
-- Z-scores relative to athlete rolling baseline (28-day window),
-- composite Metabolic Load Score (0–100), band classification,
-- and fatigue type.
-- ============================================================

alter table public.player_external_load_daily
  add column if not exists metabolic_power_avg_z           numeric(8,4)  null,
  add column if not exists metabolic_power_peak_z          numeric(8,4)  null,
  add column if not exists hml_distance_z                  numeric(8,4)  null,
  add column if not exists time_above_hml_threshold_z      numeric(8,4)  null,
  add column if not exists metabolic_load_score            numeric(6,2)  null,
  add column if not exists metabolic_load_band             text          null,
  add column if not exists metabolic_flag                  text          null,
  add column if not exists fatigue_type                    text          null,
  add column if not exists data_confidence_metabolic       numeric(4,3)  null;

-- ============================================================
-- SUPPORTING INDEXES
-- ============================================================

create index if not exists player_external_load_daily_metabolic_score_idx
  on public.player_external_load_daily (team_id, date desc, metabolic_load_score);

create index if not exists player_external_load_daily_metabolic_valid_idx
  on public.player_external_load_daily (player_id, date desc, metabolic_data_valid);

-- ============================================================
-- ROLLBACK (keep commented; uncomment if migration needs reversal)
-- ============================================================
-- alter table public.player_external_load_daily
--   drop column if exists metabolic_power_peak,
--   drop column if exists high_metabolic_load_distance_m,
--   drop column if exists metabolic_energy_kj,
--   drop column if exists time_above_hml_threshold_s,
--   drop column if exists metabolic_power_gen,
--   drop column if exists metabolic_data_valid,
--   drop column if exists metabolic_data_source,
--   drop column if exists metabolic_data_notes,
--   drop column if exists metabolic_power_avg_z,
--   drop column if exists metabolic_power_peak_z,
--   drop column if exists hml_distance_z,
--   drop column if exists time_above_hml_threshold_z,
--   drop column if exists metabolic_load_score,
--   drop column if exists metabolic_load_band,
--   drop column if exists metabolic_flag,
--   drop column if exists fatigue_type,
--   drop column if exists data_confidence_metabolic;
-- drop index if exists player_external_load_daily_metabolic_score_idx;
-- drop index if exists player_external_load_daily_metabolic_valid_idx;
