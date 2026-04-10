-- =========================================================================
-- Admin compliance flags
--
-- Org-wide GDPR / data ownership compliance view for admin dashboard.
-- Returns one row per player with boolean flags that admins can act on:
--
--   missing_dob                  -> DOB not set (fail-safe treated as minor)
--   is_minor                     -> under 18 or unknown
--   missing_data_processing      -> no active data_processing consent
--   minor_nt_without_consent     -> active national_team membership on a
--                                   minor without parental national_team_sharing
--   expired_grants               -> has grants that ended in the past
--   grants_expiring_soon         -> has grants ending within 14 days
--   consent_revoked_30d          -> at least one consent revoked in last 30d
--
-- Plus summary metadata (team name, active memberships count, severity).
--
-- Severity:
--   critical -> minor_nt_without_consent OR missing_data_processing
--   warning  -> missing_dob OR expired_grants OR consent_revoked_30d
--   info     -> grants_expiring_soon only
--   ok       -> no flags
--
-- Implemented as a SECURITY DEFINER function so the admin UI can call it
-- in a single round-trip. RLS is enforced by the caller check inside the
-- function (only users with role='admin' in profiles may execute).
-- =========================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.admin_compliance_flags()
RETURNS TABLE (
  player_id                 uuid,
  full_name                 text,
  team_id                   uuid,
  team_name                 text,
  date_of_birth             date,
  is_minor                  boolean,
  missing_dob               boolean,
  missing_data_processing   boolean,
  minor_nt_without_consent  boolean,
  expired_grants            boolean,
  grants_expiring_soon      boolean,
  consent_revoked_30d       boolean,
  active_memberships        integer,
  severity                  text,
  flag_count                integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin boolean;
BEGIN
  -- Caller must be admin
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND is_admin = true
  ) INTO v_is_admin;

  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'admin_compliance_flags: caller is not an admin';
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT
      p.id                AS player_id,
      p.full_name,
      p.team_id,
      t.name              AS team_name,
      p.date_of_birth,
      public.is_minor(p.id) AS is_minor
    FROM public.players p
    LEFT JOIN public.teams t ON t.id = p.team_id
    WHERE p.is_active = true
  ),
  dp AS (
    SELECT c.player_id, true AS has_dp
    FROM public.player_consents c
    WHERE c.consent_type = 'data_processing'
      AND c.revoked_at IS NULL
      AND (c.valid_to IS NULL OR c.valid_to > now())
    GROUP BY c.player_id
  ),
  nt_members AS (
    SELECT m.player_id
    FROM public.player_team_memberships m
    WHERE m.role = 'national_team'
      AND m.status = 'active'
    GROUP BY m.player_id
  ),
  nt_consents AS (
    SELECT c.player_id
    FROM public.player_consents c
    WHERE c.consent_type = 'national_team_sharing'
      AND c.granted_by_relationship IN ('parent','guardian')
      AND c.revoked_at IS NULL
      AND (c.valid_to IS NULL OR c.valid_to > now())
    GROUP BY c.player_id
  ),
  grants_exp AS (
    SELECT
      g.player_id,
      bool_or(g.valid_to IS NOT NULL AND g.valid_to < now()
              AND g.revoked_at IS NULL) AS has_expired,
      bool_or(g.valid_to IS NOT NULL
              AND g.valid_to >= now()
              AND g.valid_to < now() + interval '14 days'
              AND g.revoked_at IS NULL) AS has_expiring_soon
    FROM public.player_data_grants g
    GROUP BY g.player_id
  ),
  revoked_recent AS (
    SELECT c.player_id
    FROM public.player_consents c
    WHERE c.revoked_at IS NOT NULL
      AND c.revoked_at > now() - interval '30 days'
    GROUP BY c.player_id
  ),
  active_mem AS (
    SELECT m.player_id, count(*)::int AS n
    FROM public.player_team_memberships m
    WHERE m.status = 'active'
    GROUP BY m.player_id
  )
  SELECT
    b.player_id,
    b.full_name,
    b.team_id,
    b.team_name,
    b.date_of_birth,
    b.is_minor,
    (b.date_of_birth IS NULL)                                     AS missing_dob,
    (dp.has_dp IS NOT TRUE)                                       AS missing_data_processing,
    (b.is_minor
      AND nt.player_id IS NOT NULL
      AND nc.player_id IS NULL)                                   AS minor_nt_without_consent,
    COALESCE(ge.has_expired, false)                               AS expired_grants,
    COALESCE(ge.has_expiring_soon, false)                         AS grants_expiring_soon,
    (rr.player_id IS NOT NULL)                                    AS consent_revoked_30d,
    COALESCE(am.n, 0)                                             AS active_memberships,
    CASE
      WHEN (b.is_minor AND nt.player_id IS NOT NULL AND nc.player_id IS NULL)
        OR (dp.has_dp IS NOT TRUE) THEN 'critical'
      WHEN (b.date_of_birth IS NULL)
        OR COALESCE(ge.has_expired, false)
        OR (rr.player_id IS NOT NULL) THEN 'warning'
      WHEN COALESCE(ge.has_expiring_soon, false) THEN 'info'
      ELSE 'ok'
    END AS severity,
    (
      (CASE WHEN b.date_of_birth IS NULL THEN 1 ELSE 0 END) +
      (CASE WHEN dp.has_dp IS NOT TRUE THEN 1 ELSE 0 END) +
      (CASE WHEN (b.is_minor AND nt.player_id IS NOT NULL AND nc.player_id IS NULL) THEN 1 ELSE 0 END) +
      (CASE WHEN COALESCE(ge.has_expired, false) THEN 1 ELSE 0 END) +
      (CASE WHEN COALESCE(ge.has_expiring_soon, false) THEN 1 ELSE 0 END) +
      (CASE WHEN rr.player_id IS NOT NULL THEN 1 ELSE 0 END)
    )::int AS flag_count
  FROM base b
  LEFT JOIN dp               ON dp.player_id = b.player_id
  LEFT JOIN nt_members nt    ON nt.player_id = b.player_id
  LEFT JOIN nt_consents nc   ON nc.player_id = b.player_id
  LEFT JOIN grants_exp ge    ON ge.player_id = b.player_id
  LEFT JOIN revoked_recent rr ON rr.player_id = b.player_id
  LEFT JOIN active_mem am    ON am.player_id = b.player_id
  ORDER BY
    CASE
      WHEN (b.is_minor AND nt.player_id IS NOT NULL AND nc.player_id IS NULL)
        OR (dp.has_dp IS NOT TRUE) THEN 0
      WHEN (b.date_of_birth IS NULL)
        OR COALESCE(ge.has_expired, false)
        OR (rr.player_id IS NOT NULL) THEN 1
      WHEN COALESCE(ge.has_expiring_soon, false) THEN 2
      ELSE 3
    END,
    b.full_name;
END;
$$;

COMMENT ON FUNCTION public.admin_compliance_flags() IS
  'Org-wide compliance flags for admin dashboard. Admin-only. One row per active player.';

-- Allow authenticated admins to call it (RLS-style check is inside the function)
GRANT EXECUTE ON FUNCTION public.admin_compliance_flags() TO authenticated;

COMMIT;
