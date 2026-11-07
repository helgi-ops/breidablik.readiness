-- Previous-club rows (raw_payload_json->>'previous_club' = 'true') are few (29 of ~13k), but the
-- `EXCLUDE_PREV_CLUB_OR` filter has to detoast every row's raw_payload_json (~11 KB after the Nov 2026
-- re-sync) to evaluate it: 4.5 s vs 46 ms for 200 days of one squad. This partial index lets a loader
-- fetch just the previous-club keys (player_id, date) cheaply and drop them in code instead.
create index if not exists idx_pled_previous_club_keys
  on public.player_external_load_daily (player_id, date)
  where (raw_payload_json ->> 'previous_club') = 'true';
