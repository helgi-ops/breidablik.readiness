-- Movement-screen: allow multiple viewpoint clips per screen (front / side /
-- back), so a coach can capture every angle a test needs. Each entry is
-- { path, name, view } into the private movement-screen-videos bucket; the
-- existing file_path/file_name keep pointing at the first clip for back-compat.
-- Screening/training only — never the readiness colour.
alter table movement_screens
  add column if not exists videos jsonb not null default '[]'::jsonb;  -- [{ path, name, view }]
