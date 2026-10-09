-- Add an "archive / hide" state to drill_library, distinct from the soft-delete (deleted_at).
--
-- A coach may want to set a drill aside (not currently using it) without deleting it — keep it a
-- while before deciding. Archived drills are hidden from the normal library + session builder but
-- remain fully recoverable (unarchive) and are not deleted. deleted_at stays the terminal state.
ALTER TABLE public.drill_library ADD COLUMN IF NOT EXISTS archived_at timestamptz;

COMMENT ON COLUMN public.drill_library.archived_at IS
  'When set, the drill is archived (hidden from the library + session builder) but not deleted — reversible. Distinct from deleted_at (soft delete).';
