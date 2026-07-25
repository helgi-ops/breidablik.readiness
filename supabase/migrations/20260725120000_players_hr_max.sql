-- Per-athlete configured maximum heart rate, for calibrated %HRmax on the
-- Heart Rate Intelligence page (/coach/heart-rate-intelligence). Nullable —
-- NULL means "not set": the app then falls back to Catapult/OpenField's own
-- pct_max_heart_rate when present, else shows no %HRmax (never fabricated).
alter table public.players add column if not exists hr_max numeric;

comment on column public.players.hr_max is 'Configured maximum heart rate (bpm) per athlete, for calibrated %HRmax on the Heart Rate Intelligence page. Nullable; NULL = not set (the app then falls back to Catapult/OpenField pct_max_heart_rate when present, else shows no %HRmax).';
