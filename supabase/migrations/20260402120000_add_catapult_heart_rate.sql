-- Migration: add_catapult_heart_rate
-- Adds heart rate fields to player_external_load_daily.
-- Additive only – no existing columns are altered or removed.
-- Reversible: see rollback section at bottom (commented out).

-- ============================================================
-- RAW / SOURCE FIELDS
-- avg_heart_rate    – average BPM for the session
-- max_heart_rate    – peak BPM recorded during the session
-- hr_zone_1_time_s  – seconds spent in HR Zone 1 (≈ 50–60 % HRmax)
-- hr_zone_2_time_s  – seconds spent in HR Zone 2 (≈ 60–70 % HRmax)
-- hr_zone_3_time_s  – seconds spent in HR Zone 3 (≈ 70–80 % HRmax)
-- hr_zone_4_time_s  – seconds spent in HR Zone 4 (≈ 80–90 % HRmax)
-- hr_zone_5_time_s  – seconds spent in HR Zone 5 (≈ 90–100 % HRmax)
-- Zone definitions are those configured in Catapult OpenField settings.
-- ============================================================

alter table public.player_external_load_daily
  add column if not exists avg_heart_rate    numeric(5,1) null,
  add column if not exists max_heart_rate    numeric(5,1) null,
  add column if not exists hr_zone_1_time_s  numeric(8,1) null,
  add column if not exists hr_zone_2_time_s  numeric(8,1) null,
  add column if not exists hr_zone_3_time_s  numeric(8,1) null,
  add column if not exists hr_zone_4_time_s  numeric(8,1) null,
  add column if not exists hr_zone_5_time_s  numeric(8,1) null;

-- ============================================================
-- SUPPORTING INDEXES
-- ============================================================

create index if not exists player_external_load_daily_avg_hr_idx
  on public.player_external_load_daily (team_id, date desc, avg_heart_rate);

-- ============================================================
-- ROLLBACK (keep commented; uncomment if migration needs reversal)
-- ============================================================
-- alter table public.player_external_load_daily
--   drop column if exists avg_heart_rate,
--   drop column if exists max_heart_rate,
--   drop column if exists hr_zone_1_time_s,
--   drop column if exists hr_zone_2_time_s,
--   drop column if exists hr_zone_3_time_s,
--   drop column if exists hr_zone_4_time_s,
--   drop column if exists hr_zone_5_time_s;
-- drop index if exists player_external_load_daily_avg_hr_idx;
