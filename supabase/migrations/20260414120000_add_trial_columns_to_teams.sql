-- Self-serve onboarding: give every new team a 14-day PRO trial.
-- subscription_status lifecycle: 'trial' -> 'active' (when paid) | 'expired' | 'cancelled'

ALTER TABLE public.teams
  ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS subscription_status TEXT;

ALTER TABLE public.teams
  DROP CONSTRAINT IF EXISTS teams_subscription_status_check;

ALTER TABLE public.teams
  ADD CONSTRAINT teams_subscription_status_check
  CHECK (subscription_status IS NULL OR subscription_status IN ('trial','active','expired','cancelled'));

COMMENT ON COLUMN public.teams.trial_ends_at IS
  'Timestamp when the initial 14-day trial period ends. NULL for legacy teams or teams that never had a trial.';
COMMENT ON COLUMN public.teams.subscription_status IS
  'Subscription lifecycle: trial | active | expired | cancelled. NULL for legacy teams.';
