-- Per-drill ACTUAL load (from Catapult OpenField periods) is stored inline in
-- saved_sessions.items[].actual (jsonb, no column change). This column records
-- when those actuals were last populated, for the "planned vs actual" UI.
alter table public.saved_sessions
  add column if not exists actuals_synced_at timestamptz;
