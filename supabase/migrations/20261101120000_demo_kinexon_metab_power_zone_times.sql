-- Demo – Kinexon (de300004): add the metabolic-power ZONE TIMES to raw_payload_json
-- so the metabolic composite's time component (and the catalog panel) have data.
-- A real Kinexon export carries "Metabolic Power (time | high/very high)" as
-- hh:mm:ss; here they're derived from session duration (minutes) — a plausible
-- fraction of each session spent at high / very-high metabolic power. Merged into
-- the existing blob with ||, so the earlier enrichment is preserved.
--
-- Demo seed only; synthetic (the blob already carries demo:true). Descriptive.

update player_external_load_daily
set raw_payload_json = raw_payload_json || jsonb_build_object(
  'Metabolic Power (time | high)',      round(coalesce(session_duration_minutes,0) * 0.12, 1),
  'Metabolic Power (time | very high)', round(coalesce(session_duration_minutes,0) * 0.04, 1)
)
where team_id = 'de300004-0000-4000-8000-000000000004'
  and source = 'kinexon'
  and raw_payload_json is not null;
