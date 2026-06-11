-- IMA Jumps total per player-day (Niklas / Catapult Driver-layer signal).
-- Parallel to the existing `impacts` column; populated by the Catapult sync
-- from any reporting parameter whose name mentions "jump".
ALTER TABLE player_external_load_daily
  ADD COLUMN IF NOT EXISTS jumps integer NULL;
