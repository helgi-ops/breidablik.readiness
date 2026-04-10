-- =========================================================================
-- Backfill club_proxy consents for pre-existing national_team memberships
--
-- Context: migration 20260410090000 added a BEFORE trigger on
-- player_team_memberships that blocks activating a 'national_team' role
-- for a minor without an active 'national_team_sharing' consent. Any rows
-- that were ALREADY active before that trigger existed would now fail
-- the next UPDATE that touches role or status.
--
-- This migration inserts a retroactive club_proxy consent for every
-- currently-active national_team membership that does not yet have one.
-- It is idempotent: re-running it is a no-op because of the NOT EXISTS
-- guard.
--
-- IMPORTANT: 'club_proxy' is a stop-gap. It documents that the consent
-- was recorded administratively at migration time, not by the player or
-- a parent/guardian. Formal parental consent should still be collected
-- through the UI and added as a new player_consents row (with
-- relationship='parent' or 'guardian') — the UI should treat any
-- active national_team membership whose *only* consent is club_proxy
-- as "pending formal consent" and surface it in an admin queue.
-- =========================================================================

BEGIN;

INSERT INTO public.player_consents (
  player_id,
  consent_type,
  scoped_team_id,
  granted_by_relationship,
  granted_by_full_name,
  source,
  notes
)
SELECT
  m.player_id,
  'national_team_sharing',
  m.team_id,
  'club_proxy',
  'System backfill (pre-existing membership)',
  'pre_existing_migration',
  'Retroactive club_proxy consent generated during migration '
    || '20260410100000 to unblock existing active national_team '
    || 'memberships. Formal parental/guardian consent still required; '
    || 'surface this in admin queue until replaced by a relationship '
    || 'in (parent, guardian, self).'
FROM public.player_team_memberships m
WHERE m.role = 'national_team'
  AND m.status = 'active'
  AND NOT EXISTS (
    SELECT 1
    FROM public.player_consents c
    WHERE c.player_id = m.player_id
      AND c.consent_type = 'national_team_sharing'
      AND (c.scoped_team_id IS NULL OR c.scoped_team_id = m.team_id)
      AND c.revoked_at IS NULL
      AND c.valid_from <= now()
      AND (c.valid_to IS NULL OR c.valid_to >= now())
  );

COMMIT;
