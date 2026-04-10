-- ============================================================================
-- MULTI-TEAM MEMBERSHIP + DATA OWNERSHIP SCHEMA
-- ----------------------------------------------------------------------------
-- Introduces the ability for a single player to belong to multiple teams
-- simultaneously (e.g. Breidablik + Iceland U17) and for load data to carry
-- the team that actually recorded it (source_team_id), so that coaches of any
-- team the player belongs to can see the full load picture regardless of
-- where the data was generated.
--
-- Ownership model: the PLAYER owns their data. Teams have "access" via an
-- active membership (live) or an explicit grant (historic). When a player
-- leaves a team, the team's live access ends but historic access can be
-- retained via a grant for a configurable retention window.
-- ============================================================================

-- 1) player_team_memberships -------------------------------------------------
CREATE TABLE IF NOT EXISTS public.player_team_memberships (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id    uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  team_id      uuid NOT NULL REFERENCES public.teams(id)   ON DELETE CASCADE,
  role         text NOT NULL CHECK (role IN ('primary_club','national_team','loan','guest')),
  status       text NOT NULL DEFAULT 'active' CHECK (status IN ('active','pending','inactive','ended')),
  valid_from   date NOT NULL DEFAULT CURRENT_DATE,
  valid_to     date NULL,
  created_by   uuid NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT player_team_memberships_valid_range
    CHECK (valid_to IS NULL OR valid_to >= valid_from)
);

CREATE INDEX IF NOT EXISTS idx_ptm_player ON public.player_team_memberships (player_id);
CREATE INDEX IF NOT EXISTS idx_ptm_team   ON public.player_team_memberships (team_id);
CREATE INDEX IF NOT EXISTS idx_ptm_active ON public.player_team_memberships (player_id, team_id) WHERE status = 'active';
CREATE UNIQUE INDEX IF NOT EXISTS uq_ptm_player_team_from
  ON public.player_team_memberships (player_id, team_id, valid_from);

-- 2) player_data_grants ------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.player_data_grants (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id          uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  granted_to_team_id uuid NOT NULL REFERENCES public.teams(id)   ON DELETE CASCADE,
  data_categories    text[] NOT NULL DEFAULT ARRAY['load','rpe','gps','injuries'],
  scope              text NOT NULL DEFAULT 'historic' CHECK (scope IN ('live','historic')),
  valid_from         timestamptz NOT NULL DEFAULT now(),
  valid_to           timestamptz NULL,
  granted_by         uuid NULL,
  revoked_at         timestamptz NULL,
  status             text NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked','expired','pending')),
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pdg_player ON public.player_data_grants (player_id);
CREATE INDEX IF NOT EXISTS idx_pdg_team   ON public.player_data_grants (granted_to_team_id);
CREATE INDEX IF NOT EXISTS idx_pdg_active ON public.player_data_grants (player_id, granted_to_team_id) WHERE status = 'active';

-- 3) source_team_id on load tables ------------------------------------------
ALTER TABLE public.player_session_rpe         ADD COLUMN IF NOT EXISTS source_team_id uuid REFERENCES public.teams(id);
ALTER TABLE public.session_rpe_entries        ADD COLUMN IF NOT EXISTS source_team_id uuid REFERENCES public.teams(id);
ALTER TABLE public.player_external_load_daily ADD COLUMN IF NOT EXISTS source_team_id uuid REFERENCES public.teams(id);
ALTER TABLE public.player_injuries            ADD COLUMN IF NOT EXISTS source_team_id uuid REFERENCES public.teams(id);

UPDATE public.player_session_rpe r
   SET source_team_id = COALESCE(r.team_id, (SELECT p.team_id FROM public.players p WHERE p.id = r.player_id))
 WHERE r.source_team_id IS NULL;
UPDATE public.session_rpe_entries r
   SET source_team_id = COALESCE(r.team_id, (SELECT p.team_id FROM public.players p WHERE p.id = r.player_id))
 WHERE r.source_team_id IS NULL;
UPDATE public.player_external_load_daily r
   SET source_team_id = COALESCE(r.team_id, (SELECT p.team_id FROM public.players p WHERE p.id = r.player_id))
 WHERE r.source_team_id IS NULL;
UPDATE public.player_injuries r
   SET source_team_id = COALESCE(r.team_id, (SELECT p.team_id FROM public.players p WHERE p.id = r.player_id))
 WHERE r.source_team_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_psr_source_team  ON public.player_session_rpe        (source_team_id);
CREATE INDEX IF NOT EXISTS idx_sre_source_team  ON public.session_rpe_entries       (source_team_id);
CREATE INDEX IF NOT EXISTS idx_peld_source_team ON public.player_external_load_daily (source_team_id);
CREATE INDEX IF NOT EXISTS idx_pi_source_team   ON public.player_injuries            (source_team_id);

-- 4) Backfill memberships from current players.team_id ----------------------
INSERT INTO public.player_team_memberships (player_id, team_id, role, status, valid_from)
SELECT p.id, p.team_id, 'primary_club', 'active', COALESCE(p.created_at::date, CURRENT_DATE)
  FROM public.players p
 WHERE p.team_id IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM public.player_team_memberships m
      WHERE m.player_id = p.id AND m.team_id = p.team_id
   );

-- 5) Allow 'national_team' as team_type --------------------------------------
ALTER TABLE public.teams DROP CONSTRAINT IF EXISTS teams_team_type_check;
ALTER TABLE public.teams
  ADD CONSTRAINT teams_team_type_check
  CHECK (team_type = ANY (ARRAY['club_team'::text, 'personal_trainer'::text, 'national_team'::text]));

COMMENT ON COLUMN public.teams.team_type IS
  'Allowed values: club_team, personal_trainer, national_team';

CREATE INDEX IF NOT EXISTS idx_teams_national
  ON public.teams (id) WHERE team_type = 'national_team';

-- 6) Enable RLS on new tables (policies in next migration) -------------------
ALTER TABLE public.player_team_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_data_grants      ENABLE ROW LEVEL SECURITY;
