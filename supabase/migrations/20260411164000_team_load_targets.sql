-- ═══════════════════════════════════════════════════════════════════════════
-- Team Load Targets (GPS / External Load)
-- ═══════════════════════════════════════════════════════════════════════════
-- Lets the coach choose how weekly load is compared against a target:
--   1. baseline       — existing behaviour (8-week historical rolling average)
--   2. match_demand   — weekly target built from last-N-matches averages × MD-day template
--   3. coach_weekly   — coach hand-sets a weekly target per KPI
--
-- Plus optional mesocycle multiplier (build / maintain / taper) and ±corridor.
--
-- Grounded in the literature:
--   • Martin-Garcia et al. (2018)  — MD-day distribution relative to match
--   • Akenhead et al. (2016)       — Training:match ratio framework
--   • Stevens et al. (2017)        — Per-KPI demand percentages differ
--   • Impellizzeri / Bornn / Lolli — ACWR limitations → target corridors preferred
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS team_load_targets (
  team_id                     uuid PRIMARY KEY REFERENCES teams(id) ON DELETE CASCADE,

  -- Active mode: which computation path the weekly-load card uses.
  mode                        text NOT NULL DEFAULT 'baseline'
                              CHECK (mode IN ('baseline', 'match_demand', 'coach_weekly')),

  -- ±corridor around the target (e.g. 0.15 = ±15%). Used to colour "on track"
  -- vs "below" vs "above" in the UI.
  corridor_pct                numeric(4,3) NOT NULL DEFAULT 0.15
                              CHECK (corridor_pct >= 0 AND corridor_pct <= 0.5),

  -- Mesocycle overlay. Multiplier is applied to the computed target regardless
  -- of mode, letting the coach dial the whole week up or down during loading,
  -- maintenance or taper phases.
  mesocycle_phase             text
                              CHECK (mesocycle_phase IS NULL OR
                                     mesocycle_phase IN ('build', 'maintain', 'taper')),
  mesocycle_multiplier        numeric(4,3) NOT NULL DEFAULT 1.0
                              CHECK (mesocycle_multiplier BETWEEN 0.3 AND 2.0),

  -- ── coach_weekly mode config ─────────────────────────────────────────────
  -- Hand-set weekly targets per KPI. Shape:
  --   {
  --     "totalDistance":   28000,
  --     "totalPlayerLoad": 1800,
  --     "velocityBand5":    900,
  --     "velocityBand6":    300,
  --     "accelB23":          90,
  --     "decelB23":          90
  --   }
  -- Missing keys fall back to baseline for that metric.
  coach_weekly_targets        jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- ── match_demand mode config ─────────────────────────────────────────────
  -- How far back to look for matches when computing the "average match" baseline.
  match_demand_lookback_days  int NOT NULL DEFAULT 120
                              CHECK (match_demand_lookback_days BETWEEN 14 AND 365),

  -- Optional: minimum distance (m) used as a fallback match-day detector when
  -- schedule metadata (team_schedule_events.event_type='match' or
  -- week_plans.day_type='GAME') is incomplete. Default is sensible for outdoor
  -- 11v11 football.
  match_day_detection_min_td  int NOT NULL DEFAULT 8000
                              CHECK (match_day_detection_min_td BETWEEN 0 AND 15000),

  -- Per-MD-day percentages of match demand, per KPI.
  -- Keys are MD-day strings ("MD-5" ... "MD-1", "MD+1"). Values are objects
  -- mapping metric key → fraction of match demand (1.0 = 100% of match).
  --
  -- Seeded with evidence-based defaults from Martin-Garcia / Akenhead:
  --   - Total distance and player load: held high (extensive) early in week,
  --     tapered towards MD-1.
  --   - HSR (vel band 5) and sprint (vel band 6): held lower than match on all
  --     training days to protect fast-twitch muscles from chronic overload.
  match_demand_template       jsonb NOT NULL DEFAULT '{
    "MD-5": {"totalDistance":1.10,"totalPlayerLoad":1.10,"velocityBand5":0.80,"velocityBand6":0.50,"accelB23":1.00,"decelB23":1.00},
    "MD-4": {"totalDistance":1.15,"totalPlayerLoad":1.15,"velocityBand5":1.00,"velocityBand6":0.70,"accelB23":1.10,"decelB23":1.10},
    "MD-3": {"totalDistance":1.00,"totalPlayerLoad":1.00,"velocityBand5":0.80,"velocityBand6":0.50,"accelB23":0.90,"decelB23":0.90},
    "MD-2": {"totalDistance":0.75,"totalPlayerLoad":0.80,"velocityBand5":0.50,"velocityBand6":0.35,"accelB23":0.60,"decelB23":0.60},
    "MD-1": {"totalDistance":0.50,"totalPlayerLoad":0.55,"velocityBand5":0.30,"velocityBand6":0.20,"accelB23":0.40,"decelB23":0.40},
    "MD+1": {"totalDistance":0.40,"totalPlayerLoad":0.40,"velocityBand5":0.15,"velocityBand6":0.05,"accelB23":0.30,"decelB23":0.30},
    "MD":   {"totalDistance":1.00,"totalPlayerLoad":1.00,"velocityBand5":1.00,"velocityBand6":1.00,"accelB23":1.00,"decelB23":1.00}
  }'::jsonb,

  -- Optional manual overrides for the computed match-average baseline (per KPI).
  -- When set, bypasses the auto-computed average from recent matches.
  match_demand_overrides      jsonb NOT NULL DEFAULT '{}'::jsonb,

  updated_at                  timestamptz NOT NULL DEFAULT now(),
  updated_by                  uuid
);

COMMENT ON TABLE  team_load_targets IS
  'Per-team config for weekly GPS load target computation. See mode column for variants.';
COMMENT ON COLUMN team_load_targets.mode IS
  'Target computation mode: baseline (historical rolling), match_demand (from match averages + MD template), or coach_weekly (hand-set).';
COMMENT ON COLUMN team_load_targets.match_demand_template IS
  'Per-MD-day percentages of match demand, per KPI. Keys: MD-5..MD-1, MD, MD+1. Values: fraction of match (1.0 = 100%).';

-- Enable RLS
ALTER TABLE team_load_targets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "team_load_targets_authenticated_read"
  ON team_load_targets FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "team_load_targets_authenticated_write"
  ON team_load_targets FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "team_load_targets_service_role"
  ON team_load_targets FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Seed Breiðablik with default baseline mode so the row exists.
INSERT INTO team_load_targets (team_id, mode)
VALUES ('94b52a06-0b83-48da-8664-639ec3486a0c', 'baseline')
ON CONFLICT (team_id) DO NOTHING;
