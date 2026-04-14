-- =====================================================================
-- Coach-owned drill library
-- =====================================================================
-- Problem: drill_library is team-scoped only. If a coach leaves
--          coach_teams, they lose access to drills they authored.
--
-- Goal:    A drill can be owned by a COACH (follows them across clubs)
--          or a TEAM (stays with the club). When a coach-owned drill
--          is "shared" with a team, we clone it so the team gets a
--          permanent snapshot while the coach retains the master.
--
-- Design:  owner_type ∈ ('coach','team','public')
--          - 'coach'  → owner_coach_id set,  team_id NULL
--          - 'team'   → team_id set,         owner_coach_id NULL
--          - 'public' → both NULL (system drills)
--          parent_template_id already exists → used as provenance link
--          when cloning coach→team ("shared snapshot").
-- =====================================================================

BEGIN;

-- 1. New columns ------------------------------------------------------
ALTER TABLE public.drill_library
  ADD COLUMN IF NOT EXISTS owner_type text NOT NULL DEFAULT 'team'
    CHECK (owner_type IN ('coach','team','public')),
  ADD COLUMN IF NOT EXISTS owner_coach_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL;

-- Allow team_id to be NULL for coach/public drills
ALTER TABLE public.drill_library
  ALTER COLUMN team_id DROP NOT NULL;

-- 2. Consistency constraint ------------------------------------------
ALTER TABLE public.drill_library
  DROP CONSTRAINT IF EXISTS drill_library_owner_consistency;

ALTER TABLE public.drill_library
  ADD CONSTRAINT drill_library_owner_consistency CHECK (
    (owner_type = 'coach'  AND owner_coach_id IS NOT NULL AND team_id IS NULL)
    OR (owner_type = 'team'   AND team_id IS NOT NULL AND owner_coach_id IS NULL)
    OR (owner_type = 'public' AND team_id IS NULL AND owner_coach_id IS NULL)
  );

-- 3. Backfill: existing rows stay as team-owned ----------------------
-- (owner_type default 'team' + existing team_id satisfies constraint)

-- 4. Indexes ---------------------------------------------------------
CREATE INDEX IF NOT EXISTS drill_library_owner_coach_idx
  ON public.drill_library (owner_coach_id) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS drill_library_owner_type_idx
  ON public.drill_library (owner_type) WHERE deleted_at IS NULL;

-- 5. RLS: replace existing policies with ownership-aware ones --------
DROP POLICY IF EXISTS drill_library_select_coach ON public.drill_library;
DROP POLICY IF EXISTS drill_library_insert_coach ON public.drill_library;
DROP POLICY IF EXISTS drill_library_update_coach ON public.drill_library;
DROP POLICY IF EXISTS drill_library_delete_coach ON public.drill_library;

-- SELECT: see own coach-owned + team drills of teams I coach + public
CREATE POLICY drill_library_select_v2 ON public.drill_library
  FOR SELECT USING (
    deleted_at IS NULL AND (
      owner_type = 'public'
      OR (owner_type = 'coach' AND owner_coach_id = auth.uid())
      OR (owner_type = 'team' AND EXISTS (
        SELECT 1 FROM public.coach_teams ct
        WHERE ct.team_id = drill_library.team_id AND ct.coach_id = auth.uid()
      ))
      OR EXISTS (SELECT 1 FROM public.staff_users su WHERE su.user_id = auth.uid())
    )
  );

-- INSERT: coach-owned as self, team-owned if on coach_teams
CREATE POLICY drill_library_insert_v2 ON public.drill_library
  FOR INSERT WITH CHECK (
    (owner_type = 'coach' AND owner_coach_id = auth.uid())
    OR (owner_type = 'team' AND EXISTS (
      SELECT 1 FROM public.coach_teams ct
      WHERE ct.team_id = drill_library.team_id AND ct.coach_id = auth.uid()
    ))
    OR EXISTS (SELECT 1 FROM public.staff_users su WHERE su.user_id = auth.uid())
  );

-- UPDATE: only the owner (coach for coach-owned; any coach on team for team-owned)
CREATE POLICY drill_library_update_v2 ON public.drill_library
  FOR UPDATE USING (
    (owner_type = 'coach' AND owner_coach_id = auth.uid())
    OR (owner_type = 'team' AND EXISTS (
      SELECT 1 FROM public.coach_teams ct
      WHERE ct.team_id = drill_library.team_id AND ct.coach_id = auth.uid()
    ))
    OR EXISTS (SELECT 1 FROM public.staff_users su WHERE su.user_id = auth.uid())
  );

-- DELETE: same as UPDATE (soft-delete via deleted_at is preferred)
CREATE POLICY drill_library_delete_v2 ON public.drill_library
  FOR DELETE USING (
    (owner_type = 'coach' AND owner_coach_id = auth.uid())
    OR (owner_type = 'team' AND EXISTS (
      SELECT 1 FROM public.coach_teams ct
      WHERE ct.team_id = drill_library.team_id AND ct.coach_id = auth.uid()
    ))
    OR EXISTS (SELECT 1 FROM public.staff_users su WHERE su.user_id = auth.uid())
  );

-- 6. Share-to-team helper --------------------------------------------
-- Clones a coach-owned drill into a team-owned snapshot.
-- parent_template_id preserves provenance so the club can see
-- "this drill came from coach X on date Y".
CREATE OR REPLACE FUNCTION public.share_drill_with_team(
  p_drill_id uuid,
  p_team_id uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  new_id uuid;
  src public.drill_library%ROWTYPE;
BEGIN
  -- Must be a coach on the target team
  IF NOT EXISTS (
    SELECT 1 FROM public.coach_teams ct
    WHERE ct.team_id = p_team_id AND ct.coach_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'not_authorized_for_team';
  END IF;

  -- Source must be coach-owned by caller
  SELECT * INTO src FROM public.drill_library
  WHERE id = p_drill_id
    AND owner_type = 'coach'
    AND owner_coach_id = auth.uid()
    AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'source_not_found_or_not_owned';
  END IF;

  INSERT INTO public.drill_library (
    team_id, owner_type, owner_coach_id, parent_template_id,
    category, drill_name, description, drill_format,
    field_length_m, field_width_m, total_players, reps,
    field_area_m2, area_per_player_m2, duration_min, distance_m,
    vel_b5, vel_b6, hir_total, player_load, player_load_per_min,
    accel_b23, decel_b23, source, created_by, diagram_url
  ) VALUES (
    p_team_id, 'team', NULL, src.id,
    src.category, src.drill_name, src.description, src.drill_format,
    src.field_length_m, src.field_width_m, src.total_players, src.reps,
    src.field_area_m2, src.area_per_player_m2, src.duration_min, src.distance_m,
    src.vel_b5, src.vel_b6, src.hir_total, src.player_load, src.player_load_per_min,
    src.accel_b23, src.decel_b23, 'shared_from_coach', auth.uid(), src.diagram_url
  )
  RETURNING id INTO new_id;

  RETURN new_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.share_drill_with_team(uuid, uuid) TO authenticated;

COMMIT;

-- =====================================================================
-- FOLLOW-UP (not in this migration, track separately):
--   - UI: Add "Mitt safn" / "Liðasafn" / "Almennt" tabs
--   - UI: "Afrita í mitt safn" action for coaches to personalize team drills
--   - UI: "Deila með liði" action that calls share_drill_with_team()
--   - Backfill policy: give existing coaches an option to claim
--     team drills they authored (created_by = them) into their coach library
-- =====================================================================
