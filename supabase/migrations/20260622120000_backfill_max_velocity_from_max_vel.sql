-- Backfill: max_velocity from max_vel for CSV-ingested (Core/Lite) rows.
--
-- The CSV upload path historically wrote top speed only to `max_vel`, while every
-- coach surface (player-game-report, position-comparison, load-verdict, …) reads
-- `max_velocity`. Result: Core/Lengjudeild teams (Þór, Grindavík, Afturelding —
-- CSV ingest) showed 0% top-speed coverage despite capturing it (max_vel = 100%).
-- Both columns are km/h; read-sites clamp >45 km/h GPS glitches.
--
-- The forward fix is in the CSV parser (src/app/api/coach/external-load/upload/route.ts,
-- now writes both columns). This backfills the existing rows. Idempotent: only
-- fills NULL max_velocity from a present max_vel.
-- See docs/core-tier-upside.md (step 1).

update player_external_load_daily
set max_velocity = max_vel
where source = 'catapult'
  and max_velocity is null
  and max_vel is not null;
