-- Consent versioning: record WHICH version of the data-processing policy a
-- player agreed to, so that when the policy text changes we can re-ask for
-- consent (a consent to an old version no longer satisfies the current one).
--
-- Additive + nullable, no backfill: a NULL policy_version is treated in code as
-- the INITIAL tracked version ("2026-07-15"), so nobody who already consented is
-- re-prompted now — only a real future version bump triggers re-consent. This
-- avoids audit-trigger noise from a mass backfill UPDATE.

ALTER TABLE public.player_consents
  ADD COLUMN IF NOT EXISTS policy_version text;

COMMENT ON COLUMN public.player_consents.policy_version IS
  'Version tag of the policy text the player agreed to (e.g. data-processing summary version). NULL = pre-versioning consent, treated in app as the initial tracked version. When the current version advances beyond what a row carries, the app re-asks for consent.';
