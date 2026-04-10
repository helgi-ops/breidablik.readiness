-- =========================================================================
-- Data ownership layer: consents, audit log, minor protection
--
-- This migration formalizes the player-owned data model:
--   1. Adds date_of_birth to players (nullable; NULL treated as minor by default).
--   2. Creates player_consents: explicit consent records with scope/category,
--      supporting self-consent and parental/guardian consent for minors.
--   3. Creates player_access_audit: append-only log of all access-control
--      changes (memberships, grants, consents). Required for GDPR Art. 30.
--   4. Adds is_minor(player_id) and player_has_active_consent() helpers.
--   5. Adds trigger that blocks activating a 'national_team' membership for
--      a minor unless a matching parental consent exists.
--   6. Adds audit triggers on player_team_memberships, player_data_grants,
--      and player_consents themselves.
--
-- The layer is additive: existing data continues to work because the minor
-- gate only fires on NEW membership inserts/updates that set status='active'
-- with role='national_team'.
-- =========================================================================

BEGIN;

-- -------------------------------------------------------------------------
-- 1. date_of_birth on players
-- -------------------------------------------------------------------------
ALTER TABLE public.players
  ADD COLUMN IF NOT EXISTS date_of_birth date NULL;

COMMENT ON COLUMN public.players.date_of_birth IS
  'Optional DOB. NULL is treated as minor for consent-gate purposes (fail-safe).';

-- -------------------------------------------------------------------------
-- 2. player_consents table
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.player_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,

  -- What is being consented to
  consent_type text NOT NULL CHECK (consent_type IN (
    'data_processing',        -- general: club may process my training data
    'national_team_sharing',  -- OK to share load with national team coaches
    'cross_team_write',       -- other teams may write load data into my record
    'analytics_aggregation',  -- anonymized aggregation for research/benchmarks
    'third_party_export'      -- export to 3rd party (KSI, physio, etc.)
  )),

  -- Optional scoping by data category; NULL = all categories
  data_categories text[] NULL,
  -- Optional scoping by team; NULL = applies everywhere
  scoped_team_id uuid NULL REFERENCES public.teams(id) ON DELETE CASCADE,

  -- Who gave the consent and in what capacity
  granted_by_profile_id uuid NULL, -- profile row id (self, parent, guardian, coach-as-proxy)
  granted_by_relationship text NOT NULL CHECK (granted_by_relationship IN (
    'self', 'parent', 'guardian', 'club_proxy'
  )),
  granted_by_full_name text NULL, -- free text fallback for paper/offline consents
  granted_at timestamptz NOT NULL DEFAULT now(),

  -- Lifecycle
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_to timestamptz NULL,
  revoked_at timestamptz NULL,
  revoked_by_profile_id uuid NULL,
  revoke_reason text NULL,

  -- Provenance / notes
  source text NULL, -- 'web_form', 'paper', 'imported', 'api'
  notes text NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT player_consents_valid_range
    CHECK (valid_to IS NULL OR valid_to >= valid_from)
);

CREATE INDEX IF NOT EXISTS idx_player_consents_player
  ON public.player_consents(player_id);
CREATE INDEX IF NOT EXISTS idx_player_consents_type
  ON public.player_consents(consent_type)
  WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_player_consents_active
  ON public.player_consents(player_id, consent_type)
  WHERE revoked_at IS NULL;

COMMENT ON TABLE public.player_consents IS
  'Explicit consent records. A consent is active when revoked_at IS NULL and now() is within [valid_from, valid_to].';

-- -------------------------------------------------------------------------
-- 3. player_access_audit table (append-only)
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.player_access_audit (
  id bigserial PRIMARY KEY,
  occurred_at timestamptz NOT NULL DEFAULT now(),

  actor_user_id uuid NULL,   -- auth.uid() at time of change
  actor_role text NULL,      -- best-effort: 'player', 'coach', 'admin', 'system'

  action text NOT NULL CHECK (action IN ('insert','update','delete','revoke','activate','deactivate')),
  entity_type text NOT NULL CHECK (entity_type IN ('membership','grant','consent')),
  entity_id uuid NOT NULL,

  player_id uuid NOT NULL, -- denormalized for fast "who touched my data" queries
  team_id uuid NULL,       -- denormalized when relevant

  before_data jsonb NULL,
  after_data jsonb NULL,

  reason text NULL
);

