-- Garmin-only daily context (via Terra): average stress (0–100) and Body Battery (0–100).
-- Nullable, additive — providers that don't send these (e.g. Whoop) leave them null.
-- Context only; surfaced in the "Wearable recovery" Signal Pack detail, never the readiness colour.
alter table public.wearable_daily_data
  add column if not exists stress_avg numeric,
  add column if not exists body_battery numeric;
