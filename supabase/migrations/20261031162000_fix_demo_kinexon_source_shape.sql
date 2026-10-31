-- Demo – Kinexon (de300004) was seeded with source='catapult' and carried
-- Catapult's IMA magnitude breakdown (ima_accel / ima_decel / ima_total) on
-- every row — i.e. it was a mislabelled Catapult seed, not a Kinexon one. A real
-- Kinexon upload (src/lib/integrations/kinexon/toExternalLoad.ts) writes
-- source='kinexon' and its CoD signature (cod_events + ima_cod) but NEVER the
-- Catapult ima_accel/ima_decel/ima_total columns. This relabels the demo to the
-- authentic Kinexon shape so the "Demo – Kinexon" team actually demonstrates the
-- Kinexon experience (CoD / distance / load / metabolic / jumps, no Catapult IMA
-- breakdown). 'kinexon' is a first-class source — in every load-verdict read
-- (vendor-neutral) and every source IN-list ["catapult","manual","titan",
-- "kinexon"] — so the rows stay visible on every surface after the relabel.
--
-- Descriptive external-load only; no readiness colour is touched.
-- Idempotent via the source='catapult' guard. See memory: kinexon-ingestion.

update player_external_load_daily
set
  source     = 'kinexon',
  ima_accel  = null,   -- Catapult IMA magnitude — Kinexon does not emit it
  ima_decel  = null,
  ima_total  = null,
  raw_payload_json = jsonb_build_object('provider', 'kinexon', 'indoor', true, 'demo', true)
where team_id = 'de300004-0000-4000-8000-000000000004'
  and source = 'catapult';
