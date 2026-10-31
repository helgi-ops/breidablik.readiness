-- Demo – GPS Core (de300003) was seeded with a broken shape: raw GPS distance +
-- accel/decel COUNTS + sprint_distance, but NO total_player_load / velocity_band6
-- / accel_decel_efforts — the inverse of a real Core (Lite) Catapult team. Because
-- the GPS-only Load Summary drives body load + ACWR off total_player_load, Core's
-- board came up EMPTY ("no players"). This rebuilds Core to a valid Core-tier shape
-- (see memory: lite-vs-pro-data-shape): the columns BOTH tiers share, derived from
-- what Core has, with the Pro-only raw columns dropped. IMA/FMP stay empty — that
-- is exactly the Core experience (no Decel/IMA Intelligence drill-downs), i.e.
-- "much less data than pro/full". Idempotent via the `total_player_load is null`
-- guard, so it only reshapes the original broken rows.

update player_external_load_daily
set
  total_player_load       = round(coalesce(total_distance,0)*0.11 + (coalesce(accelerations,0)+coalesce(decelerations,0))*0.8),
  player_load_per_minute  = round((coalesce(total_distance,0)*0.11 + (coalesce(accelerations,0)+coalesce(decelerations,0))*0.8) / 80.0, 1),
  session_duration_minutes = coalesce(session_duration_minutes, 80),
  velocity_band6_total_distance = coalesce(velocity_band6_total_distance, sprint_distance),
  velocity_band5_total_distance = greatest(round(coalesce(high_speed_distance,0) - coalesce(sprint_distance,0)), 0),
  accel_decel_efforts     = (coalesce(accelerations,0) + coalesce(decelerations,0)),
  sprint_distance = null,   -- Pro-only; Core reads sprint from velocity_band6
  accelerations   = null,   -- Pro-only raw counts
  decelerations   = null
where team_id = 'de300003-0000-4000-8000-000000000003'
  and total_distance is not null and total_distance > 0
  and total_player_load is null;

-- "Much less data": a Core/Lite team logs fewer sessions. Thin the OLDER history
-- (keep the last 21 days fully intact so the acute/chronic ACWR window is sound),
-- removing Tue+Thu training sessions older than 21 days.
delete from player_external_load_daily
where team_id = 'de300003-0000-4000-8000-000000000003'
  and date < current_date - 21
  and extract(dow from date) in (2,4);
