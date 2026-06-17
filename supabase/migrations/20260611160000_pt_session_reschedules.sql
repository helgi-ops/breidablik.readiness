-- A client (or coach) can MOVE a single prescribed session to another day when
-- life gets in the way. One row = "the session naturally falling on from_date
-- is relocated to to_date" for this player's active plan. The rest of the plan
-- is unchanged. The client /today resolver consults this so the session shows
-- on its new day and the original day isn't counted as missed.
CREATE TABLE IF NOT EXISTS pt_session_reschedules (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id   uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  plan_id     uuid NOT NULL,
  session_id  uuid NOT NULL,            -- the prescribed session being moved
  from_date   date NOT NULL,            -- its natural calendar date
  to_date     date NOT NULL,            -- where it now appears
  moved_by    uuid,                     -- client user id or coach user id
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (player_id, from_date)         -- one move per natural session-date
);
CREATE INDEX IF NOT EXISTS idx_resched_player_to ON pt_session_reschedules (player_id, to_date);
CREATE INDEX IF NOT EXISTS idx_resched_player_from ON pt_session_reschedules (player_id, from_date);
ALTER TABLE pt_session_reschedules ENABLE ROW LEVEL SECURITY;
