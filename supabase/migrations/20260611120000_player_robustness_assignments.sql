-- Individualised robustness-drill assignments: a coach assigns catalog drills
-- (keyed to a player's own load demands / asymmetry) to a player, who then sees
-- them in the player app. Distinct from Unfamiliar Load (monitoring only).
CREATE TABLE IF NOT EXISTS player_robustness_assignments (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id      uuid NOT NULL,
  player_id    uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  drill_id     text NOT NULL,             -- references the code catalog (robustness/catalog.ts)
  quality      text,                      -- load quality this targets, or 'asymmetry'
  reason       text,                      -- plain-language "why this for you" (audit)
  assigned_by  uuid,                      -- coach auth user id
  active       boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (player_id, drill_id)
);

CREATE INDEX IF NOT EXISTS idx_robustness_player_active
  ON player_robustness_assignments (player_id, active);
CREATE INDEX IF NOT EXISTS idx_robustness_team
  ON player_robustness_assignments (team_id);

ALTER TABLE player_robustness_assignments ENABLE ROW LEVEL SECURITY;
