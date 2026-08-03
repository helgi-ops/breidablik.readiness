-- Daily player-reported tendon markers for the Jumper's Knee protocol:
-- single-leg decline-squat pain (VAS 0-10) + morning stiffness (0-10). Feeds the
-- coach pain-monitoring gate on /coach/jumpers-knee. DESCRIPTIVE ONLY — never
-- touches readiness_entries / the verdict colour.
CREATE TABLE IF NOT EXISTS public.patellar_tendon_checkins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  team_id uuid,
  entry_date date NOT NULL DEFAULT ((now() AT TIME ZONE 'utc'))::date,
  decline_squat_vas smallint CHECK (decline_squat_vas BETWEEN 0 AND 10),
  morning_stiffness_vas smallint CHECK (morning_stiffness_vas BETWEEN 0 AND 10),
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (player_id, entry_date)
);

CREATE INDEX IF NOT EXISTS patellar_tendon_checkins_player_date_idx
  ON public.patellar_tendon_checkins (player_id, entry_date DESC);
CREATE INDEX IF NOT EXISTS patellar_tendon_checkins_team_idx
  ON public.patellar_tendon_checkins (team_id);

ALTER TABLE public.patellar_tendon_checkins ENABLE ROW LEVEL SECURITY;

-- Player manages their own check-ins.
DROP POLICY IF EXISTS ptc_player_manage_own ON public.patellar_tendon_checkins;
CREATE POLICY ptc_player_manage_own ON public.patellar_tendon_checkins
  FOR ALL
  USING (player_id IN (SELECT id FROM public.players WHERE user_id = auth.uid()))
  WITH CHECK (player_id IN (SELECT id FROM public.players WHERE user_id = auth.uid()));

-- Coach/staff/admin can read their own team's check-ins.
DROP POLICY IF EXISTS ptc_coach_read_team ON public.patellar_tendon_checkins;
CREATE POLICY ptc_coach_read_team ON public.patellar_tendon_checkins
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND lower(COALESCE(p.role, '')) = ANY (ARRAY['coach','admin','staff'])
      AND p.team_id = patellar_tendon_checkins.team_id
  ));
