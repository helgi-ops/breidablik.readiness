-- 3-min all-out test (3MT) support on player_running_test.
-- The finishing speed (mean of the last 30 s) = critical speed; distance above it over the test
-- = D' (Pettitt/Jamnick/Clark 2012). Storing it lets ONE test yield both CS and D'.
alter table public.player_running_test
  add column if not exists end_speed_kmh numeric,   -- finishing speed (last ~30 s), km/h
  add column if not exists protocol text;           -- e.g. '3min_all_out' | '4min_max'
