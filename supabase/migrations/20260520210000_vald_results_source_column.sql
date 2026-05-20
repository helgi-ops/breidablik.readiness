-- ============================================================================
-- VALD results: source column for CSV upload provenance
-- ============================================================================
-- CSV-uploaded VALD rows need to be distinguishable from API-synced rows.
-- The VALD external API sync covers ForceDecks; NordBord and ForceFrame are
-- uploaded via CSV because VALD's external API doesn't expose those products
-- for this tenant (different subdomains / permissions). 'source' lets the
-- dashboard show provenance and lets a future API sync coexist with CSV rows
-- without ambiguity.
-- ============================================================================

ALTER TABLE vald_nordbord_results
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'api';

ALTER TABLE vald_forceframe_results
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'api';

COMMENT ON COLUMN vald_nordbord_results.source IS
  'Origin of the row: api (VALD external API sync) or csv (manual VALD Hub CSV upload).';
COMMENT ON COLUMN vald_forceframe_results.source IS
  'Origin of the row: api (VALD external API sync) or csv (manual VALD Hub CSV upload).';
