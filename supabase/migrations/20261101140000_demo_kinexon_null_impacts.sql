-- Demo – Kinexon (de300004): null `impacts`. Impacts (foot-strike/collision
-- counts) are a Titan/Catapult IMU metric — a real Kinexon Perform export has no
-- Impacts column — but the demo carried it from its basketball-seed origin, so the
-- Indoor Load board showed an IMPACTS tile for a Kinexon team. The board already
-- hides the Impacts component when it is null (BasketballIndoorLoadView), so
-- nulling it here makes the board provider-correct with no code change. Kinexon's
-- CoD / Exertions carry its agility signal instead.
--
-- Demo seed only; descriptive. Consistent with the earlier Catapult-IMA nulling.

update player_external_load_daily
set impacts = null
where team_id = 'de300004-0000-4000-8000-000000000004'
  and source = 'kinexon'
  and impacts is not null;
