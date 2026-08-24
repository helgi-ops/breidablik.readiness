-- Newly-added OpenField Reporting_Parameters (coach added 24 Aug 2026) that need
-- explicit columns beyond raw_payload_json. Descriptive load context only -- none
-- of these touch the readiness colour or the daily decision. All nullable: they
-- populate only after a re-export/re-sync, and only when the export carries them.

-- C) Repeated High-Intensity Efforts (RHIE) + D) mechanical / asymmetry, per session.
alter table public.player_external_load_daily
  add column if not exists rhie_bouts numeric,
  add column if not exists rhie_efforts_per_bout_max numeric,
  add column if not exists rhie_efforts_per_bout_mean numeric,
  add column if not exists rhie_efforts_per_bout_min numeric,
  add column if not exists rhie_effort_duration_mean_s numeric,
  add column if not exists rhie_effort_recovery_mean_s numeric,
  add column if not exists rhie_bout_recovery_mean_s numeric,
  add column if not exists running_symmetry numeric,
  add column if not exists running_deviation numeric,
  add column if not exists running_imbalance numeric,
  add column if not exists running_series_count numeric,
  add column if not exists footstrikes numeric;

-- A) Peak-window clock position + B) per-window HSR, on the peak-window rows.
-- window_start already exists (text session-clock). Add the matching end, the
-- kickoff-aligned start (seconds from kickoff, for match/event alignment), the
-- per-activity kickoff offset used to compute it, and per-window RHIE bouts when
-- the export gives RHIE per interval. hsr_m / vb5_m / vb6_m already exist.
alter table public.player_peak_window
  add column if not exists window_end text,
  add column if not exists window_start_s_from_ko numeric,
  add column if not exists kickoff_offset_s numeric,
  add column if not exists rhie_bouts numeric;

comment on column public.player_external_load_daily.rhie_bouts is
  'Repeated High-Intensity Efforts: total bouts in the session (OpenField RHIE Total Bouts). Descriptive.';
comment on column public.player_peak_window.window_start_s_from_ko is
  'Peak-window start in seconds from kickoff (window_start_s - kickoff_offset_s), for match/event alignment. Null until kickoff_offset_s is known.';
