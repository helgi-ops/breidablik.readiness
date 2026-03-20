-- Migration: Add plan_tier to teams table
-- Supports Free/Pro/Elite access control per team

ALTER TABLE teams
  ADD COLUMN IF NOT EXISTS plan_tier TEXT NOT NULL DEFAULT 'FREE'
    CHECK (plan_tier IN ('FREE', 'PRO', 'ELITE'));

COMMENT ON COLUMN teams.plan_tier IS
  'Subscription tier for this team. FREE = basic monitoring, PRO = GPS + coaching tools, ELITE = multi-team + advanced intelligence.';

-- Set Breiðablik to ELITE (production team during development)
UPDATE teams
SET plan_tier = 'ELITE'
WHERE name ILIKE '%breiðablik%' OR name ILIKE '%breidablik%';
