-- Uploaded PT performance reports (VALD ForceDecks/NordBord/ForceFrame etc.).
-- A private storage bucket holds the file; this table is the metadata + (later)
-- the confirmed extracted metrics. Both trainer and client can upload.
INSERT INTO storage.buckets (id, name, public)
VALUES ('pt-reports', 'pt-reports', false)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS pt_client_reports (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id       uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  team_id         uuid,
  uploaded_by     uuid,
  title           text,
  source          text,            -- 'vald' | 'other'
  report_date     date,
  file_name       text NOT NULL,
  file_path       text NOT NULL,
  file_size       bigint,
  mime_type       text,
  extracted       jsonb,           -- confirmed extracted metrics (phase 2)
  extracted_status text NOT NULL DEFAULT 'none',  -- none | pending | confirmed
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pt_reports_player ON pt_client_reports (player_id, created_at DESC);
ALTER TABLE pt_client_reports ENABLE ROW LEVEL SECURITY;
