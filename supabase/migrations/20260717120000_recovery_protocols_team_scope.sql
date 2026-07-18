-- Team-scope a recovery protocol. The library is global by default (every team
-- sees the shared protocols), but some are club-specific — the Hamstring Ramping
-- Isometrics protocol is configured for Breiðablik only, mirroring the
-- coach reference page's gate. NULL = global; a team_id = that team only.
-- Filtered in the list route (/api/recovery-protocols) and enforced on assign
-- (/api/coach/player/[id]/assign-recovery) so a coach can never assign another
-- club's scoped protocol. Additive + nullable — existing rows stay global.

ALTER TABLE public.recovery_protocols
  ADD COLUMN IF NOT EXISTS team_id uuid REFERENCES public.teams(id) ON DELETE CASCADE;

COMMENT ON COLUMN public.recovery_protocols.team_id IS
  'NULL = global protocol (all teams). A team_id scopes the protocol to that team only — enforced in the list + assign routes.';

CREATE INDEX IF NOT EXISTS idx_recovery_protocols_team ON public.recovery_protocols(team_id);

-- New category for injury-rehab protocols (the ramping hamstring is the first).
ALTER TABLE public.recovery_protocols DROP CONSTRAINT IF EXISTS recovery_protocols_category_check;
ALTER TABLE public.recovery_protocols ADD CONSTRAINT recovery_protocols_category_check
  CHECK (category = ANY (ARRAY['post_match','md_plus_1','pre_match','travel','general','rehab']));