CREATE INDEX IF NOT EXISTS idx_player_access_audit_player
  ON public.player_access_audit(player_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_player_access_audit_entity
  ON public.player_access_audit(entity_type, entity_id);

COMMENT ON TABLE public.player_access_audit IS
  'Append-only audit log of access-control changes. Required for GDPR Art. 30 and "who accessed my data" requests. Never updated or deleted in application code.';

-- -------------------------------------------------------------------------
-- 4. Helper functions
-- -------------------------------------------------------------------------

-- is_minor: NULL DOB or unknown player → treated as minor (fail-safe)
CREATE OR REPLACE FUNCTION public.is_minor(p_player_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT COALESCE(
    (SELECT CASE
      WHEN p.date_of_birth IS NULL THEN true
      WHEN (CURRENT_DATE - p.date_of_birth) < (18 * 365) THEN true
      ELSE false
    END
    FROM public.players p
    WHERE p.id = p_player_id),
    true
  );
$fn$;

COMMENT ON FUNCTION public.is_minor(uuid) IS
  'Returns true if player is under 18 or DOB is unknown. Fail-safe: unknown DOB is treated as minor.';

-- Does player have an active consent of a given type?
CREATE OR REPLACE FUNCTION public.player_has_active_consent(
  p_player_id uuid,
  p_consent_type text,
  p_scoped_team_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT EXISTS (
    SELECT 1
    FROM public.player_consents c
    WHERE c.player_id = p_player_id
      AND c.consent_type = p_consent_type
      AND c.revoked_at IS NULL
      AND c.valid_from <= now()
      AND (c.valid_to IS NULL OR c.valid_to >= now())
      AND (
        c.scoped_team_id IS NULL
        OR p_scoped_team_id IS NULL
        OR c.scoped_team_id = p_scoped_team_id
      )
  );
$fn$;

COMMENT ON FUNCTION public.player_has_active_consent(uuid, text, uuid) IS
  'Returns true if an active (non-revoked, in-window) consent of the given type exists. Team scope is optional.';

-- -------------------------------------------------------------------------
-- 5. Minor-protection trigger on player_team_memberships
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_minor_national_team_consent()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  -- Only gate on active national_team memberships
  IF NEW.role = 'national_team' AND NEW.status = 'active' THEN
    IF public.is_minor(NEW.player_id) THEN
      IF NOT public.player_has_active_consent(
        NEW.player_id,
        'national_team_sharing',
        NEW.team_id
      ) THEN
        RAISE EXCEPTION
          'Cannot activate national_team membership for minor player % without active parental consent (consent_type=national_team_sharing).',
          NEW.player_id
        USING ERRCODE = 'check_violation';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_enforce_minor_nt_consent
  ON public.player_team_memberships;

CREATE TRIGGER trg_enforce_minor_nt_consent
  BEFORE INSERT OR UPDATE OF role, status ON public.player_team_memberships
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_minor_national_team_consent();

-- -------------------------------------------------------------------------
-- 6. Audit triggers
-- -------------------------------------------------------------------------
-- Audit writer. Uses to_jsonb + ->> lookups instead of NEW.<col> because
-- plpgsql parses every CASE branch regardless of which one runs, so
-- NEW.team_id would fail to parse when the trigger is attached to
-- player_consents (which has no team_id column).
CREATE OR REPLACE FUNCTION public.write_access_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_entity_type text;
  v_player_id uuid;
  v_team_id uuid;
  v_action text;
  v_entity_id uuid;
  v_before jsonb;
  v_after jsonb;
BEGIN
  IF TG_TABLE_NAME = 'player_team_memberships' THEN
    v_entity_type := 'membership';
  ELSIF TG_TABLE_NAME = 'player_data_grants' THEN
    v_entity_type := 'grant';
  ELSIF TG_TABLE_NAME = 'player_consents' THEN
    v_entity_type := 'consent';
  ELSE
    v_entity_type := TG_TABLE_NAME;
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_action := 'insert';
    v_before := NULL;
    v_after := to_jsonb(NEW);
    v_entity_id := (v_after->>'id')::uuid;
    v_player_id := (v_after->>'player_id')::uuid;
    IF TG_TABLE_NAME = 'player_team_memberships' THEN
      v_team_id := (v_after->>'team_id')::uuid;
    ELSIF TG_TABLE_NAME = 'player_data_grants' THEN
      v_team_id := (v_after->>'granted_to_team_id')::uuid;
    ELSIF TG_TABLE_NAME = 'player_consents' THEN
      v_team_id := NULLIF(v_after->>'scoped_team_id','')::uuid;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    v_before := to_jsonb(OLD);
    v_after := to_jsonb(NEW);
    -- Detect revoke specifically (revoked_at transition NULL -> not null)
    IF TG_TABLE_NAME = 'player_consents'
       AND v_before->>'revoked_at' IS NULL
       AND v_after->>'revoked_at' IS NOT NULL THEN
      v_action := 'revoke';
    ELSE
      v_action := 'update';
    END IF;
    v_entity_id := (v_after->>'id')::uuid;
    v_player_id := (v_after->>'player_id')::uuid;
    IF TG_TABLE_NAME = 'player_team_memberships' THEN
      v_team_id := (v_after->>'team_id')::uuid;
    ELSIF TG_TABLE_NAME = 'player_data_grants' THEN
      v_team_id := (v_after->>'granted_to_team_id')::uuid;
    ELSIF TG_TABLE_NAME = 'player_consents' THEN
      v_team_id := NULLIF(v_after->>'scoped_team_id','')::uuid;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'delete';
    v_before := to_jsonb(OLD);
    v_after := NULL;
    v_entity_id := (v_before->>'id')::uuid;
    v_player_id := (v_before->>'player_id')::uuid;
    IF TG_TABLE_NAME = 'player_team_memberships' THEN
      v_team_id := (v_before->>'team_id')::uuid;
    ELSIF TG_TABLE_NAME = 'player_data_grants' THEN
      v_team_id := (v_before->>'granted_to_team_id')::uuid;
    ELSIF TG_TABLE_NAME = 'player_consents' THEN
      v_team_id := NULLIF(v_before->>'scoped_team_id','')::uuid;
    END IF;
  END IF;

  INSERT INTO public.player_access_audit(
    actor_user_id, action, entity_type, entity_id, player_id, team_id, before_data, after_data
  ) VALUES (
    auth.uid(), v_action, v_entity_type, v_entity_id, v_player_id, v_team_id, v_before, v_after
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_audit_memberships ON public.player_team_memberships;
CREATE TRIGGER trg_audit_memberships
  AFTER INSERT OR UPDATE OR DELETE ON public.player_team_memberships
  FOR EACH ROW EXECUTE FUNCTION public.write_access_audit();

DROP TRIGGER IF EXISTS trg_audit_grants ON public.player_data_grants;
CREATE TRIGGER trg_audit_grants
  AFTER INSERT OR UPDATE OR DELETE ON public.player_data_grants
  FOR EACH ROW EXECUTE FUNCTION public.write_access_audit();

DROP TRIGGER IF EXISTS trg_audit_consents ON public.player_consents;
CREATE TRIGGER trg_audit_consents
  AFTER INSERT OR UPDATE OR DELETE ON public.player_consents
  FOR EACH ROW EXECUTE FUNCTION public.write_access_audit();

-- -------------------------------------------------------------------------
-- 7. RLS
-- -------------------------------------------------------------------------
ALTER TABLE public.player_consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_access_audit ENABLE ROW LEVEL SECURITY;

-- player_consents: player sees own, admins see all, coaches in the player's
-- accessible teams may SELECT to know whether consent is present
DROP POLICY IF EXISTS consents_player_select ON public.player_consents;
CREATE POLICY consents_player_select
  ON public.player_consents
  FOR SELECT
  TO authenticated
  USING (
    player_id = public.my_player_id()
    OR public.is_admin()
    OR public.player_accessible_to_current_coach(player_id)
  );

-- Player (or admin) may insert consents for themselves; coaches may insert
-- as club_proxy for players in their teams (recorded with relationship)
DROP POLICY IF EXISTS consents_insert ON public.player_consents;
CREATE POLICY consents_insert
  ON public.player_consents
  FOR INSERT
  TO authenticated
  WITH CHECK (
    player_id = public.my_player_id()
    OR public.is_admin()
    OR public.player_accessible_to_current_coach(player_id)
  );

-- Only the player themselves or admin can revoke/update
DROP POLICY IF EXISTS consents_update ON public.player_consents;
CREATE POLICY consents_update
  ON public.player_consents
  FOR UPDATE
  TO authenticated
  USING (
    player_id = public.my_player_id() OR public.is_admin()
  )
  WITH CHECK (
    player_id = public.my_player_id() OR public.is_admin()
  );

-- No DELETE policy → deletes blocked under RLS (consents are revoked, not deleted)

-- player_access_audit: players see their own rows, admins see all
DROP POLICY IF EXISTS audit_select ON public.player_access_audit;
CREATE POLICY audit_select
  ON public.player_access_audit
  FOR SELECT
  TO authenticated
  USING (
    player_id = public.my_player_id() OR public.is_admin()
  );

-- No INSERT/UPDATE/DELETE policies → only SECURITY DEFINER trigger can write

-- -------------------------------------------------------------------------
-- 8. updated_at trigger on player_consents
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.touch_player_consents_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_touch_player_consents ON public.player_consents;
CREATE TRIGGER trg_touch_player_consents
  BEFORE UPDATE ON public.player_consents
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_player_consents_updated_at();

COMMIT;
