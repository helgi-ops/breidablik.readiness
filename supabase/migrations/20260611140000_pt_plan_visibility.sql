-- Per-client toggle: whether the PT client may see their full programme
-- overview (weeks -> sessions -> exercises). Default OFF so coaches who
-- autoregulate can keep the plan hidden until they choose to reveal it.
CREATE TABLE IF NOT EXISTS pt_plan_visibility (
  player_id   uuid PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
  visible     boolean NOT NULL DEFAULT false,
  updated_by  uuid,
  updated_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE pt_plan_visibility ENABLE ROW LEVEL SECURITY;
