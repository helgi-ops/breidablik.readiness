-- Per-player coach signals. The original unique (team_id, engine, as_of)
-- allowed only ONE row per engine per day, which blocks per-player signals
-- (many rows for the same engine, one per player). Replace it with two partial
-- unique indexes: one team-level row per engine/day (player_id null), and one
-- row per player/engine/day (player_id set). Delete+insert is used to refresh
-- the day's cache, so these are integrity guards, not upsert targets.
alter table public.coach_signals drop constraint if exists coach_signals_team_id_engine_as_of_key;

create unique index if not exists coach_signals_team_engine_asof_uidx
  on public.coach_signals (team_id, engine, as_of) where player_id is null;

create unique index if not exists coach_signals_team_engine_player_asof_uidx
  on public.coach_signals (team_id, engine, player_id, as_of) where player_id is not null;
