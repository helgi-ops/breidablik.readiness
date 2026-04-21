-- Reusable invite links for teams.
-- Coaches generate a link; players (or other coaches) open it to sign up
-- with the team pre-selected and locked.

CREATE TABLE IF NOT EXISTS team_invite_links (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id     uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  token       text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
  target_role text NOT NULL DEFAULT 'PLAYER' CHECK (target_role IN ('PLAYER', 'COACH')),
  created_by  uuid REFERENCES auth.users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz DEFAULT (now() + interval '90 days'),
  is_active   boolean NOT NULL DEFAULT true,
  label       text  -- optional human label, e.g. "WhatsApp hópur U19"
);

CREATE INDEX IF NOT EXISTS idx_team_invite_links_token ON team_invite_links(token);
CREATE INDEX IF NOT EXISTS idx_team_invite_links_team  ON team_invite_links(team_id);

COMMENT ON TABLE  team_invite_links IS 'Reusable invite links that coaches share (e.g. in WhatsApp) so players can sign up with the correct team pre-selected.';
COMMENT ON COLUMN team_invite_links.target_role IS 'Which role the invite is for: PLAYER or COACH.';
COMMENT ON COLUMN team_invite_links.label IS 'Optional human-readable label for the link.';
