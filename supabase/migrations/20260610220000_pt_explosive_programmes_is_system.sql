-- Mark the seeded shared library as "system" so a trainer can never privatise
-- it. Only is_system=false (trainer-authored) programmes can have their owner
-- toggled between private (owner = trainer) and shared (owner = null).
ALTER TABLE pt_explosive_programmes
  ADD COLUMN IF NOT EXISTS is_system boolean NOT NULL DEFAULT false;

-- At this point the only owner-null programmes are the original seeded library.
UPDATE pt_explosive_programmes SET is_system = true WHERE owner_user_id IS NULL;
